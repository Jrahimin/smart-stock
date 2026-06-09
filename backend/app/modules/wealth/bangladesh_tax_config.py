from dataclasses import dataclass
from decimal import Decimal


TAX_PLANNER_DISCLAIMER = (
    "Estimated for planning purposes only. This tool is not a substitute for professional tax advice or official NBR tax filing."
)

MINIMUM_TAX_V1_NOTE = "Minimum tax and special filing situations are not fully modeled in this V1 estimate."


@dataclass(frozen=True)
class TaxSlab:
    amount: Decimal | None
    rate: Decimal
    label: str


@dataclass(frozen=True)
class TaxFreeThresholds:
    general: Decimal
    woman_or_senior: Decimal
    person_with_disability: Decimal
    freedom_fighter: Decimal


@dataclass(frozen=True)
class InvestmentRebateConfig:
    max_income_percentage: Decimal
    max_amount: Decimal
    rebate_rate: Decimal


@dataclass(frozen=True)
class BangladeshTaxYearConfig:
    fiscal_year: str
    display_name: str
    thresholds: TaxFreeThresholds
    slabs: tuple[TaxSlab, ...]
    investment_rebate: InvestmentRebateConfig
    disclaimer: str = TAX_PLANNER_DISCLAIMER
    minimum_tax_note: str = MINIMUM_TAX_V1_NOTE
    enabled: bool = True


BANGLADESH_TAX_YEAR_CONFIGS: dict[str, BangladeshTaxYearConfig] = {
    "2025-2026": BangladeshTaxYearConfig(
        fiscal_year="2025-2026",
        display_name="FY 2025-2026",
        thresholds=TaxFreeThresholds(
            general=Decimal("375000"),
            woman_or_senior=Decimal("425000"),
            person_with_disability=Decimal("500000"),
            freedom_fighter=Decimal("525000"),
        ),
        slabs=(
            TaxSlab(amount=Decimal("375000"), rate=Decimal("0"), label="Tax-free allowance"),
            TaxSlab(amount=Decimal("300000"), rate=Decimal("10"), label="Next 300,000"),
            TaxSlab(amount=Decimal("400000"), rate=Decimal("15"), label="Next 400,000"),
            TaxSlab(amount=Decimal("500000"), rate=Decimal("20"), label="Next 500,000"),
            TaxSlab(amount=Decimal("2000000"), rate=Decimal("25"), label="Next 2,000,000"),
            TaxSlab(amount=None, rate=Decimal("30"), label="Remaining income"),
        ),
        investment_rebate=InvestmentRebateConfig(
            max_income_percentage=Decimal("20"),
            max_amount=Decimal("1000000"),
            rebate_rate=Decimal("15"),
        ),
    )
}


def get_enabled_tax_year_config(fiscal_year: str | None = None) -> BangladeshTaxYearConfig:
    if fiscal_year:
        config = BANGLADESH_TAX_YEAR_CONFIGS.get(fiscal_year)
        if config and config.enabled:
            return config

    return BANGLADESH_TAX_YEAR_CONFIGS["2025-2026"]
