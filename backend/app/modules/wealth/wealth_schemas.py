from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import (
    LiquidityTier,
    MoneySnapshotAssetCategory,
    MoneySnapshotLiabilityCategory,
    TaxPlannerGender,
    TaxPlannerInsightType,
    TaxPlannerMode,
    WealthGoalCategory,
    WealthGoalStatus,
    WealthInsightSeverity,
    WealthScenarioType,
)


class WealthAssumptionsInput(BaseModel):
    country_code: str | None = "BD"
    inflation_rate: Decimal | None = None
    annual_rate: Decimal | None = None
    stock_return: Decimal | None = None
    compounding_periods_per_year: int | None = None


class WealthInsightCard(BaseModel):
    id: str
    title: str
    body: str
    severity: WealthInsightSeverity = WealthInsightSeverity.NEUTRAL
    action_label: str | None = None
    action_href: str | None = None


class WealthTimelinePoint(BaseModel):
    label: str
    value: Decimal
    real_value: Decimal | None = None


class WealthToolCalculateRequest(BaseModel):
    inputs: dict[str, Any] = Field(default_factory=dict)
    assumptions: WealthAssumptionsInput = Field(default_factory=WealthAssumptionsInput)


class WealthToolCalculateResponse(BaseModel):
    tool_slug: str
    headline_value: Decimal
    headline_label: str
    summary: str
    metrics: list[dict[str, str | Decimal | None]]
    timeline: list[WealthTimelinePoint] = Field(default_factory=list)
    insights: list[WealthInsightCard] = Field(default_factory=list)
    next_steps: list[dict[str, str]] = Field(default_factory=list)
    assumptions_used: dict[str, Any] = Field(default_factory=dict)
    disclaimer: str = "Educational scenario analysis only. Not financial, legal, or tax advice."


class TaxPlannerProfileInput(BaseModel):
    resident_individual: bool = True
    gender: TaxPlannerGender = TaxPlannerGender.PREFER_NOT_TO_SAY
    age: int | None = None
    senior_citizen: bool = False
    person_with_disability: bool = False
    freedom_fighter: bool = False


class TaxPlannerIncomeInput(BaseModel):
    annual_salary: Decimal = Decimal("0")
    other_yearly_income: Decimal = Decimal("0")
    festival_bonus: Decimal = Decimal("0")
    other_employment_benefits: Decimal = Decimal("0")
    self_employment_income: Decimal = Decimal("0")
    rental_income: Decimal = Decimal("0")
    bank_interest: Decimal = Decimal("0")
    fdr_profit: Decimal = Decimal("0")
    dps_profit: Decimal = Decimal("0")
    sanchayapatra_profit: Decimal = Decimal("0")
    dividend_income: Decimal = Decimal("0")
    other_income: Decimal = Decimal("0")


class TaxPlannerInvestmentInput(BaseModel):
    tax_saving_investments: Decimal | None = None
    life_insurance: Decimal = Decimal("0")
    provident_fund: Decimal = Decimal("0")
    dps_or_savings: Decimal = Decimal("0")
    sanchayapatra: Decimal = Decimal("0")
    stock_market: Decimal = Decimal("0")
    mutual_funds: Decimal = Decimal("0")
    approved_donations: Decimal = Decimal("0")
    other_eligible_investment: Decimal = Decimal("0")
    simulation_additional_investment: Decimal = Decimal("0")


class TaxPlannerCalculateRequest(BaseModel):
    mode: TaxPlannerMode = TaxPlannerMode.QUICK
    fiscal_year: str | None = "2025-2026"
    profile: TaxPlannerProfileInput = Field(default_factory=TaxPlannerProfileInput)
    income: TaxPlannerIncomeInput = Field(default_factory=TaxPlannerIncomeInput)
    investments: TaxPlannerInvestmentInput = Field(default_factory=TaxPlannerInvestmentInput)


class TaxPlannerSlabBreakdown(BaseModel):
    label: str
    taxable_amount: Decimal
    rate: Decimal
    tax: Decimal


class TaxPlannerInsight(BaseModel):
    id: str
    type: TaxPlannerInsightType
    title: str
    body: str
    severity: WealthInsightSeverity = WealthInsightSeverity.INFO
    amount: Decimal | None = None


