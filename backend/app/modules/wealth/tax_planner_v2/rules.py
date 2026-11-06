from datetime import date, timedelta
from decimal import Decimal
from hashlib import sha256
from json import dumps
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import Field, field_validator, model_validator

from .contracts import (
    AssessmentYear,
    CalendarDate,
    CapGroup,
    Contract,
    InvestmentCategory,
    Key,
    Money,
    Rate,
)
from .validation_issues import validation_issue

ENGINE_POLICY_VERSION = "bd-individual-v1"
SCHEMA_VERSION = 2
INCOME_PERIODS = {
    "2026-27": (date(2025, 7, 1), date(2026, 6, 30)),
    "2027-28": (date(2026, 7, 1), date(2027, 6, 30)),
}
def income_period(year: str) -> tuple[date, date]:
    start = int(year[:4])
    if year != f"{start}-{(start + 1) % 100:02d}":
        raise validation_issue("tax_income_period", "assessment_year")
    return date(start - 1, 7, 1), date(start, 6, 30)


PositiveMoney = Annotated[Money, Field(gt=0)]
PositiveRate = Annotated[Rate, Field(gt=0)]
Label = Annotated[str, Field(strict=True, min_length=1, max_length=160, pattern=r"\S")]
SourceURL = Annotated[str, Field(strict=True, max_length=512, pattern=r"^https://[^\s]+$")]
Hash = Annotated[str, Field(strict=True, pattern=r"^[a-f0-9]{64}$")]

CategoryPolicy = Literal[
    "annual_capped",
    "new_purchase",
    "insurance",
    "annuity",
    "qualified_payment",
    "recognized_pf",
    "approved_recipient",
    "excluded",
    "needs_review",
]
# IDs and policy mapping belong to the engine. Presentation does not control legal eligibility.
CATEGORY_POLICIES: dict[str, tuple[CategoryPolicy, CapGroup | None, str]] = {
    "dps": ("annual_capped", "dps", "investment.dps"),
    "government_security": ("annual_capped", "government_securities", "investment.gov_securities"),
    "savings_certificate": ("annual_capped", "government_securities", "investment.gov_securities"),
    "fund_unit_etf": ("new_purchase", None, "investment.new_fund"),
    "listed_security": ("new_purchase", None, "investment.new_listed_security"),
    "life_insurance": ("insurance", None, "investment.life_insurance"),
    "deferred_annuity": ("annuity", None, "investment.life_insurance"),
    "government_pf": ("qualified_payment", None, "investment.pf"),
    "recognized_pf": ("recognized_pf", None, "investment.pf"),
    "universal_pension": ("qualified_payment", None, "investment.pension_and_welfare"),
    "approved_superannuation": ("qualified_payment", None, "investment.pension_and_welfare"),
    "approved_welfare_or_group_insurance": (
        "qualified_payment",
        None,
        "investment.pension_and_welfare",
    ),
    "approved_donation": ("approved_recipient", None, "investment.donation"),
    "zakat": ("approved_recipient", None, "investment.donation"),
    "fdr_principal": ("excluded", None, "rebate.general"),
    "ordinary_savings": ("excluded", None, "rebate.general"),
    "ineligible_expenditure": ("excluded", None, "rebate.general"),
    "unknown": ("needs_review", None, "rebate.general"),
}
RULE_IDS = frozenset(
    {
        "income.employment",
        "income.ordinary",
        "income.dividend",
        "income.listed_gain",
        "profile.allowance",
        "tax.slabs",
        "tax.minimum",
        "rebate.general",
        "deduction.czm",
        "credit.advance",
        "filing.windows",
        "scope.individual",
        "scope.wealth_and_vehicle",
        "scope.turnover",
        "scope.early_encashment",
        *(entry[2] for entry in CATEGORY_POLICIES.values()),
    }
)


class SourceDocument(Contract):
    id: Key
    edition: Label
    public_url: SourceURL
    sha256: Hash
    # Edition and checksum identify the audit copy even when the public PDF differs.
    public_edition: Label | None = Field(default=None, exclude_if=lambda value: value is None)

    @field_validator("public_url")
    @classmethod
    def require_official_public_source(cls, value: str) -> str:
        try:
            parsed = urlsplit(value)
            port = parsed.port
        except ValueError:
            raise validation_issue("tax_source_url") from None
        if (
            not parsed.hostname
            or not parsed.hostname.endswith(".gov.bd")
            or parsed.username is not None
            or port not in {None, 443}
        ):
            raise validation_issue("tax_source_url")
        return value


