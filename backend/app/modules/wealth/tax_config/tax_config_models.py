from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class ResolvedTaxSlab:
    amount: Decimal | None
    rate: Decimal
    label: str
    is_allowance_band: bool = False


@dataclass(frozen=True)
class ResolvedTaxFreeThresholds:
    general: Decimal
    woman_or_senior: Decimal
    person_with_disability: Decimal
    freedom_fighter: Decimal


@dataclass(frozen=True)
class ResolvedInvestmentRebateConfig:
    taxable_income_limit_pct: Decimal
    investment_rebate_pct: Decimal
    maximum_rebate_amount: Decimal


@dataclass(frozen=True)
class ResolvedMinimumTaxRule:
    rule_code: str
    rule_type: str
    location_code: str | None
    minimum_amount: Decimal
    is_active: bool


@dataclass(frozen=True)
class ResolvedInvestmentCategory:
    category_key: str
    request_field: str
    display_label: str
    icon: str
    sort_order: int
    is_enabled: bool


@dataclass(frozen=True)
class ResolvedTaxPlannerConfig:
    tax_year_label: str
    display_name: str
    country_code: str
    thresholds: ResolvedTaxFreeThresholds
    slabs: tuple[ResolvedTaxSlab, ...]
    investment_rebate: ResolvedInvestmentRebateConfig
    minimum_tax_rules: tuple[ResolvedMinimumTaxRule, ...]
    investment_categories: tuple[ResolvedInvestmentCategory, ...]
    disclaimer: str
    minimum_tax_note: str
    source: str = "database"