class TaxPlannerCalculateResponse(BaseModel):
    fiscal_year: str
    mode: TaxPlannerMode
    total_income: Decimal
    tax_free_allowance: Decimal
    taxable_income: Decimal
    gross_tax: Decimal
    rebate: Decimal
    final_tax: Decimal
    current_eligible_investment: Decimal
    maximum_eligible_investment: Decimal
    remaining_eligible_investment: Decimal
    potential_additional_tax_saving: Decimal
    slab_breakdown: list[TaxPlannerSlabBreakdown] = Field(default_factory=list)
    insights: list[TaxPlannerInsight] = Field(default_factory=list)
    assumptions_used: dict[str, Any] = Field(default_factory=dict)
    disclaimer: str


class WealthComparisonEvaluateRequest(BaseModel):
    left_inputs: dict[str, Any] = Field(default_factory=dict)
    right_inputs: dict[str, Any] = Field(default_factory=dict)
    assumptions: WealthAssumptionsInput = Field(default_factory=WealthAssumptionsInput)


class WealthComparisonOptionResult(BaseModel):
    key: str
    label: str
    final_value: Decimal
    real_value: Decimal | None = None
    liquidity_note: str
    behavior_note: str
    risk_note: str


class WealthComparisonEvaluateResponse(BaseModel):
    comparison_slug: str
    title: str
    summary: str
    left: WealthComparisonOptionResult
    right: WealthComparisonOptionResult
    difference_value: Decimal
    difference_percent: Decimal | None = None
    insights: list[WealthInsightCard] = Field(default_factory=list)
    next_steps: list[dict[str, str]] = Field(default_factory=list)
    disclaimer: str = "Educational scenario analysis only. Not financial, legal, or tax advice."


class MoneySnapshotAssetInput(BaseModel):
    category: MoneySnapshotAssetCategory
    label: str
    value: Decimal
    currency: str = "BDT"
    liquidity_tier: LiquidityTier = LiquidityTier.IMMEDIATE
    metadata: dict[str, Any] = Field(default_factory=dict)


class MoneySnapshotLiabilityInput(BaseModel):
    category: MoneySnapshotLiabilityCategory
    label: str
    balance: Decimal
    interest_rate: Decimal | None = None
    monthly_emi: Decimal | None = None
    remaining_months: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class MoneySnapshotAssetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    category: MoneySnapshotAssetCategory
    label: str
    value: Decimal
    currency: str
    liquidity_tier: LiquidityTier
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class MoneySnapshotLiabilityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    category: MoneySnapshotLiabilityCategory
    label: str
    balance: Decimal
    interest_rate: Decimal | None
    monthly_emi: Decimal | None
    remaining_months: int | None
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class MoneySnapshotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    country_code: str
    currency: str
    monthly_savings: Decimal | None
    primary_goal: WealthGoalCategory | None
    assets: list[MoneySnapshotAssetRead] = Field(default_factory=list)
    liabilities: list[MoneySnapshotLiabilityRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class MoneySnapshotPatch(BaseModel):
    country_code: str | None = None
    currency: str | None = None
    monthly_savings: Decimal | None = None
    primary_goal: WealthGoalCategory | None = None
    assets: list[MoneySnapshotAssetInput] | None = None
    liabilities: list[MoneySnapshotLiabilityInput] | None = None


class WealthGoalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    category: WealthGoalCategory
    title: str
    target_amount: Decimal
    current_amount: Decimal
    monthly_contribution: Decimal | None
    horizon_months: int | None
    status: WealthGoalStatus
    created_at: datetime
    updated_at: datetime


class WealthScenarioCreate(BaseModel):
    scenario_type: WealthScenarioType
    slug: str
    title: str
    input_json: dict[str, Any] = Field(default_factory=dict)
    output_json: dict[str, Any] = Field(default_factory=dict)


class WealthScenarioRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    scenario_type: WealthScenarioType
    slug: str
    title: str
    input_json: dict[str, Any]
    output_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class WealthDashboardRead(BaseModel):
    net_worth: Decimal
    total_assets: Decimal
    total_liabilities: Decimal
    monthly_savings: Decimal | None
    passive_income_estimate: Decimal | None
    clarity_score: int
    asset_mix: list[dict[str, str | Decimal]]
    goals: list[WealthGoalRead] = Field(default_factory=list)
    saved_scenarios: list[WealthScenarioRead] = Field(default_factory=list)
    insights: list[WealthInsightCard] = Field(default_factory=list)


class WealthSeasonalContextRead(BaseModel):
    season_key: str
    title: str
    description: str
    featured_tool_slug: str | None = None
    featured_comparison_slug: str | None = None
    cta_label: str
    cta_href: str
