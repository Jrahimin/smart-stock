from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.core.enums import (
    DecisionDisplayAction,
    ExchangeCode,
    HolderAction,
    MarketDataState,
    PortfolioAttentionCode,
    PortfolioAttentionSeverity,
    PortfolioPriceStatus,
    PortfolioWhatNextCode,
    RiskLevelLabel,
    ScannerConditionId,
    TrendDirection,
)


class PortfolioEventRead(BaseModel):
    event_type: str
    event_date: date
    title: str
    summary: str | None = None


class PortfolioWorkspaceMetaRead(BaseModel):
    exchange: ExchangeCode
    published_market_date: date | None = None
    live_data_as_of: datetime | None = None
    data_state: MarketDataState = MarketDataState.STALE
    is_provisional: bool = False
    total_watchlisted: int = 0
    holding_count: int = 0
    valued_holding_count: int = 0
    costed_holding_count: int = 0


class PortfolioPulseRead(BaseModel):
    known_current_value: Decimal = Decimal("0")
    current_value_is_complete: bool = True
    known_invested_amount: Decimal = Decimal("0")
    invested_amount_is_complete: bool = True
    known_unrealized_gain_amount: Decimal = Decimal("0")
    known_unrealized_gain_percent: Decimal | None = None
    unrealized_gain_is_complete: bool = True
    estimated_daily_change_amount: Decimal = Decimal("0")
    estimated_daily_change_percent: Decimal | None = None
    daily_change_is_complete: bool = True
    holding_count: int = 0
    valued_holding_count: int = 0


class PortfolioHoldingRead(BaseModel):
    watchlist_item_id: UUID
    stock_id: UUID
    is_holding: bool = False
    symbol: str
    name: str
    exchange: ExchangeCode
    sector: str | None = None
    quantity: Decimal | None = None
    average_buy_price: Decimal | None = None
    note: str | None = None
    current_price: Decimal | None = None
    previous_close: Decimal | None = None
    price_change: Decimal | None = None
    price_change_percent: Decimal | None = None
    price_status: PortfolioPriceStatus = PortfolioPriceStatus.UNAVAILABLE
    latest_trade_date: date | None = None
    invested_amount: Decimal | None = None
    current_value: Decimal | None = None
    unrealized_gain_amount: Decimal | None = None
    unrealized_gain_percent: Decimal | None = None
    portfolio_weight: Decimal | None = None
    estimated_daily_change_amount: Decimal | None = None
    estimated_daily_contribution_percent: Decimal | None = None
    action: DecisionDisplayAction = DecisionDisplayAction.WAIT
    holder_action: HolderAction | None = None
    trend: TrendDirection = TrendDirection.UNKNOWN
    risk: RiskLevelLabel | None = None
    rsi: Decimal | None = None
    support: Decimal | None = None
    resistance: Decimal | None = None
    scanner_conditions: list[ScannerConditionId] = Field(default_factory=list)
    relevant_event: PortfolioEventRead | None = None
    decision_reason: str | None = None
    what_next_code: PortfolioWhatNextCode = PortfolioWhatNextCode.DATA_INCOMPLETE
    requires_attention: bool = False


class PortfolioAttentionRead(BaseModel):
    code: PortfolioAttentionCode
    severity: PortfolioAttentionSeverity
    stock_ids: list[UUID]
    symbols: list[str]
    count: int = Field(ge=1)


class PortfolioExposureRead(BaseModel):
    label: str
    current_value: Decimal
    weight_percent: Decimal


class PortfolioActionGroupRead(BaseModel):
    action: DecisionDisplayAction
    count: int
    current_value: Decimal


class PortfolioPositionReferenceRead(BaseModel):
    stock_id: UUID
    symbol: str
    name: str
    amount: Decimal | None = None
    percent: Decimal | None = None


class PortfolioShapeRead(BaseModel):
    position_exposure: list[PortfolioExposureRead] = Field(default_factory=list)
    sector_exposure: list[PortfolioExposureRead] = Field(default_factory=list)
    action_groups: list[PortfolioActionGroupRead] = Field(default_factory=list)
    largest_holding: PortfolioPositionReferenceRead | None = None
    strongest_position: PortfolioPositionReferenceRead | None = None
    weakest_position: PortfolioPositionReferenceRead | None = None
    best_daily_contributor: PortfolioPositionReferenceRead | None = None
    worst_daily_contributor: PortfolioPositionReferenceRead | None = None


class PortfolioWatchlistSuggestionRead(BaseModel):
    stock_id: UUID
    symbol: str
    name: str
    exchange: ExchangeCode
    sector: str | None = None
    current_price: Decimal | None = None
    price_change_percent: Decimal | None = None
    action: DecisionDisplayAction = DecisionDisplayAction.WAIT
    trend: TrendDirection = TrendDirection.UNKNOWN
    risk: RiskLevelLabel | None = None
    reason_code: str
    scanner_condition: ScannerConditionId | None = None
    relevant_event: PortfolioEventRead | None = None


class PortfolioWorkspaceRead(BaseModel):
    meta: PortfolioWorkspaceMetaRead
    pulse: PortfolioPulseRead
    attention: list[PortfolioAttentionRead] = Field(default_factory=list)
    holdings: list[PortfolioHoldingRead] = Field(default_factory=list)
    # All of the user's current watchlist entries. ``holdings`` is retained for
    # consumers that only need calculated positions; the portfolio workspace
    # uses this unified collection to show holdings alongside watched ideas.
    watchlist_items: list[PortfolioHoldingRead] = Field(default_factory=list)
    shape: PortfolioShapeRead = Field(default_factory=PortfolioShapeRead)
    watchlist_to_review: list[PortfolioWatchlistSuggestionRead] = Field(default_factory=list)


class PortfolioEmailPreferenceRead(BaseModel):
    enabled: bool = False
    locale: str = "bn"


class PortfolioEmailPreferenceWrite(BaseModel):
    enabled: bool
    locale: str | None = None
