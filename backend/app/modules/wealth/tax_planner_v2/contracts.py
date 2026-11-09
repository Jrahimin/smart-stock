from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, model_validator

from .validation_issues import validation_issue

def _assessment_year(value: str) -> str:
    if int(value[-2:]) != (int(value[:4]) + 1) % 100:
        raise ValueError("Assessment year must contain consecutive years")
    return value


AssessmentYear = Annotated[str, Field(strict=True, pattern=r"^20[0-9]{2}-[0-9]{2}$"), AfterValidator(_assessment_year)]
Purpose = Literal["filing", "forward_planning", "historical_comparison"]
Answer = Literal["yes", "no", "unknown"]
AnnualStatus = Literal["complete", "needs_review", "unsupported"]
SettlementStatus = Literal["complete", "not_requested", "needs_review", "not_available_for_year"]
Key = Annotated[str, Field(strict=True, min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_.:-]+$")]


def _decimal_string(value: object) -> object:
    if not isinstance(value, (str, Decimal)):
        raise validation_issue("tax_money_string")
    if isinstance(value, str):
        unsigned = value.removeprefix("-")
        if not 1 <= len(value) <= 22 or not unsigned.replace(".", "", 1).isascii():
            raise validation_issue("tax_money_format")
        parts = unsigned.split(".")
        if not all(part.isdigit() for part in parts) or len(parts) > 2:
            raise validation_issue("tax_money_format")
        if len(parts) == 2 and len(parts[1]) > 2:
            raise validation_issue("tax_money_precision")
    return value


Money = Annotated[
    Decimal,
    BeforeValidator(_decimal_string, json_schema_input_type=str),
    Field(ge=0, le=Decimal("999999999999999.99"), max_digits=17, decimal_places=2),
]
Rate = Annotated[Money, Field(le=Decimal("100"))]


def _iso_date(value: object) -> object:
    if type(value) is date:
        return value
    if not isinstance(value, str) or len(value) != 10:
        raise validation_issue("tax_date_iso")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise validation_issue("tax_date_iso") from exc
    if parsed.isoformat() != value:
        raise validation_issue("tax_date_iso")
    return parsed


CalendarDate = Annotated[date, BeforeValidator(_iso_date, json_schema_input_type=str)]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Profile(Contract):
    residence: Literal["resident", "non_resident", "unknown"]
    entity: Literal["individual", "huf", "company", "other"]
    woman: bool = Field(default=False, strict=True)
    senior_qualified_for_year: Answer = "no"
    disability: bool = Field(default=False, strict=True)
    third_gender: bool = Field(default=False, strict=True)
    gazetted_war_wounded_freedom_fighter: bool = Field(default=False, strict=True)
    gazetted_injured_july_2024_warrior: bool = Field(default=False, strict=True)
    eligible_disabled_dependents: int = Field(default=0, ge=0, le=100, strict=True)
    no_duplicate_dependent_claim: Answer = "unknown"
    new_taxpayer_floor: Answer = "unknown"
    first_return: Answer = "unknown"


class Coverage(Contract):
    wealth_surcharge: Answer = "unknown"
    environmental_surcharge: Answer = "unknown"
    personal_vehicle_advance_tax: Answer = "unknown"
    commercial_vehicle_or_vessel: Answer = "unknown"
    foreign_or_treaty_income: Answer = "unknown"
    unresolved_special_income: Answer = "unknown"
    losses_or_setoff: Answer = "unknown"
    turnover_or_special_sector: Answer = "unknown"
    prior_rebate_recovery: Answer = "unknown"
    # Relevant only when the user enters a Part 2 deduction.
    other_part2_donation_claims: Answer = "unknown"


class IncomeBase(Contract):
    id: Key
    amount: Money
    # Omitted when the user enters a total for the selected income period.
    earned_on: CalendarDate | None = None


class PrivateEmployment(IncomeBase):
    kind: Literal["private_employment"]
    basis: Literal["gross", "precomputed_taxable"]
    excluded_group_insurance_benefit: Money = Decimal("0")
    benefits_valuation_complete: Answer = "unknown"

    @model_validator(mode="after")
    def check_exclusion(self) -> "PrivateEmployment":
        if self.excluded_group_insurance_benefit > self.amount:
            raise validation_issue("tax_salary_exclusion", "excluded_group_insurance_benefit")
        if self.basis == "precomputed_taxable" and self.excluded_group_insurance_benefit:
            raise validation_issue("tax_salary_basis", "basis")
        return self


class PrecomputedIncome(IncomeBase):
    kind: Literal["government_employment", "ordinary_rent", "ordinary_other"]
    basis: Literal["precomputed_taxable"]
    ordinary_treatment_confirmed: Answer


class BusinessIncome(IncomeBase):
    kind: Literal["ordinary_business"]
    basis: Literal["precomputed_taxable"]
    gross_receipts: Money | None = None
    business_type: Literal["ordinary", "special_sector", "unknown"]
    ordinary_treatment_confirmed: Answer

    @model_validator(mode="after")
    def check_receipts(self) -> "BusinessIncome":
        if self.gross_receipts is not None and self.amount > self.gross_receipts:
            raise validation_issue("tax_business_profit", "gross_receipts")
        return self


class FinancialExpense(Contract):
    id: Key
    kind: Literal["bank_or_finance_charge", "borrowing_interest", "direct_expense"]
    amount: Money
    qualification: Answer


class FinancialIncome(IncomeBase):
    kind: Literal[
        "bank_interest",
        "fdr_profit",
        "dps_profit",
        "savings_certificate_profit",
        "domestic_dividend",
    ]
    basis: Literal["gross"]
    eligible_treatment_confirmed: Answer
    expenses: tuple[FinancialExpense, ...] = Field(default=(), max_length=12)


class ListedGain(IncomeBase):
    kind: Literal["listed_gain"]
    basis: Literal["gross"]
    instrument: Literal["listed_share", "eligible_listed_fund", "other", "unknown"]
    realized: Answer
    qualifying_disposal_confirmed: Answer
    sponsor_director_or_placement_holder: Answer
    # The exemption can cover fund units even when their excess uses a different rate.
    fund_excess_special_rate_confirmed: Answer = "unknown"


class UnsupportedIncome(IncomeBase):
    kind: Literal[
        "foreign",
        "conditional_exemption",
        "property_gain",
        "precious_metal_gain",
        "partnership_or_aop",
        "final_tax",
        "restricted_tax",
        "unclassified",
    ]
    basis: Literal["gross", "precomputed_taxable"]


IncomeEntry = Annotated[
    PrivateEmployment
    | PrecomputedIncome
    | BusinessIncome
    | FinancialIncome
    | ListedGain
    | UnsupportedIncome,
    Field(discriminator="kind"),
]

InvestmentCategory = Literal[
    "dps",
    "government_security",
    "savings_certificate",
    "fund_unit_etf",
    "listed_security",
    "life_insurance",
    "deferred_annuity",
    "government_pf",
    "recognized_pf",
    "universal_pension",
    "approved_superannuation",
    "approved_welfare_or_group_insurance",
    "approved_donation",
    "zakat",
    "fdr_principal",
    "ordinary_savings",
    "ineligible_expenditure",
    "unknown",
]
CapGroup = Literal["dps", "government_securities"]


class RecognizedPFContributions(Contract):
    fund_id: Key
    employee_annual: Money
    employer_annual: Money


class InvestmentEntry(Contract):
    id: Key
    category: InvestmentCategory
    amount: Money
    contributed_on: CalendarDate
    # Qualification includes any relevant fund, holding or maturity conditions.
    qualification: Answer
    new_investment: Answer = "unknown"
    premature_encashment: Answer = "no"
    actual_sum_assured_excluding_bonus: Money | None = None
    insurance_policy_id: Key | None = None
    insured_relationship: Literal["self", "spouse", "minor_child", "other", "unknown"] = "unknown"
    paid_and_payable_in_bangladesh: Answer = "unknown"
    # Use the fund's certified eligible portion after applicable statutory limits.
    certified_eligible_amount: Money | None = None
    recognized_pf_contributions: RecognizedPFContributions | None = None
    approval_id: Key | None = None

    @model_validator(mode="after")
    def check_investment_facts(self) -> "InvestmentEntry":
        if (
            self.actual_sum_assured_excluding_bonus is not None
            or self.insurance_policy_id is not None
        ) and self.category != "life_insurance":
            raise validation_issue("tax_insurance_category", "category")
        if (
            self.insured_relationship != "unknown"
            or self.paid_and_payable_in_bangladesh != "unknown"
        ) and self.category not in {"life_insurance", "deferred_annuity"}:
            raise validation_issue("tax_insurance_facts", "category")
        if self.certified_eligible_amount is not None and (
            self.category != "recognized_pf" or self.certified_eligible_amount > self.amount
        ):
            raise validation_issue("tax_pf_certified", "certified_eligible_amount")
        if self.recognized_pf_contributions is not None:
            contributions = self.recognized_pf_contributions
            if (
                self.category != "recognized_pf"
                or self.certified_eligible_amount is not None
                or contributions.employee_annual + contributions.employer_annual != self.amount
            ):
                raise validation_issue("tax_pf_split", "recognized_pf_contributions")
        if self.approval_id is not None and self.category not in {"approved_donation", "zakat"}:
            raise validation_issue("tax_donation_category", "approval_id")
        return self


def _explicitly_confirmed(value: object) -> object:
    if value is not True:
        raise validation_issue("tax_explicit_confirmation")
    return value


class ConfirmedEligibleTotal(Contract):
    mode: Literal["confirmed_eligible_total"]
    amount: Money
    # Explicit affirmation of an already eligible, capped total for this assessment year.
    confirmed_for_year: Annotated[Literal[True], BeforeValidator(_explicitly_confirmed)]


class ItemizedInvestments(Contract):
    mode: Literal["itemized"]
    entries: tuple[InvestmentEntry, ...] = Field(default=(), max_length=100)


class PlanningCategoryAmount(Contract):
    category: InvestmentCategory
    amount: Money


class PlanningCategoryTotals(Contract):
    """Annual eligible amounts for planning; not verified dated payment claims."""
    mode: Literal["planning_category_totals"]
    entries: tuple[PlanningCategoryAmount, ...] = Field(default=(), max_length=100)

    @model_validator(mode="after")
    def unique_categories(self) -> "PlanningCategoryTotals":
        seen: set[str] = set()
        for i, entry in enumerate(self.entries):
            if entry.category in seen:
                raise validation_issue("tax_category_duplicate", "entries", i, "category")
            seen.add(entry.category)
        return self


InvestmentInput = Annotated[
    ConfirmedEligibleTotal | ItemizedInvestments | PlanningCategoryTotals, Field(discriminator="mode")
]


class EligibleTotalScenario(ConfirmedEligibleTotal):
    contributed_on: CalendarDate


class ItemizedScenario(Contract):
    mode: Literal["itemized"]
    entry: InvestmentEntry


ScenarioInput = Annotated[EligibleTotalScenario | ItemizedScenario, Field(discriminator="mode")]


class IncomeDeduction(Contract):
    id: Key
    kind: Literal["czm_donation"]
    amount: Money
    paid_on: CalendarDate
    qualified_bank_transfer: Answer


class CreditEntry(Contract):
    id: Key
    kind: Literal["withholding", "ordinary_advance", "final_or_restricted", "unclassified"]
    amount: Money
    assessment_year: AssessmentYear
    paid_on: CalendarDate
    income_id: Key | None = None
    # Source and assessment-year claim are backed by the taxpayer's payment record.
    qualifying_claim_confirmed: Answer

    @model_validator(mode="after")
    def check_source(self) -> "CreditEntry":
        if self.kind == "withholding" and self.income_id is None:
            raise validation_issue("tax_withholding_source", "income_id")
        return self


class Filing(Contract):
    filing_date: CalendarDate
    return_from_abroad_exception: Answer = "unknown"
    extension_or_other_exception: Answer = "unknown"


class CurrentCalculationRequest(Contract):
    schema_version: Literal[2]
    expected_ruleset_revision: Key
    profile: Profile
    coverage: Coverage
    income: tuple[IncomeEntry, ...] = Field(default=(), max_length=100)
    investments: InvestmentInput
    income_deductions: tuple[IncomeDeduction, ...] = Field(default=(), max_length=100)
    credits: tuple[CreditEntry, ...] = Field(default=(), max_length=100)
    credits_completeness: Literal["unknown", "confirmed_none", "complete"] = "unknown"
    filing: Filing | None = None
    scenario: ScenarioInput | None = None

    @model_validator(mode="after")
    def check_claims(self) -> "CurrentCalculationRequest":
        income_ids: set[str] = set()
        claims: set[str] = set()

        def record_claim(payment_id: str, *path: str | int) -> None:
            if payment_id in claims:
                raise validation_issue("tax_payment_duplicate", *path)
            claims.add(payment_id)

        for i, income in enumerate(self.income):
            if income.id in income_ids:
                raise validation_issue("tax_income_duplicate", "income", i, "id")
            income_ids.add(income.id)
            if isinstance(income, FinancialIncome):
                for j, expense in enumerate(income.expenses):
                    record_claim(expense.id, "income", i, "expenses", j)
        for i, deduction in enumerate(self.income_deductions):
            record_claim(deduction.id, "income_deductions", i)
        for i, credit in enumerate(self.credits):
            record_claim(credit.id, "credits", i)
        items = (
            self.investments.entries if isinstance(self.investments, ItemizedInvestments) else ()
        )
        item_paths = [(item, ("investments", "entries", i)) for i, item in enumerate(items)]
        if isinstance(self.scenario, ItemizedScenario):
            item_paths.append((self.scenario.entry, ("scenario", "entry")))
        pf_funds: set[str] = set()
        sum_assured: dict[str, Decimal] = {}
        for item, path in item_paths:
            record_claim(item.id, *path)
            if item.recognized_pf_contributions is not None:
                fund_id = item.recognized_pf_contributions.fund_id
                if fund_id in pf_funds:
                    raise validation_issue(
                        "tax_pf_duplicate", *path, "recognized_pf_contributions", "fund_id"
                    )
                pf_funds.add(fund_id)
            if item.insurance_policy_id is None or item.actual_sum_assured_excluding_bonus is None:
                continue
            previous = sum_assured.setdefault(
                item.insurance_policy_id, item.actual_sum_assured_excluding_bonus
            )
            if previous != item.actual_sum_assured_excluding_bonus:
                raise validation_issue(
                    "tax_insurance_sum", *path, "actual_sum_assured_excluding_bonus"
                )
        if (
            isinstance(self.scenario, ItemizedScenario)
            and (
                isinstance(self.investments, ConfirmedEligibleTotal) and self.investments.amount
                or isinstance(self.investments, PlanningCategoryTotals)
                and any(item.amount for item in self.investments.entries)
            )
        ):
            raise validation_issue("tax_scenario_base", "investments", "mode")
        if self.credits_completeness == "confirmed_none" and self.credits:
            raise validation_issue("tax_no_credits", "credits_completeness")
        for i, credit in enumerate(self.credits):
            if credit.income_id is not None and credit.income_id not in income_ids:
                raise validation_issue("tax_credit_source", "credits", i, "income_id")
        return self



class TaxCalculationRequest(CurrentCalculationRequest):
    assessment_year: AssessmentYear
    purpose: Purpose


class Guidance(Contract):
    message_id: str
    rule_id: str
    field_path: str | None = None
    values: tuple[tuple[str, str], ...] = ()


class IncomeLine(Contract):
    id: Key
    kind: str
    classification: Literal[
        "ordinary", "special_rate", "exempt", "final_or_restricted", "unresolved"
    ]
    entered_amount: Decimal
    excluded_amount: Decimal
    deductible_amount: Decimal
    taxable_amount: Decimal
    special_tax: Decimal
    reason_codes: tuple[str, ...] = ()


class DeductionLine(Contract):
    id: Key
    entered_amount: Decimal
    allowed_amount: Decimal
    reason_codes: tuple[str, ...] = ()


class InvestmentLine(Contract):
    id: Key
    category: str
    entered_amount: Decimal
    eligible_amount: Decimal
    excluded_amount: Decimal
    cap_group: CapGroup | None = None
    reason_codes: tuple[str, ...] = ()


class SlabLine(Contract):
    band: int
    taxable_amount: Decimal
    rate: Decimal
    tax: Decimal


class CreditLine(Contract):
    id: Key
    kind: str
    income_id: Key | None
    entered_amount: Decimal
    allowed_amount: Decimal
    restricted_amount: Decimal
    reason_codes: tuple[str, ...] = ()


class RebateResult(Contract):
    income_limit: Decimal
    investment_limit: Decimal
    statutory_cap: Decimal
    entitlement: Decimal
    effective_tax_reduction: Decimal | None
    liability_rounding_adjustment: Decimal | None
    unused_entitlement: Decimal | None
    unused_due_to_floor: Decimal | None
    additional_eligible_investment_for_statutory_limit: Decimal | None
    additional_eligible_investment_for_lowest_usable_liability: Decimal | None
    potential_additional_tax_saving: Decimal | None


class TaxBreakdown(Contract):
    annual_status: AnnualStatus
    settlement_status: SettlementStatus
    missing_facts: tuple[Guidance, ...]
    exclusions: tuple[Guidance, ...]
    assumptions: tuple[Guidance, ...]
    guidance: tuple[Guidance, ...]
    income: tuple[IncomeLine, ...]
    income_deductions: tuple[DeductionLine, ...]
    ordinary_income: Decimal
    special_rate_income: Decimal
    rebate_income_base: Decimal
    applied_profile: str
    dependent_allowance: Decimal
    allowance: Decimal
    ordinary_income_above_allowance: Decimal
    slabs: tuple[SlabLine, ...]
    ordinary_tax: Decimal
    special_tax: Decimal
    gross_tax: Decimal
    post_rebate_tax: Decimal | None
    investments: tuple[InvestmentLine, ...]
    eligible_investment: Decimal
    rebate: RebateResult
    minimum_tax_amount: Decimal | None
    minimum_tax_triggered: bool | None
    minimum_tax_binding: bool | None
    minimum_tax_top_up: Decimal | None
    minimum_tax_policy: str
    annual_liability: Decimal | None
    credits: tuple[CreditLine, ...]
    allowed_credits: Decimal
    restricted_credits: Decimal
    section_173_balance: Decimal | None
    filing_adjustment: Decimal | None
    filing_adjustment_code: str | None
    estimated_payable: Decimal | None
    excess_credits: Decimal | None


class ScenarioResult(Contract):
    breakdown: TaxBreakdown
    eligible_increment: Decimal
    annual_saving: Decimal | None
    settlement_saving: Decimal | None
    limiting_reason: str | None
    is_historical: bool


class TaxCalculationResponse(Contract):
    schema_version: Literal[2] = 2
    assessment_year: AssessmentYear
    income_period_start: date
    income_period_end: date
    income_period_status: Literal["future", "open", "closed"]
    revision_id: Key
    content_hash: str
    engine_policy_version: str
    rules_reviewed_on: date
    as_of: date
    purpose: Purpose
    base: TaxBreakdown
    scenario: ScenarioResult | None
