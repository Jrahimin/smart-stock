from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.core.enums import ExchangeCode, TrendDirection
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
    listed_stock_count: int
    dsex_index: DsexIndexSnapshotRead
    summaries: list[DailyMarketSummaryRead]
