from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from app.core.enums import SignalType


class TradingSignalBase(BaseModel):
    stock_id: UUID
    trade_date: date
    signal_type: SignalType
    confidence: Decimal = Field(ge=0, le=1)
    momentum_score: Decimal | None = Field(default=None, ge=0, le=1)
    trend_score: Decimal | None = Field(default=None, ge=0, le=1)
    volume_score: Decimal | None = Field(default=None, ge=0, le=1)
    risk_score: Decimal | None = Field(default=None, ge=0, le=1)
    reason: str = Field(min_length=1)
    strategy_name: str = Field(min_length=1, max_length=120)
    components: dict[str, Any] = Field(default_factory=dict)
    metadata_json: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("metadata", "metadata_json"),
        serialization_alias="metadata",
    )
    is_active: bool = True


class TradingSignalCreate(TradingSignalBase):
    pass


class TradingSignalRead(TradingSignalBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime

