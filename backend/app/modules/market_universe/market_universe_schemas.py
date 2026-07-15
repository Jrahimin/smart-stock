from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.core.constants.trading_constants import (
    SCANNER_CONDITION_VERSION,
    TRADING_INPUT_SCHEMA_VERSION,
    TRADING_STRATEGY_VERSION,
    TRADING_THRESHOLD_VERSION,
)
from app.core.enums import DataQualityFlag, ExchangeCode, ScannerConditionId
from app.modules.stock_details.stock_details_schemas import (
    EligibilityResultRead,
    TechnicalSnapshotRead,
    TraderDecisionSummaryRead,
)
from app.modules.stocks.stocks_schemas import StockRead


class UniverseSessionRead(BaseModel):
    latest_trade_date: date
    close_price: Decimal
    open_price: Decimal | None = None
    volume: int = 0
    turnover: Decimal | None = None
    change_percent: Decimal | None = None
    data_quality_flag: DataQualityFlag = DataQualityFlag.OK
    updated_at: datetime | None = None


class ScannerConditionMatchRead(BaseModel):
    condition_id: ScannerConditionId
    reason_code: str
    reason: str
    rank_score: int = Field(ge=0, le=100)
    capacity_score: float = Field(ge=0)
    rank: int = Field(ge=1)


class ScannerResultRead(BaseModel):
    version: str = SCANNER_CONDITION_VERSION
    matches: list[ScannerConditionMatchRead] = Field(default_factory=list)


class ScoredUniverseRow(BaseModel):
    """Lightweight exchange-wide row — safe for universe:scored Redis cache."""

    stock: StockRead
    technical_snapshot: TechnicalSnapshotRead
    decision: TraderDecisionSummaryRead | None = None
    eligibility: EligibilityResultRead | None = None
    scanner: ScannerResultRead | None = None
    session: UniverseSessionRead


class UniverseRowsMetaRead(BaseModel):
    exchange: ExchangeCode
    listed_stock_count: int
    session_trade_date: date | None = None
    strategy_version: str = TRADING_STRATEGY_VERSION
    threshold_version: str = TRADING_THRESHOLD_VERSION
    input_schema_version: str = TRADING_INPUT_SCHEMA_VERSION
    scanner_version: str = SCANNER_CONDITION_VERSION
    source_last_synced_at: datetime | None = None
    payload_revision: str | None = None


class UniverseRowsRead(BaseModel):
    meta: UniverseRowsMetaRead
    rows: list[ScoredUniverseRow] = Field(default_factory=list)


class ScoredUniverseCacheRead(BaseModel):
    strategy_version: str
    threshold_version: str
    input_schema_version: str = TRADING_INPUT_SCHEMA_VERSION
    scanner_version: str = SCANNER_CONDITION_VERSION
    session_trade_date: date | None
    source_last_synced_at: datetime | None = None
    payload_revision: str | None = None
    rows: list[ScoredUniverseRow] = Field(default_factory=list)
