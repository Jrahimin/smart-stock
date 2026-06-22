from dataclasses import dataclass
from typing import Final


PROFILE_RESOLUTION_ORDER: Final = (
    "FREEDOM_FIGHTER",
    "PERSON_WITH_DISABILITY",
    "WOMAN_OR_SENIOR",
    "GENERAL",
)

PROFILE_CATEGORY_LABELS: Final[dict[str, str]] = {
    "GENERAL": "General resident individual",
    "WOMAN_OR_SENIOR": "Female or senior citizen",
    "PERSON_WITH_DISABILITY": "Person with disability",
    "FREEDOM_FIGHTER": "Freedom fighter",
}


@dataclass(frozen=True)
class InvestmentCategoryDefinition:
    category_key: str
    request_field: str
    default_label: str
    default_icon: str


INVESTMENT_CATEGORY_DEFINITIONS: Final[dict[str, InvestmentCategoryDefinition]] = {
    "life_insurance": InvestmentCategoryDefinition(
        category_key="life_insurance",
        request_field="life_insurance",
        default_label="Life Insurance",
        default_icon="🛡️",
    ),
    "provident_fund": InvestmentCategoryDefinition(
        category_key="provident_fund",
        request_field="provident_fund",
        default_label="Provident Fund",
        default_icon="🧾",
    ),
    "stock_market": InvestmentCategoryDefinition(
        category_key="stock_market",
        request_field="stock_market",
        default_label="Stocks",
        default_icon="📊",
    ),
    "mutual_funds": InvestmentCategoryDefinition(
        category_key="mutual_funds",
        request_field="mutual_funds",
        default_label="Mutual Funds",
        default_icon="🪙",
    ),
    "sanchayapatra": InvestmentCategoryDefinition(
        category_key="sanchayapatra",
        request_field="sanchayapatra",
        default_label="Sanchayapatra",
        default_icon="🇧🇩",
    ),
    "dps_or_savings": InvestmentCategoryDefinition(
        category_key="dps_or_savings",
        request_field="dps_or_savings",
        default_label="DPS / Savings",
        default_icon="📅",
    ),
    "approved_donations": InvestmentCategoryDefinition(
        category_key="approved_donations",
        request_field="approved_donations",
        default_label="Approved Donations",
        default_icon="🤝",
    ),
    "other_eligible_investment": InvestmentCategoryDefinition(
        category_key="other_eligible_investment",
        request_field="other_eligible_investment",
        default_label="Other Eligible Investment",
        default_icon="✨",
    ),
}

INVESTMENT_CATEGORY_SEED_ORDER: Final[list[str]] = [
    "life_insurance",
    "provident_fund",
    "stock_market",
    "mutual_funds",
    "sanchayapatra",
    "dps_or_savings",
    "approved_donations",
    "other_eligible_investment",
]


@dataclass(frozen=True)
class LocationTierDefinition:
    location_code: str
    default_label: str


MINIMUM_TAX_DEFINITIONS: Final[list[tuple[str, str, str]]] = [
    ("NATIONAL_DEFAULT", "NATIONAL_DEFAULT", ""),
    ("LOCATION_DHAKA_CTG", "LOCATION_TIER", "DHAKA_CHITTAGONG"),
    ("LOCATION_OTHER_CITY", "LOCATION_TIER", "OTHER_CITY"),
    ("LOCATION_RURAL", "LOCATION_TIER", "RURAL"),
]

MINIMUM_TAX_AMOUNT_FIELDS: Final[dict[str, str]] = {
    "NATIONAL_DEFAULT": "minimum_tax_national",
    "LOCATION_DHAKA_CTG": "minimum_tax_dhaka_ctg",
    "LOCATION_OTHER_CITY": "minimum_tax_other_city",
    "LOCATION_RURAL": "minimum_tax_rural",
}

LOCATION_TIER_DEFINITIONS: Final[dict[str, LocationTierDefinition]] = {
    "DHAKA_CHITTAGONG": LocationTierDefinition(
        location_code="DHAKA_CHITTAGONG",
        default_label="Dhaka / Chattogram city corporation",
    ),
    "OTHER_CITY": LocationTierDefinition(
        location_code="OTHER_CITY",
        default_label="Other city corporation",
    ),
    "RURAL": LocationTierDefinition(
        location_code="RURAL",
        default_label="Rural / other area",
    ),
}