class SourceReference(Contract):
    document_id: Key
    pdf_pages: tuple[Annotated[int, Field(ge=1, le=10000, strict=True)], ...] = Field(
        min_length=1, max_length=20
    )
    provision: Label
    public_pdf_pages: tuple[Annotated[int, Field(ge=1, le=10000, strict=True)], ...] | None = Field(
        default=None, min_length=1, max_length=20, exclude_if=lambda value: value is None
    )


class RuleReference(Contract):
    id: Key
    effective_basis: Literal["assessment_year", "income_period", "contribution_date", "filing_date"]
    policy_id: Key
    supported_facts: tuple[Label, ...] = Field(min_length=1, max_length=20)
    references: tuple[SourceReference, ...] = Field(min_length=1, max_length=10)
    golden_cases: tuple[Key, ...] = Field(default=(), max_length=20)


class Thresholds(Contract):
    general: PositiveMoney
    woman_or_senior: PositiveMoney
    disability_or_third_gender: PositiveMoney
    gazetted_war_wounded_or_injured_july_warrior: PositiveMoney
    disabled_dependent_addition: Money

    @model_validator(mode="after")
    def check_order(self) -> "Thresholds":
        if not (
            self.general
            <= self.woman_or_senior
            <= self.disability_or_third_gender
            <= self.gazetted_war_wounded_or_injured_july_warrior
        ):
            raise validation_issue("tax_threshold_order")
        return self


class TaxBand(Contract):
    width: PositiveMoney | None
    rate: PositiveRate


class RebatePolicy(Contract):
    income_rate: Rate
    investment_rate: Rate
    statutory_cap: Money


class MinimumTaxPolicy(Contract):
    ordinary: Money
    eligible_new_taxpayer: Money

    @model_validator(mode="after")
    def check_new_floor(self) -> "MinimumTaxPolicy":
        if self.eligible_new_taxpayer > self.ordinary:
            raise validation_issue("tax_minimum_order", "eligible_new_taxpayer")
        return self


class InvestmentPresentation(Contract):
    category: InvestmentCategory
    label_en: Label
    label_bn: Label
    visible: bool = Field(strict=True)
    order: int = Field(ge=0, le=1000, strict=True)


class DonationApproval(Contract):
    id: Key
    category: Literal["approved_donation", "zakat"]
    label_en: Label
    label_bn: Label
    effective_from: CalendarDate
    expires_on: CalendarDate | None
    reference: SourceReference

    @model_validator(mode="after")
    def check_period(self) -> "DonationApproval":
        if self.expires_on is not None and self.effective_from > self.expires_on:
            raise validation_issue("tax_approval_dates", "expires_on")
        return self


class FilingWindow(Contract):
    start: CalendarDate
    end: CalendarDate
    policy: Literal["incentive", "neutral", "additional_tax"]
    rate: Rate
    limit: Money

    @model_validator(mode="after")
    def check_adjustment(self) -> "FilingWindow":
        if self.start > self.end:
            raise validation_issue("tax_window_dates", "end")
        if self.policy == "neutral" and (self.rate or self.limit):
            raise validation_issue("tax_neutral_window", "rate")
        return self


