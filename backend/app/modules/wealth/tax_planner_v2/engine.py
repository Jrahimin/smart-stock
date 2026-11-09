"""Pure, deterministic assessment-year calculation from one immutable rules pack."""

from datetime import date
from decimal import ROUND_CEILING, ROUND_HALF_UP, Context, Decimal, localcontext

from .contracts import (
    AnnualStatus,
    ConfirmedEligibleTotal,
    CreditLine,
    DeductionLine,
    EligibleTotalScenario,
    Guidance,
    IncomeLine,
    InvestmentLine,
    ItemizedScenario,
    PlanningCategoryTotals,
    RebateResult,
    ScenarioInput,
    ScenarioResult,
    SettlementStatus,
    SlabLine,
    TaxBreakdown,
    TaxCalculationRequest,
    TaxCalculationResponse,
)
from .normalization import (
    HUNDRED,
    ZERO,
    InvestmentNormalizer,
    Notes,
    normalize_deductions,
    normalize_income,
)
from .rules import RulePack

CENT = Decimal("0.01")
CALCULATION_CONTEXT = Context(prec=40, rounding=ROUND_HALF_UP)
_COVERAGE_RULES = {
    "wealth_surcharge": "scope.wealth_and_vehicle",
    "environmental_surcharge": "scope.wealth_and_vehicle",
    "personal_vehicle_advance_tax": "scope.wealth_and_vehicle",
    "commercial_vehicle_or_vessel": "scope.wealth_and_vehicle",
    "foreign_or_treaty_income": "scope.individual",
    "unresolved_special_income": "scope.individual",
    "losses_or_setoff": "scope.individual",
    "turnover_or_special_sector": "scope.turnover",
    "prior_rebate_recovery": "scope.early_encashment",
}


def _q(amount: Decimal) -> Decimal:
    return amount.quantize(CENT, rounding=ROUND_HALF_UP)


def _screen(request: TaxCalculationRequest, notes: Notes) -> None:
    profile = request.profile
    if profile.entity != "individual" or profile.residence != "resident":
        notes.missing(
            "resident_individual_scope_needed",
            "scope.individual",
            "profile",
            unsupported=profile.entity != "individual" or profile.residence == "non_resident",
        )
    for field, rule in _COVERAGE_RULES.items():
        answer = getattr(request.coverage, field)
        if answer != "no":
            notes.missing(
                f"coverage_{field}_{answer}",
                rule,
                f"coverage.{field}",
                unsupported=answer == "yes"
                and field
                in {
                    "foreign_or_treaty_income",
                    "commercial_vehicle_or_vessel",
                    "losses_or_setoff",
                },
            )


def _allowance(
    request: TaxCalculationRequest, pack: RulePack, notes: Notes
) -> tuple[str, Decimal, Decimal]:
    profile = request.profile
    thresholds = pack.thresholds
    if profile.gazetted_war_wounded_freedom_fighter or profile.gazetted_injured_july_2024_warrior:
        category = "gazetted_war_wounded_or_injured_july_warrior"
    elif profile.disability or profile.third_gender:
        category = "disability_or_third_gender"
    elif profile.woman or profile.senior_qualified_for_year == "yes":
        category = "woman_or_senior"
    else:
        category = "general"
        if profile.senior_qualified_for_year == "unknown":
            notes.missing(
                "senior_qualification_needed",
                "profile.allowance",
                "profile.senior_qualified_for_year",
            )
    dependent = ZERO
    if profile.eligible_disabled_dependents:
        if profile.no_duplicate_dependent_claim == "yes":
            dependent = (
                thresholds.disabled_dependent_addition * profile.eligible_disabled_dependents
            )
        elif profile.no_duplicate_dependent_claim == "unknown":
            notes.missing(
                "dependent_claim_confirmation_needed",
                "profile.allowance",
                "profile.no_duplicate_dependent_claim",
            )
        else:
            notes.exclude(
                "dependent_duplicate_claim_excluded",
                "profile.allowance",
                "profile.no_duplicate_dependent_claim",
            )
    return category, dependent, getattr(thresholds, category) + dependent


