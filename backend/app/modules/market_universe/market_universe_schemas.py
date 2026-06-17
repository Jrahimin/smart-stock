from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import DataQualityFlag, ExchangeCode, TrendDirection
from app.modules.stock_details.stock_details_schemas import TraderDecisionSummaryRead
from app.modules.stocks.stocks_schemas import StockRead


class TechnicalSnapshotRead(BaseModel):
    latest_price: float | None = None
    previous_close: float | None = None
    price_change: float | None = None
    price_change_percent: float | None = None
    volume: int = 0
    average_volume: float | None = None
    turnover: float | None = None
    rsi: float | None = None
    sma20: float | None = None
    ema20: float | None = None
    volatility: float | None = None
    support: float | None = None
    resistance: float | None = None
    trend: TrendDirection = TrendDirection.UNKNOWN
    data_quality: DataQualityFlag = DataQualityFlag.OK
    latest_trade_date: str | None = None
    ohlcv_row_count: int = 0
    sparkline_closes: list[float] = Field(default_factory=list, max_length=12)


class UniverseSessionRead(BaseModel):
    latest_trade_date: date
    close_price: Decimal
    open_price: Decimal | None = None
    volume: int = 0
    turnover: Decimal | None = None
    change_percent: Decimal | None = None
    data_quality_flag: DataQualityFlag = DataQualityFlag.OK
    updated_at: datetime | None = None


class ScoredUniverseRow(BaseModel):
    """Lightweight exchange-wide row — safe for universe:scored Redis cache."""

    stock: StockRead
    technical_snapshot: TechnicalSnapshotRead
    decision: TraderDecisionSummaryRead | None = None
    session: UniverseSessionRead


class UniverseRowsMetaRead(BaseModel):
    exchange: ExchangeCode
    listed_stock_count: int
    session_trade_date: date | None = None


class UniverseRowsRead(BaseModel):
    meta: UniverseRowsMetaRead
    rows: list[ScoredUniverseRow] = Field(default_factory=list)


class ScoredUniverseCacheRead(BaseModel):
    rows: list[ScoredUniverseRow] = Field(default_factory=list)
