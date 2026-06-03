from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import (
    ExchangeCode,
    StockDetailsSyncJobStatus,
    StockDetailsSyncScope,
    StockDetailsSyncTriggerType,
)


class StockDetailsSyncRequest(BaseModel):
    exchange: ExchangeCode = ExchangeCode.DSE
    symbols: list[str] | None = None
    limit: int | None = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    historical_window_days: int | None = Field(default=None, ge=1, le=3650)
    force: bool = False
    trigger_type: StockDetailsSyncTriggerType = StockDetailsSyncTriggerType.MANUAL
    scope: StockDetailsSyncScope = StockDetailsSyncScope.FULL

    @field_validator("symbols", mode="before")
    @classmethod
    def normalize_symbols(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            value = [symbol.strip() for symbol in value.split(",")]
        if isinstance(value, list):
            return [symbol.strip().upper() for symbol in value if isinstance(symbol, str) and symbol.strip()]
        return value


class StockDetailsSyncResult(BaseModel):
    exchange: ExchangeCode
    scope: StockDetailsSyncScope = StockDetailsSyncScope.FULL
    source: str
    requested_count: int
    selected_count: int
    synced_count: int
    partial_count: int
    failed_count: int
    skipped_count: int
    stock_profile_count: int
    daily_price_count: int
    daily_price_skipped_count: int = 0
    metric_count: int
    valuation_count: int
    shareholding_count: int
    event_count: int
    latest_price_profile_fill_count: int = 0
    latest_price_shareholding_count: int = 0
    latest_price_valuation_count: int = 0


class StockDetailsSyncJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    stock_id: UUID
    source: str
    source_url: str | None
    status: StockDetailsSyncJobStatus
    trigger_type: StockDetailsSyncTriggerType
    started_at: datetime | None
    completed_at: datetime | None
    attempt_count: int
    error_message: str | None
    metadata_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime
