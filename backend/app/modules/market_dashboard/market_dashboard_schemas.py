from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import DecisionDisplayAction, ExchangeCode, TrendDirection
from app.modules.market_data.market_data_schemas import DailyMarketSummaryRead, DsexIndexSnapshotRead


class DashboardMoverRead(BaseModel):
    stock_id: UUID
    symbol: str
    name: str
    exchange: ExchangeCode
    latest_price: Decimal
    price_change_percent: Decimal | None = None
    turnover: Decimal | None = None
    volume: int
    trend_direction: TrendDirection


class DashboardMoversRead(BaseModel):
    session_trade_date: date | None = None
    gainers: list[DashboardMoverRead]
    losers: list[DashboardMoverRead]
    turnover_leaders: list[DashboardMoverRead]
    volume_leaders: list[DashboardMoverRead]


class DashboardOverviewRead(BaseModel):
    exchange: ExchangeCode
    session_trade_date: date | None = None
    last_synced_at: datetime | None = None
    listed_stock_count: int
    dsex_index: DsexIndexSnapshotRead
    summaries: list[DailyMarketSummaryRead]


class DashboardSectorRead(BaseModel):
    name: str
    change_percent: Decimal
    stock_count: int


class DashboardTopGainerRead(BaseModel):
    symbol: str
    name: str
    change_percent: Decimal


class DashboardSectorsRead(BaseModel):
    session_trade_date: date | None = None
    sectors: list[DashboardSectorRead] = Field(default_factory=list)
    top_gainer: DashboardTopGainerRead | None = None


class DashboardTimelineItemRead(BaseModel):
    time: str
    title: str
    description: str


class DashboardMarketAlertsRead(BaseModel):
    session_trade_date: date | None = None
    items: list[DashboardTimelineItemRead] = Field(default_factory=list)


class DashboardSignalRead(BaseModel):
    symbol: str
    exchange: ExchangeCode
    signal: DecisionDisplayAction
    confidence: int
    confidence_semantics: str = "HEURISTIC_EVIDENCE"
    reason: str
    primary_reason_code: str | None = None
    entry_condition: str | None = None
    risk: str
    priority: str
    supporting_context: list[str] = Field(default_factory=list)
    generated_at: str


class DashboardStocksInFocusRead(BaseModel):
    session_trade_date: date | None = None
    evaluated_count: int = 0
    signals: list[DashboardSignalRead] = Field(default_factory=list)


class DashboardHeatmapTileRead(BaseModel):
    stock_id: UUID
    symbol: str
    sector: str
    change_percent: Decimal
    weight: Decimal
    tone: str
    latest_price: Decimal
    turnover: Decimal
    turnover_value: Decimal
    liquidity_score: int


class DashboardHeatmapRead(BaseModel):
    session_trade_date: date | None = None
    tiles: list[DashboardHeatmapTileRead] = Field(default_factory=list)


class DashboardInsightRead(BaseModel):
    id: str
    title: str
    description: str
    tone: str
    category: str
    source: str


class DashboardMarketSentimentRead(BaseModel):
    exchange: ExchangeCode
    session_trade_date: date | None = None
    market_mood: str
    signal_count: int
    price_backed_count: int
    turnover_value: Decimal | None = None
    has_partial_data: bool = False
    insights: list[DashboardInsightRead] = Field(default_factory=list)
