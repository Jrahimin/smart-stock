from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class CountryDefaults:
    country_code: str
    currency: str
    currency_symbol: str
    inflation_rate: Decimal
    default_fdr_rate: Decimal
    default_dps_rate: Decimal
    default_stock_return: Decimal
    nisab_amount: Decimal
    zakat_rate: Decimal
    deposit_label: str
    savings_label: str


COUNTRY_DEFAULTS: dict[str, CountryDefaults] = {
    "BD": CountryDefaults(
        country_code="BD",
        currency="BDT",
        currency_symbol="৳",
        inflation_rate=Decimal("8"),
        default_fdr_rate=Decimal("9"),
        default_dps_rate=Decimal("8"),
        default_stock_return=Decimal("12"),
        nisab_amount=Decimal("650000"),
        zakat_rate=Decimal("2.5"),
        deposit_label="FDR",
        savings_label="DPS",
    ),
    "DEFAULT": CountryDefaults(
        country_code="DEFAULT",
        currency="USD",
        currency_symbol="$",
        inflation_rate=Decimal("3"),
        default_fdr_rate=Decimal("5"),
        default_dps_rate=Decimal("4"),
        default_stock_return=Decimal("8"),
        nisab_amount=Decimal("5000"),
        zakat_rate=Decimal("2.5"),
        deposit_label="Fixed Deposit",
        savings_label="Recurring Savings",
    ),
}


def get_country_defaults(country_code: str | None) -> CountryDefaults:
    if country_code and country_code.upper() in COUNTRY_DEFAULTS:
        return COUNTRY_DEFAULTS[country_code.upper()]
    return COUNTRY_DEFAULTS["DEFAULT"]


def resolve_assumption(
    *,
    country_code: str | None,
    key: str,
    override: Decimal | float | int | None,
) -> Decimal:
    defaults = get_country_defaults(country_code)
    if override is not None:
        return Decimal(str(override))
    mapping = {
        "inflation_rate": defaults.inflation_rate,
        "annual_rate": defaults.default_fdr_rate,
        "fdr_rate": defaults.default_fdr_rate,
        "dps_rate": defaults.default_dps_rate,
        "stock_return": defaults.default_stock_return,
        "nisab_amount": defaults.nisab_amount,
        "zakat_rate": defaults.zakat_rate,
    }
    return mapping.get(key, Decimal("0"))
