from dataclasses import dataclass, field
from decimal import Decimal

from .contracts import (
    BusinessIncome,
    DeductionLine,
    FinancialIncome,
    Guidance,
    IncomeEntry,
    IncomeLine,
    InvestmentEntry,
    InvestmentLine,
    PlanningCategoryAmount,
    ListedGain,
    PrecomputedIncome,
    PrivateEmployment,
    TaxCalculationRequest,
    UnsupportedIncome,
)
from .rules import CATEGORY_POLICIES, RulePack

ZERO = Decimal("0")
HUNDRED = Decimal("100")


@dataclass
class Notes:
    annual_missing: list[Guidance] = field(default_factory=list)
    settlement_missing: list[Guidance] = field(default_factory=list)
    exclusions: list[Guidance] = field(default_factory=list)
    assumptions: list[Guidance] = field(default_factory=list)
    guidance: list[Guidance] = field(default_factory=list)
    unsupported: bool = False

    def missing(
        self,
        message: str,
        rule: str,
        path: str,
        *,
        settlement: bool = False,
        unsupported: bool = False,
    ) -> str:
        destination = self.settlement_missing if settlement else self.annual_missing
        destination.append(Guidance(message_id=message, rule_id=rule, field_path=path))
        self.unsupported |= unsupported
        return message

    def exclude(self, message: str, rule: str, path: str) -> str:
        self.exclusions.append(Guidance(message_id=message, rule_id=rule, field_path=path))
        return message

    def assume(self, message: str, rule: str, path: str) -> None:
        self.assumptions.append(Guidance(message_id=message, rule_id=rule, field_path=path))


def _income_line(
    item: IncomeEntry,
    *,
    classification: str = "ordinary",
    excluded: Decimal = ZERO,
    deductible: Decimal = ZERO,
    special_tax: Decimal = ZERO,
    reason: str | None = None,
) -> IncomeLine:
    taxable = (
        item.amount - excluded - deductible
        if classification in {"ordinary", "special_rate"}
        else ZERO
    )
    return IncomeLine(
        id=item.id,
        kind=item.kind,
        classification=classification,
        entered_amount=item.amount,
        excluded_amount=excluded,
        deductible_amount=deductible,
        taxable_amount=taxable,
        special_tax=special_tax,
        reason_codes=(reason,) if reason else (),
    )


def _qualifies_listed_gain(item: ListedGain) -> bool:
    return (
        item.realized == "yes"
        and item.qualifying_disposal_confirmed == "yes"
        and item.sponsor_director_or_placement_holder == "no"
        and item.instrument in {"listed_share", "eligible_listed_fund"}
    )


def normalize_income(
    request: TaxCalculationRequest, pack: RulePack, notes: Notes
) -> tuple[IncomeLine, ...]:
    in_period = [
        item
        for item in request.income
        if item.earned_on is None or pack.includes_income_date(item.earned_on)
    ]
    gross_private = any(
        isinstance(item, PrivateEmployment) and item.basis == "gross" and item.amount
        for item in in_period
    )
    precomputed_private = any(
        isinstance(item, PrivateEmployment) and item.basis == "precomputed_taxable" and item.amount
        for item in in_period
    )
    gross_receipts = sum(
        (item.gross_receipts or ZERO for item in in_period if isinstance(item, BusinessIncome)),
        ZERO,
    )
    exempt_salary_left = pack.employment_exemption_cap
    exempt_gain_left = pack.listed_gain_exemption
    total_qualified_listed_gain = sum(
        (
            item.amount
            for item in in_period
            if isinstance(item, ListedGain) and _qualifies_listed_gain(item)
        ),
        ZERO,
    )
    normalized: list[IncomeLine] = []
    for index, item in enumerate(request.income):
        path = f"income.{index}"
        if item.earned_on is not None and not pack.includes_income_date(item.earned_on):
            reason = notes.exclude("income_outside_period", "income.ordinary", path)
            normalized.append(
                _income_line(item, classification="exempt", excluded=item.amount, reason=reason)
            )
        elif isinstance(item, PrivateEmployment):
            if gross_private and precomputed_private:
                reason = notes.missing("mixed_private_salary_bases", "income.employment", path)
                normalized.append(_income_line(item, classification="unresolved", reason=reason))
            elif item.basis == "precomputed_taxable":
                notes.assume("precomputed_taxable_income", "income.employment", path)
                normalized.append(_income_line(item))
            elif item.benefits_valuation_complete != "yes":
                reason = notes.missing(
                    "employment_benefit_valuation_needed", "income.employment", path
                )
                normalized.append(_income_line(item, classification="unresolved", reason=reason))
            else:
                excluded = item.excluded_group_insurance_benefit
                exemption = min((item.amount - excluded) / 3, exempt_salary_left)
                exempt_salary_left -= exemption
                normalized.append(_income_line(item, excluded=excluded, deductible=exemption))
        elif isinstance(item, PrecomputedIncome):
            rule = (
                "income.employment" if item.kind == "government_employment" else "income.ordinary"
            )
            if item.ordinary_treatment_confirmed != "yes":
                reason = notes.missing("precomputed_ordinary_treatment_unconfirmed", rule, path)
                normalized.append(_income_line(item, classification="unresolved", reason=reason))
            else:
                notes.assume("precomputed_taxable_income", rule, path)
                normalized.append(_income_line(item))
        elif isinstance(item, BusinessIncome):
            if (
                item.ordinary_treatment_confirmed != "yes"
                or item.gross_receipts is None
                or item.business_type != "ordinary"
                or gross_receipts > pack.ordinary_turnover_zero_rate_ceiling
            ):
                reason = notes.missing("business_turnover_or_regime_review", "scope.turnover", path)
                normalized.append(_income_line(item, classification="unresolved", reason=reason))
            else:
                notes.assume("precomputed_taxable_income", "scope.turnover", path)
                normalized.append(_income_line(item))
        elif isinstance(item, FinancialIncome):
            dividend = item.kind == "domestic_dividend"
            rule = "income.dividend" if dividend else "income.ordinary"
            if item.eligible_treatment_confirmed != "yes":
                reason = notes.missing("financial_income_treatment_unconfirmed", rule, path)
                normalized.append(_income_line(item, classification="unresolved", reason=reason))
            else:
                deductible = ZERO
                for expense_index, expense in enumerate(item.expenses):
                    expense_path = f"{path}.expenses.{expense_index}"
                    if not expense.amount:
                        continue
                    if expense.qualification == "no" or (
                        dividend and expense.kind == "bank_or_finance_charge"
                    ):
                        notes.exclude("financial_expense_not_eligible", rule, expense_path)
                    elif expense.qualification == "unknown":
                        notes.missing(
                            "financial_expense_qualification_needed",
                            rule,
                            f"{expense_path}.qualification",
                        )
                    else:
                        deductible += expense.amount
                if deductible > item.amount:
                    reason = notes.missing(
                        "financial_expense_loss_review", rule, f"{path}.expenses"
                    )
                    normalized.append(
                        _income_line(item, classification="unresolved", reason=reason)
                    )
                else:
                    normalized.append(
                        _income_line(
                            item,
                            deductible=deductible,
                            classification="special_rate" if dividend else "ordinary",
                            special_tax=(item.amount - deductible) * pack.dividend_rate / HUNDRED
                            if dividend
                            else ZERO,
                        )
                    )
        elif isinstance(item, ListedGain):
            if item.realized == "no":
                reason = notes.exclude("unrealized_gain_excluded", "income.listed_gain", path)
                normalized.append(
                    _income_line(item, classification="exempt", excluded=item.amount, reason=reason)
                )
            elif not _qualifies_listed_gain(item):
                reason = notes.missing(
                    "listed_disposal_qualification_needed", "income.listed_gain", path
                )
                normalized.append(_income_line(item, classification="unresolved", reason=reason))
            elif (
                item.amount
                and item.instrument == "eligible_listed_fund"
                and total_qualified_listed_gain > pack.listed_gain_exemption
                and item.fund_excess_special_rate_confirmed != "yes"
            ):
                reason = notes.missing(
                    "fund_gain_excess_rate_review",
                    "income.listed_gain",
                    f"{path}.fund_excess_special_rate_confirmed",
                )
                normalized.append(_income_line(item, classification="unresolved", reason=reason))
            else:
                exempt = min(item.amount, exempt_gain_left)
                exempt_gain_left -= exempt
                normalized.append(
                    _income_line(
                        item,
                        classification="special_rate",
                        excluded=exempt,
                        special_tax=(item.amount - exempt) * pack.listed_gain_rate / HUNDRED,
                        reason="listed_gain_exemption" if exempt else None,
                    )
                )
        elif isinstance(item, UnsupportedIncome):
            restricted = item.kind in {"final_tax", "restricted_tax"}
            reason = notes.missing(
                f"income_review_{item.kind}",
                "scope.individual",
                path,
                unsupported=item.kind
                in {
                    "foreign",
                    "property_gain",
                    "precious_metal_gain",
                    "partnership_or_aop",
                    "final_tax",
                    "restricted_tax",
                },
            )
            normalized.append(
                _income_line(
                    item,
                    classification="final_or_restricted" if restricted else "unresolved",
                    reason=reason,
                )
            )
    return tuple(normalized)


def normalize_deductions(
    request: TaxCalculationRequest,
    pack: RulePack,
    notes: Notes,
    *,
    gross_ordinary: Decimal,
    special_income: Decimal,
) -> tuple[DeductionLine, ...]:
    remaining_ordinary = gross_ordinary
    claimed_total = sum(
        (
            item.amount
            for item in request.income_deductions
            if pack.includes_income_date(item.paid_on) and item.qualified_bank_transfer == "yes"
        ),
        ZERO,
    )
    deduction_ceiling = (gross_ordinary + special_income) * pack.part2_donation_limit_rate / HUNDRED
    shared_limit_unresolved = claimed_total and request.coverage.other_part2_donation_claims != "no"
    if shared_limit_unresolved:
        notes.missing(
            "part2_other_donation_claims_review",
            "deduction.czm",
            "coverage.other_part2_donation_claims",
        )
    deductions = []
    for index, item in enumerate(request.income_deductions):
        allowed = ZERO
        reason = None
        path = f"income_deductions.{index}"
        if not pack.includes_income_date(item.paid_on):
            reason = notes.exclude("deduction_outside_period", "deduction.czm", path)
        elif item.qualified_bank_transfer == "unknown":
            reason = notes.missing("czm_qualified_transfer_needed", "deduction.czm", path)
        elif item.qualified_bank_transfer == "no":
            reason = notes.exclude("czm_unqualified_transfer", "deduction.czm", path)
        elif item.amount and shared_limit_unresolved:
            reason = "part2_other_donation_claims_review"
        elif item.amount and claimed_total > deduction_ceiling:
            # Section 77(2) makes the aggregate limit a condition. A claim over
            # the limit needs review before the planner can show a full liability.
            reason = notes.missing("part2_donation_limit_exceeded", "deduction.czm", path)
        else:
            allowed = min(item.amount, remaining_ordinary)
            remaining_ordinary -= allowed
            if allowed < item.amount:
                if special_income:
                    reason = notes.missing(
                        "czm_special_income_allocation_needed", "deduction.czm", path
                    )
                else:
                    reason = notes.exclude("czm_exceeds_ordinary_income", "deduction.czm", path)
        deductions.append(
            DeductionLine(
                id=item.id,
                entered_amount=item.amount,
                allowed_amount=allowed,
                reason_codes=(reason,) if reason else (),
            )
        )
    return tuple(deductions)


class InvestmentNormalizer:
    def __init__(self, pack: RulePack, notes: Notes) -> None:
        self.pack = pack
        self.notes = notes
        self.remaining = {
            "dps": pack.dps_cap,
            "government_securities": pack.government_securities_cap,
        }
        self.insurance_remaining: dict[str, Decimal] = {}
        self.approvals = {item.id: item for item in pack.donation_approvals}

    def normalize(self, item: InvestmentEntry, path: str) -> InvestmentLine:
        policy, cap_group, rule = CATEGORY_POLICIES[item.category]
        eligible = ZERO
        if item.premature_encashment != "no":
            reason = self.notes.missing(
                "premature_encashment_review", "scope.early_encashment", path
            )
        elif not self.pack.includes_income_date(item.contributed_on):
            reason = self.notes.exclude("contribution_outside_period", rule, path)
        elif policy == "excluded" or item.qualification == "no":
            reason = self.notes.exclude("investment_ineligible", rule, path)
        elif policy == "needs_review" or item.qualification != "yes":
            reason = self.notes.missing("investment_qualification_needed", rule, path)
        elif policy == "new_purchase" and item.new_investment != "yes":
            if item.new_investment == "unknown":
                reason = self.notes.missing("new_investment_confirmation_needed", rule, path)
            else:
                reason = self.notes.exclude("existing_holding_excluded", rule, path)
        elif policy in {"insurance", "annuity"}:
            eligible, reason = self._insurance(item, path, rule)
        elif policy == "recognized_pf":
            eligible, reason = self._recognized_pf(item, path, rule)
        elif policy == "approved_recipient":
            eligible, reason = self._donation(item, path, rule)
        elif cap_group:
            eligible = min(item.amount, self.remaining[cap_group])
            self.remaining[cap_group] -= eligible
            reason = (
                self.notes.exclude("investment_shared_cap", rule, path)
                if eligible < item.amount
                else None
            )
        else:
            eligible, reason = item.amount, None
        return InvestmentLine(
            id=item.id,
            category=item.category,
            entered_amount=item.amount,
            eligible_amount=eligible,
            excluded_amount=item.amount - eligible,
            cap_group=cap_group,
            reason_codes=(reason,) if reason else (),
        )

    def planning_amount(self, item: PlanningCategoryAmount, path: str) -> InvestmentLine:
        policy, cap_group, rule = CATEGORY_POLICIES[item.category]
        eligible = item.amount
        reason = None
        if policy == "excluded":
            eligible = ZERO
            reason = self.notes.exclude("investment_ineligible", rule, path)
        elif policy == "needs_review" and item.amount:
            eligible = ZERO
            reason = self.notes.missing("investment_qualification_needed", rule, path)
        elif item.amount:
            self.notes.assume("planning_category_eligible_amount", rule, path)
            if cap_group:
                eligible = min(item.amount, self.remaining[cap_group])
                self.remaining[cap_group] -= eligible
                if eligible < item.amount:
                    reason = self.notes.exclude("investment_shared_cap", rule, path)
        return InvestmentLine(
            id="planning-" + item.category, category=item.category,
            entered_amount=item.amount, eligible_amount=eligible,
            excluded_amount=item.amount - eligible, cap_group=cap_group,
            reason_codes=(reason,) if reason else (),
        )

    def _insurance(self, item: InvestmentEntry, path: str, rule: str) -> tuple[Decimal, str | None]:
        if item.insured_relationship == "other" or item.paid_and_payable_in_bangladesh == "no":
            return ZERO, self.notes.exclude(
                "insurance_relationship_or_payment_ineligible", rule, path
            )
        if (
            item.insured_relationship == "unknown"
            or item.paid_and_payable_in_bangladesh == "unknown"
        ):
            return ZERO, self.notes.missing("insurance_relationship_or_payment_needed", rule, path)
        if item.category == "deferred_annuity":
            return item.amount, None
        if item.actual_sum_assured_excluding_bonus is None or item.insurance_policy_id is None:
            return ZERO, self.notes.missing("insurance_sum_assured_or_policy_needed", rule, path)
        remaining = self.insurance_remaining.setdefault(
            item.insurance_policy_id,
            item.actual_sum_assured_excluding_bonus
            * self.pack.life_insurance_sum_assured_rate
            / HUNDRED,
        )
        allowed = min(item.amount, remaining)
        self.insurance_remaining[item.insurance_policy_id] = remaining - allowed
        reason = (
            self.notes.exclude("insurance_sum_assured_cap", rule, path)
            if allowed < item.amount
            else None
        )
        return allowed, reason

    def _recognized_pf(
        self, item: InvestmentEntry, path: str, rule: str
    ) -> tuple[Decimal, str | None]:
        if item.certified_eligible_amount is not None:
            self.notes.assume("recognized_pf_certified_eligibility", rule, path)
            allowed = item.certified_eligible_amount
        elif item.recognized_pf_contributions is not None:
            split = item.recognized_pf_contributions
            allowed = split.employee_annual + min(split.employer_annual, split.employee_annual)
        else:
            return ZERO, self.notes.missing("recognized_pf_certified_or_split_needed", rule, path)
        reason = (
            self.notes.exclude("recognized_pf_eligibility_limit", rule, path)
            if allowed < item.amount
            else None
        )
        return allowed, reason

    def _donation(self, item: InvestmentEntry, path: str, rule: str) -> tuple[Decimal, str | None]:
        approval = self.approvals.get(item.approval_id)
        if approval is None or approval.category != item.category:
            return ZERO, self.notes.missing("donation_recipient_approval_needed", rule, path)
        if item.contributed_on < approval.effective_from or (
            approval.expires_on is not None and item.contributed_on > approval.expires_on
        ):
            return ZERO, self.notes.exclude("donation_outside_approval_period", rule, path)
        return item.amount, None
