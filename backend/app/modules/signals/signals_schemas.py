from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator

from app.core.enums import SignalType, TraderRecommendation
from app.modules.stock_details.stock_details_schemas import TraderDecisionSummaryRead
from app.modules.stocks.stocks_schemas import StockRead


class StockTraderDecisionRead(BaseModel):
    stock: StockRead
    decision: TraderDecisionSummaryRead
    latest_trade_date: date | None = None


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
    strategy_version: str | None = Field(default=None, min_length=1, max_length=80)
    threshold_version: str | None = Field(default=None, min_length=1, max_length=80)
    action_taxonomy: str | None = Field(default=None, min_length=1, max_length=80)
    canonical_recommendation: TraderRecommendation | None = None
    signal_as_of: date | None = None
    calculated_at: datetime | None = None
    shared_decision_id: str | None = Field(default=None, min_length=1, max_length=64)
    components: dict[str, Any] = Field(default_factory=dict)
    metadata_json: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("metadata", "metadata_json"),
        serialization_alias="metadata",
    )
    is_active: bool = True

    @model_validator(mode="after")
    def validate_versioned_identity(self) -> "TradingSignalBase":
        identity_values = (
            self.strategy_version,
            self.threshold_version,
            self.action_taxonomy,
            self.canonical_recommendation,
            self.signal_as_of,
            self.calculated_at,
            self.shared_decision_id,
        )
        if not any(value is not None for value in identity_values):
            return self
        if not all(value is not None for value in identity_values):
            raise ValueError(
                "Versioned signals require strategy/threshold/taxonomy, canonical action, "
                "signal_as_of, calculated_at, and shared_decision_id"
            )
        return self


class TradingSignalCreate(TradingSignalBase):
    pass


class TradingSignalRead(TradingSignalBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime

