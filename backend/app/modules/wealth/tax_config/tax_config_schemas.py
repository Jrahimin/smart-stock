from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class TaxPlannerInvestmentRebateConfigRead(BaseModel):
    taxable_income_limit_pct: Decimal
    investment_rebate_pct: Decimal
    maximum_rebate_amount: Decimal


class TaxPlannerInvestmentCategoryRead(BaseModel):
    category_key: str
    display_label: str
    icon: str
    sort_order: int


class TaxPlannerLocationTierRead(BaseModel):
    location_code: str
    label: str
    minimum_amount: Decimal | None = None


class TaxPlannerMinimumTaxSummaryRead(BaseModel):
    national_minimum_amount: Decimal | None = None
    location_tiers: list[TaxPlannerLocationTierRead] = Field(default_factory=list)


class TaxPlannerConfigRead(BaseModel):
    tax_year_label: str
    display_name: str
    disclaimer: str
    minimum_tax_note: str
    investment_rebate: TaxPlannerInvestmentRebateConfigRead
    investment_categories: list[TaxPlannerInvestmentCategoryRead] = Field(default_factory=list)
    location_tiers: list[TaxPlannerLocationTierRead] = Field(default_factory=list)
    minimum_tax: TaxPlannerMinimumTaxSummaryRead = Field(default_factory=TaxPlannerMinimumTaxSummaryRead)
    config_source: str


class TaxSlabWrite(BaseModel):
    sort_order: int
    band_amount: Decimal | None = None
    rate: Decimal
    label: str
    is_allowance_band: bool = False


class TaxSlabRead(BaseModel):
    sort_order: int
    band_amount: Decimal | None
    rate: Decimal
    label: str
    is_allowance_band: bool


class TaxInvestmentCategoryWrite(BaseModel):
    category_key: str
    display_label: str | None = None
    sort_order: int
    is_enabled: bool = True


class TaxInvestmentCategoryRead(BaseModel):
    category_key: str
    display_label: str
    sort_order: int
    is_enabled: bool


class TaxPlannerConfigScalarsRead(BaseModel):
    id: UUID
    country_code: str
    tax_year_label: str
    display_name: str
    disclaimer: str
    minimum_tax_note: str
    threshold_general: Decimal
    threshold_woman_or_senior: Decimal
    threshold_person_with_disability: Decimal
    threshold_freedom_fighter: Decimal
    rebate_taxable_income_limit_pct: Decimal
    rebate_investment_pct: Decimal
    rebate_maximum_amount: Decimal
    minimum_tax_national: Decimal
    minimum_tax_dhaka_ctg: Decimal
    minimum_tax_other_city: Decimal
    minimum_tax_rural: Decimal

    model_config = {"from_attributes": True}


class TaxPlannerConfigScalarsWrite(BaseModel):
    tax_year_label: str = Field(min_length=7, max_length=20)
    display_name: str
    disclaimer: str
    minimum_tax_note: str
    threshold_general: Decimal
    threshold_woman_or_senior: Decimal
    threshold_person_with_disability: Decimal
    threshold_freedom_fighter: Decimal
    rebate_taxable_income_limit_pct: Decimal
    rebate_investment_pct: Decimal
    rebate_maximum_amount: Decimal
    minimum_tax_national: Decimal
    minimum_tax_dhaka_ctg: Decimal
    minimum_tax_other_city: Decimal
    minimum_tax_rural: Decimal


class TaxPlannerAdminConfigRead(BaseModel):
    config: TaxPlannerConfigScalarsRead
    slabs: list[TaxSlabRead] = Field(default_factory=list)


class TaxPlannerSlabsUpdateRequest(BaseModel):
    slabs: list[TaxSlabWrite]


class TaxInvestmentCategoriesUpdateRequest(BaseModel):
    categories: list[TaxInvestmentCategoryWrite]