def _slabs(
    income: Decimal, allowance: Decimal, pack: RulePack
) -> tuple[Decimal, tuple[SlabLine, ...]]:
    exempt_amount = min(income, allowance)
    remaining = income - exempt_amount
    lines = [SlabLine(band=0, taxable_amount=_q(exempt_amount), rate=ZERO, tax=_q(ZERO))]
    total_tax = ZERO
    consumed_income = exempt_amount
    for index, band in enumerate(pack.taxable_bands, start=1):
        if not remaining:
            break
        amount = remaining if band.width is None else min(remaining, band.width)
        tax = amount * band.rate / HUNDRED
        lines.append(
            SlabLine(
                band=index,
                taxable_amount=_q(consumed_income + amount) - _q(consumed_income),
                rate=band.rate,
                tax=_q(total_tax + tax) - _q(total_tax),
            )
        )
        consumed_income += amount
        total_tax += tax
        remaining -= amount
    return total_tax, tuple(lines)


def _investments(
    request: TaxCalculationRequest, pack: RulePack, notes: Notes, scenario: ScenarioInput | None
) -> tuple[InvestmentLine, ...]:
    normalized = []
    normalizer = InvestmentNormalizer(pack, notes)
    if isinstance(request.investments, ConfirmedEligibleTotal):
        notes.assume(
            "user_confirmed_eligible_investment_total", "rebate.general", "investments.amount"
        )
        normalized.append(
            InvestmentLine(
                id="confirmed_total",
                category="confirmed_eligible_total",
                entered_amount=request.investments.amount,
                eligible_amount=request.investments.amount,
                excluded_amount=ZERO,
            )
        )
    elif isinstance(request.investments, PlanningCategoryTotals):
        normalized.extend(
            normalizer.planning_amount(item, f"investments.entries.{index}")
            for index, item in enumerate(request.investments.entries)
        )
        if request.filing is not None and any(item.amount for item in request.investments.entries):
            notes.missing(
                "planning_investments_need_filing_verification", "rebate.general",
                "investments", settlement=True,
            )
    else:
        normalized.extend(
            normalizer.normalize(item, f"investments.entries.{index}")
            for index, item in enumerate(request.investments.entries)
        )
    if isinstance(scenario, ItemizedScenario):
        normalized.append(normalizer.normalize(scenario.entry, "scenario.entry"))
    elif isinstance(scenario, EligibleTotalScenario):
        eligible = ZERO
        codes: tuple[str, ...] = ()
        if pack.includes_income_date(scenario.contributed_on):
            eligible = scenario.amount
            notes.assume(
                "scenario_confirmed_increment_after_caps", "rebate.general", "scenario.amount"
            )
        else:
            codes = (
                notes.exclude(
                    "contribution_outside_period", "rebate.general", "scenario.contributed_on"
                ),
            )
        normalized.append(
            InvestmentLine(
                id="confirmed_scenario",
                category="confirmed_eligible_total",
                entered_amount=scenario.amount,
                eligible_amount=eligible,
                excluded_amount=scenario.amount - eligible,
                reason_codes=codes,
            )
        )
    return tuple(normalized)


