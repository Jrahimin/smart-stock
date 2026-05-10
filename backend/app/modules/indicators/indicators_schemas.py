from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from app.core.enums import IndicatorType


class TechnicalIndicatorBase(BaseModel):
    stock_id: UUID
    trade_date: date
    indicator_type: IndicatorType
    period: int = Field(gt=0)
    value: Decimal
    normalized_value: Decimal | None = None
    signal_score: Decimal | None = None
    metadata_json: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("metadata", "metadata_json"),
        serialization_alias="metadata",
    )


class TechnicalIndicatorCreate(TechnicalIndicatorBase):
    pass


class TechnicalIndicatorRead(TechnicalIndicatorBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime

