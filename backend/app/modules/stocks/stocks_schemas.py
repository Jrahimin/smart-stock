from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import ExchangeCode


class StockBase(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=255)
    exchange: ExchangeCode
    sector: str | None = Field(default=None, max_length=120)
    category: str | None = Field(default=None, max_length=32)
    isin: str | None = Field(default=None, max_length=32)
    listing_date: date | None = None
    lot_size: int | None = Field(default=None, ge=0)
    paid_up_capital: Decimal | None = Field(default=None, ge=0)
    market_cap: Decimal | None = Field(default=None, ge=0)
    is_active: bool = True
    should_fetch_details: bool = False

    @field_validator("symbol", mode="before")
    @classmethod
    def normalize_symbol(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip().upper()
        return value

    @field_validator("isin", mode="before")
    @classmethod
    def normalize_isin(cls, value: Any) -> Any:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        stripped_value = value.strip().upper()
        return stripped_value or None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("sector", "category", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: Any) -> Any:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        stripped_value = value.strip()
        return stripped_value or None


class StockCreate(StockBase):
    pass


class StockRead(StockBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


class ActiveStockSymbolRead(BaseModel):
    exchange: ExchangeCode
    symbol: str