def _minimum_tax(
    request: TaxCalculationRequest,
    pack: RulePack,
    notes: Notes,
    *,
    triggered: bool,
    post_rebate: Decimal,
) -> tuple[Decimal | None, str]:
    if not triggered:
        return ZERO, "below_or_at_threshold"
    if request.profile.new_taxpayer_floor == "yes":
        return pack.minimum_tax.eligible_new_taxpayer, "eligible_new_taxpayer"
    if request.profile.new_taxpayer_floor == "no":
        return pack.minimum_tax.ordinary, "national_default"
    if pack.minimum_tax.eligible_new_taxpayer == pack.minimum_tax.ordinary:
        return pack.minimum_tax.ordinary, "identical_floors"
    if post_rebate < pack.minimum_tax.ordinary:
        notes.missing(
            "new_taxpayer_floor_confirmation_needed", "tax.minimum", "profile.new_taxpayer_floor"
        )
    notes.guidance.append(
        Guidance(
            message_id="conditional_minimum_tax",
            rule_id="tax.minimum",
            field_path="profile.new_taxpayer_floor",
            values=(
                ("ordinary_floor", str(pack.minimum_tax.ordinary)),
                ("eligible_new_taxpayer_floor", str(pack.minimum_tax.eligible_new_taxpayer)),
            ),
        )
    )
    return None, "new_taxpayer_status_unknown"


def _rebate(
    pack: RulePack,
    *,
    income: Decimal,
    eligible: Decimal,
) -> tuple[Decimal, Decimal, Decimal, Decimal]:
    income_limit = income * pack.rebate.income_rate / HUNDRED
    investment_limit = eligible * pack.rebate.investment_rate / HUNDRED
    cap = pack.rebate.statutory_cap
    return income_limit, investment_limit, cap, min(income_limit, investment_limit, cap)


def _rebate_result(
    limits: tuple[Decimal, Decimal, Decimal, Decimal],
    *,
    gross_tax: Decimal,
    liability: Decimal | None,
    eligible: Decimal,
    floor: Decimal | None,
    investment_rate: Decimal,
) -> RebateResult:
    income_limit, investment_limit, cap, entitlement = limits
    effective = unused = unused_due_floor = statutory_target = usable_target = potential_saving = (
        None
    )
    liability_rounding = None
    if liability is not None:
        before_rebate = max(gross_tax, floor or ZERO)
        raw_effective = before_rebate - liability
        effective = _q(raw_effective)
        liability_rounding = _q(liability) - (_q(before_rebate) - effective)
        unused = _q(entitlement) - effective
        unused_due_floor = _q(min(entitlement, gross_tax) - raw_effective)
        if investment_rate:
            statutory_limit = min(income_limit, cap)
            statutory_target = max(
                (statutory_limit * HUNDRED / investment_rate - eligible).quantize(
                    CENT, rounding=ROUND_CEILING
                ),
                ZERO,
            )
            if floor is not None:
                usable_limit = min(statutory_limit, max(gross_tax - floor, ZERO))
                potential_saving = _q(max(usable_limit - entitlement, ZERO))
                if potential_saving:
                    usable_target = max(
                        (usable_limit * HUNDRED / investment_rate - eligible).quantize(
                            CENT, rounding=ROUND_CEILING
                        ),
                        ZERO,
                    )
    return RebateResult(
        income_limit=_q(income_limit),
        investment_limit=_q(investment_limit),
        statutory_cap=_q(cap),
        entitlement=_q(entitlement),
        effective_tax_reduction=effective,
        liability_rounding_adjustment=liability_rounding,
        unused_entitlement=unused,
        unused_due_to_floor=unused_due_floor,
        additional_eligible_investment_for_statutory_limit=statutory_target,
        additional_eligible_investment_for_lowest_usable_liability=usable_target,
        potential_additional_tax_saving=potential_saving,
    )


def _credits(
    request: TaxCalculationRequest, pack: RulePack, income: tuple[IncomeLine, ...], notes: Notes
) -> tuple[CreditLine, ...]:
    sources = {item.id: item for item in income}
    lines = []
    for index, credit in enumerate(request.credits):
        reason = None
        path = f"credits.{index}"
        source = sources.get(credit.income_id)
        if credit.assessment_year != request.assessment_year:
            reason = notes.exclude("credit_for_another_assessment_year", "credit.advance", path)
        elif credit.kind in {"final_or_restricted", "unclassified"} or (
            source and source.classification not in {"ordinary", "special_rate"}
        ):
            reason = notes.missing(
                "credit_source_restriction_review", "credit.advance", path, settlement=True
            )
        elif credit.paid_on < pack.income_period_start or (
            request.filing and credit.paid_on > request.filing.filing_date
        ):
            reason = notes.missing(
                "credit_payment_date_review", "credit.advance", path, settlement=True
            )
        elif credit.qualifying_claim_confirmed != "yes":
            reason = notes.missing(
                "credit_claim_confirmation_needed", "credit.advance", path, settlement=True
            )
        lines.append(
            CreditLine(
                id=credit.id,
                kind=credit.kind,
                income_id=credit.income_id,
                entered_amount=_q(credit.amount),
                allowed_amount=_q(ZERO if reason else credit.amount),
                restricted_amount=_q(credit.amount if reason else ZERO),
                reason_codes=(reason,) if reason else (),
            )
        )
    return tuple(lines)


def _settlement(
    request: TaxCalculationRequest,
    pack: RulePack,
    notes: Notes,
    *,
    liability: Decimal | None,
    credits: Decimal,
) -> tuple[
    SettlementStatus, Decimal | None, Decimal | None, str | None, Decimal | None, Decimal | None
]:
    if not pack.supports_settlement:
        return "not_available_for_year", None, None, None, None, None
    if request.filing is None:
        return "not_requested", None, None, None, None, None
    if request.credits_completeness == "unknown":
        notes.missing(
            "credits_completeness_needed", "credit.advance", "credits_completeness", settlement=True
        )
    filing = request.filing
    exceptions = (
        ("profile.first_return", request.profile.first_return),
        ("filing.return_from_abroad_exception", filing.return_from_abroad_exception),
        ("filing.extension_or_other_exception", filing.extension_or_other_exception),
    )
    for path, answer in exceptions:
        if answer != "no":
            notes.missing(
                f"{path.rsplit('.', 1)[-1]}_review", "filing.windows", path, settlement=True
            )
    window = next(
        (item for item in pack.filing_windows if item.start <= filing.filing_date <= item.end), None
    )
    if window is None:
        notes.missing(
            "filing_date_outside_supported_windows",
            "filing.windows",
            "filing.filing_date",
            settlement=True,
        )
    if liability is None or notes.settlement_missing or window is None:
        return "needs_review", None, None, None, None, None

    balance = max(liability - credits, ZERO)
    excess = max(credits - liability, ZERO)
    if window.policy != "neutral" and not balance:
        notes.missing(
            "nonpositive_balance_window_review",
            "filing.windows",
            "filing.filing_date",
            settlement=True,
        )
        return "needs_review", _q(balance), None, window.policy, None, _q(excess)
    adjustment = ZERO
    if window.policy == "incentive":
        adjustment = -min(balance * window.rate / HUNDRED, window.limit)
    elif window.policy == "additional_tax":
        adjustment = max(balance * window.rate / HUNDRED, window.limit)
    payable = _q(balance + adjustment)
    return "complete", _q(balance), payable - _q(balance), window.policy, payable, _q(excess)


def _display_income(lines: tuple[IncomeLine, ...], ordinary_tax: Decimal) -> tuple[IncomeLine, ...]:
    # Allocate cent differences cumulatively so shown subtotals match their lines.
    deductions = ZERO
    special_tax = ordinary_tax
    result = []
    for item in lines:
        shown_deduction = _q(deductions + item.deductible_amount) - _q(deductions)
        deductions += item.deductible_amount
        shown_tax = _q(special_tax + item.special_tax) - _q(special_tax)
        special_tax += item.special_tax
        taxable = (
            item.entered_amount - item.excluded_amount - shown_deduction
            if item.classification in {"ordinary", "special_rate"}
            else ZERO
        )
        result.append(
            item.model_copy(
                update={
                    "entered_amount": _q(item.entered_amount),
                    "excluded_amount": _q(item.excluded_amount),
                    "deductible_amount": shown_deduction,
                    "taxable_amount": _q(taxable),
                    "special_tax": shown_tax,
                }
            )
        )
    return tuple(result)


