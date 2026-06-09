from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class SanchayapatraDefinition:
    internal_key: str
    display_name: str
    duration_months: int
    default_profit_rate: Decimal
    profit_style: str
    payout_frequency_months: int | None
    maturity_calculation_method: str
    default_source_tax: Decimal
    supported_source_tax_values: tuple[Decimal, ...]
    enabled: bool = True

    @property
    def duration_years(self) -> Decimal:
        return Decimal(self.duration_months) / Decimal("12")


SANCHAYAPATRA_DEFINITIONS: dict[str, SanchayapatraDefinition] = {
    "family-savings": SanchayapatraDefinition(
        internal_key="family-savings",
        display_name="Family Savings Certificate",
        duration_months=60,
        default_profit_rate=Decimal("10.54"),
        profit_style="monthly_profit",
        payout_frequency_months=1,
        maturity_calculation_method="simple_profit",
        default_source_tax=Decimal("10"),
        supported_source_tax_values=(Decimal("10"), Decimal("15")),
    ),
    "pensioner-savings": SanchayapatraDefinition(
        internal_key="pensioner-savings",
        display_name="Pensioner Savings Certificate",
        duration_months=60,
        default_profit_rate=Decimal("10.59"),
        profit_style="quarterly_profit",
        payout_frequency_months=3,
        maturity_calculation_method="simple_profit",
        default_source_tax=Decimal("10"),
        supported_source_tax_values=(Decimal("10"), Decimal("15")),
    ),
    "five-year-bangladesh": SanchayapatraDefinition(
        internal_key="five-year-bangladesh",
        display_name="5-Year Bangladesh Savings Certificate",
        duration_months=60,
        default_profit_rate=Decimal("10.44"),
        profit_style="maturity_profit",
        payout_frequency_months=None,
        maturity_calculation_method="simple_profit",
        default_source_tax=Decimal("10"),
        supported_source_tax_values=(Decimal("10"), Decimal("15")),
    ),
    "three-month-profit": SanchayapatraDefinition(
        internal_key="three-month-profit",
        display_name="3-Month Profit Based Savings Certificate",
        duration_months=36,
        default_profit_rate=Decimal("10.48"),
        profit_style="quarterly_profit",
        payout_frequency_months=3,
        maturity_calculation_method="simple_profit",
        default_source_tax=Decimal("10"),
        supported_source_tax_values=(Decimal("10"), Decimal("15")),
    ),
}


def get_enabled_sanchayapatra_definition(internal_key: str | None) -> SanchayapatraDefinition:
    if internal_key and internal_key in SANCHAYAPATRA_DEFINITIONS:
        definition = SANCHAYAPATRA_DEFINITIONS[internal_key]
        if definition.enabled:
            return definition
    return SANCHAYAPATRA_DEFINITIONS["family-savings"]


def list_enabled_sanchayapatra_definitions() -> list[SanchayapatraDefinition]:
    return [definition for definition in SANCHAYAPATRA_DEFINITIONS.values() if definition.enabled]