class RulePack(Contract):
    schema_version: Literal[2] = SCHEMA_VERSION
    engine_policy_version: Literal["bd-individual-v1"] = ENGINE_POLICY_VERSION
    country_code: Literal["BD"] = "BD"
    assessment_year: AssessmentYear
    income_period_start: CalendarDate
    income_period_end: CalendarDate
    reviewed_on: CalendarDate
    thresholds: Thresholds
    taxable_bands: tuple[TaxBand, ...] = Field(min_length=1, max_length=20)
    employment_exemption_cap: Money
    rebate: RebatePolicy
    minimum_tax: MinimumTaxPolicy
    dps_cap: Money
    government_securities_cap: Money
    life_insurance_sum_assured_rate: Rate
    dividend_rate: Rate
    listed_gain_exemption: Money
    listed_gain_rate: Rate
    part2_donation_limit_rate: Rate
    ordinary_turnover_zero_rate_ceiling: Money
    investment_presentation: tuple[InvestmentPresentation, ...] = Field(max_length=40)
    donation_approvals: tuple[DonationApproval, ...] = Field(max_length=100)
    filing_windows: tuple[FilingWindow, ...] = Field(max_length=12)
    sources: tuple[SourceDocument, ...] = Field(min_length=1, max_length=30)
    rule_references: tuple[RuleReference, ...] = Field(max_length=50)

    @property
    def supports_settlement(self) -> bool:
        return bool(self.filing_windows)

    def includes_income_date(self, day: date) -> bool:
        return self.income_period_start <= day <= self.income_period_end

    def content_hash(self) -> str:
        # JSON decimals retain precision. Normalize insignificant zeroes so equivalent
        # administrative input produces the same snapshot identity.
        def canonical(value: object) -> object:
            if isinstance(value, Decimal):
                text = format(value, "f")
                return (text.rstrip("0").rstrip(".") if "." in text else text) if value else "0"
            if isinstance(value, dict):
                return {key: canonical(item) for key, item in value.items()}
            if isinstance(value, (list, tuple)):
                return [canonical(item) for item in value]
            if isinstance(value, date):
                return value.isoformat()
            return value

        payload = dumps(
            canonical(self.model_dump()), sort_keys=True, separators=(",", ":"), ensure_ascii=False
        )
        return sha256(payload.encode("utf-8")).hexdigest()

    @model_validator(mode="after")
    def check_snapshot(self) -> "RulePack":
        if (self.income_period_start, self.income_period_end) != income_period(self.assessment_year):
            raise validation_issue("tax_income_period", "income_period_start")
        if (
            any(band.width is None for band in self.taxable_bands[:-1])
            or self.taxable_bands[-1].width is not None
        ):
            raise validation_issue("tax_band_terminal", "taxable_bands")
        rates = [band.rate for band in self.taxable_bands]
        if rates != sorted(rates):
            raise validation_issue("tax_band_rate_order", "taxable_bands")
        categories = [item.category for item in self.investment_presentation]
        orders = {item.order for item in self.investment_presentation}
        if (
            set(categories) != CATEGORY_POLICIES.keys()
            or len(categories) != len(orders)
            or len(categories) != len(set(categories))
        ):
            raise validation_issue("tax_presentation", "investment_presentation")
        source_ids = {item.id for item in self.sources}
        rule_ids = {item.id for item in self.rule_references}
        if (
            len(source_ids) != len(self.sources)
            or rule_ids != RULE_IDS
            or len(rule_ids) != len(self.rule_references)
        ):
            raise validation_issue("tax_rule_coverage", "rule_references")
        if any(
            item.policy_id != item.id
            or any(ref.document_id not in source_ids for ref in item.references)
            for item in self.rule_references
        ):
            raise validation_issue("tax_rule_reference", "rule_references")
        if len({item.id for item in self.donation_approvals}) != len(self.donation_approvals):
            raise validation_issue("tax_approval_duplicate", "donation_approvals")
        if any(item.reference.document_id not in source_ids for item in self.donation_approvals):
            raise validation_issue("tax_approval_reference", "donation_approvals")
        self._check_filing_windows()
        return self

    def _check_filing_windows(self) -> None:
        if self.assessment_year == "2027-28":
            if self.filing_windows:
                raise validation_issue("tax_filing_unsupported", "filing_windows")
            return
        if self.assessment_year != "2026-27" and not self.filing_windows:
            return
        expected_day = self.income_period_end + timedelta(days=1)
        last_day = date(expected_day.year + 1, 6, 30)
        for window in self.filing_windows:
            if window.start != expected_day or window.end > last_day:
                raise validation_issue("tax_filing_contiguous", "filing_windows")
            expected_day = window.end + timedelta(days=1)
        if expected_day != last_day + timedelta(days=1):
            raise validation_issue("tax_filing_complete", "filing_windows")