def _display_investments(lines: tuple[InvestmentLine, ...]) -> tuple[InvestmentLine, ...]:
    total = ZERO
    result = []
    for item in lines:
        shown_eligible = _q(total + item.eligible_amount) - _q(total)
        total += item.eligible_amount
        result.append(
            item.model_copy(
                update={
                    "entered_amount": _q(item.entered_amount),
                    "eligible_amount": shown_eligible,
                    "excluded_amount": _q(item.entered_amount) - shown_eligible,
                }
            )
        )
    return tuple(result)


def _display_deductions(
    lines: tuple[DeductionLine, ...], gross_ordinary: Decimal
) -> tuple[DeductionLine, ...]:
    remaining = gross_ordinary
    result = []
    for item in lines:
        shown_amount = _q(remaining) - _q(remaining - item.allowed_amount)
        remaining -= item.allowed_amount
        result.append(
            item.model_copy(
                update={
                    "entered_amount": _q(item.entered_amount),
                    "allowed_amount": shown_amount,
                }
            )
        )
    return tuple(result)


def _calculate(
    request: TaxCalculationRequest, pack: RulePack, scenario: ScenarioInput | None
) -> TaxBreakdown:
    notes = Notes()
    _screen(request, notes)
    category, dependents, allowance = _allowance(request, pack, notes)
    income = normalize_income(request, pack, notes)
    gross_ordinary = sum(
        (item.taxable_amount for item in income if item.classification == "ordinary"), ZERO
    )
    special_income = sum(
        (item.taxable_amount for item in income if item.classification == "special_rate"), ZERO
    )
    deductions = normalize_deductions(
        request, pack, notes, gross_ordinary=gross_ordinary, special_income=special_income
    )
    ordinary = gross_ordinary - sum((item.allowed_amount for item in deductions), ZERO)
    ordinary_tax, slabs = _slabs(ordinary, allowance, pack)
    special_tax = sum((item.special_tax for item in income), ZERO)
    gross_tax = ordinary_tax + special_tax
    investments = _investments(request, pack, notes, scenario)
    eligible = sum((item.eligible_amount for item in investments), ZERO)
    limits = _rebate(pack, income=ordinary, eligible=eligible)
    after_rebate = max(gross_tax - limits[-1], ZERO)
    triggered = ordinary + special_income > allowance
    floor, floor_policy = _minimum_tax(
        request, pack, notes, triggered=triggered, post_rebate=after_rebate
    )
    annual_status: AnnualStatus = "complete"
    if notes.unsupported:
        annual_status = "unsupported"
    elif notes.annual_missing:
        annual_status = "needs_review"
    liability = max(after_rebate, floor or ZERO) if annual_status == "complete" else None
    rebate = _rebate_result(
        limits,
        gross_tax=gross_tax,
        liability=liability,
        eligible=eligible,
        floor=floor,
        investment_rate=pack.rebate.investment_rate,
    )
    credit_lines = _credits(request, pack, income, notes)
    allowed_credits = sum((item.allowed_amount for item in credit_lines), ZERO)
    status, balance, adjustment, adjustment_code, payable, excess = _settlement(
        request, pack, notes, liability=liability, credits=allowed_credits
    )
    top_up = _q(liability) - _q(after_rebate) if liability is not None else None
    if top_up:
        notes.guidance.append(
            Guidance(
                message_id="minimum_tax_binding",
                rule_id="tax.minimum",
                values=(("top_up", str(top_up)),),
            )
        )
    return TaxBreakdown(
        annual_status=annual_status,
        settlement_status=status,
        missing_facts=(*notes.annual_missing, *notes.settlement_missing),
        exclusions=tuple(notes.exclusions),
        assumptions=tuple(notes.assumptions),
        guidance=tuple(notes.guidance),
        income=_display_income(income, ordinary_tax),
        income_deductions=_display_deductions(deductions, gross_ordinary),
        ordinary_income=_q(ordinary),
        special_rate_income=_q(special_income),
        rebate_income_base=_q(ordinary),
        applied_profile=category,
        dependent_allowance=_q(dependents),
        allowance=_q(allowance),
        ordinary_income_above_allowance=_q(max(ordinary - allowance, ZERO)),
        slabs=slabs,
        ordinary_tax=_q(ordinary_tax),
        special_tax=_q(gross_tax) - _q(ordinary_tax),
        gross_tax=_q(gross_tax),
        post_rebate_tax=_q(after_rebate) if liability is not None else None,
        investments=_display_investments(investments),
        eligible_investment=_q(eligible),
        rebate=rebate,
        minimum_tax_amount=_q(floor) if floor is not None else None,
        minimum_tax_triggered=triggered if liability is not None else None,
        minimum_tax_binding=bool(top_up) if top_up is not None else None,
        minimum_tax_top_up=top_up,
        minimum_tax_policy=floor_policy,
        annual_liability=_q(liability) if liability is not None else None,
        credits=credit_lines,
        allowed_credits=_q(allowed_credits),
        restricted_credits=_q(sum((item.restricted_amount for item in credit_lines), ZERO)),
        section_173_balance=balance,
        filing_adjustment=adjustment,
        filing_adjustment_code=adjustment_code,
        estimated_payable=payable,
        excess_credits=excess,
    )


def _scenario(
    request: TaxCalculationRequest,
    pack: RulePack,
    base: TaxBreakdown,
    scenario: ScenarioInput,
    as_of: date,
) -> ScenarioResult:
    compared = _calculate(request, pack, scenario)
    if base.annual_liability is None or compared.annual_liability is None:
        annual_saving = None
        reason = "scenario_scope_review"
    else:
        annual_saving = base.annual_liability - compared.annual_liability
        increment = compared.investments[-1]
        if increment.eligible_amount <= 0:
            reason = (
                increment.reason_codes[0] if increment.reason_codes else "no_eligible_increment"
            )
        elif annual_saving <= 0:
            reason = (
                "minimum_tax_binding"
                if compared.minimum_tax_binding
                else "no_additional_usable_rebate"
            )
        else:
            reason = increment.reason_codes[0] if increment.reason_codes else None
    settlement_saving = (
        base.estimated_payable - compared.estimated_payable
        if base.estimated_payable is not None and compared.estimated_payable is not None
        else None
    )
    contributed_on = (
        scenario.entry.contributed_on
        if isinstance(scenario, ItemizedScenario)
        else scenario.contributed_on
    )
    return ScenarioResult(
        breakdown=compared,
        eligible_increment=compared.eligible_investment - base.eligible_investment,
        annual_saving=annual_saving,
        settlement_saving=settlement_saving,
        limiting_reason=reason,
        is_historical=contributed_on < as_of,
    )


def calculate_tax(
    request: TaxCalculationRequest, pack: RulePack, *, revision_id: str, as_of: date
) -> TaxCalculationResponse:
    if (
        request.assessment_year != pack.assessment_year
        or request.expected_ruleset_revision != revision_id
    ):
        raise ValueError("The calculation must use the requested assessment year and revision")
    with localcontext(CALCULATION_CONTEXT):
        base = _calculate(request, pack, None)
        scenario = (
            _scenario(request, pack, base, request.scenario, as_of)
            if request.scenario is not None
            else None
        )
        period_status = "open"
        if as_of < pack.income_period_start:
            period_status = "future"
        elif as_of > pack.income_period_end:
            period_status = "closed"
        return TaxCalculationResponse(
            assessment_year=pack.assessment_year,
            income_period_start=pack.income_period_start,
            income_period_end=pack.income_period_end,
            income_period_status=period_status,
            revision_id=revision_id,
            content_hash=pack.content_hash(),
            engine_policy_version=pack.engine_policy_version,
            rules_reviewed_on=pack.reviewed_on,
            as_of=as_of,
            purpose=request.purpose,
            base=base,
            scenario=scenario,
        )
