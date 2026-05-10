from abc import ABC, abstractmethod
from datetime import date
from decimal import Decimal
from typing import Self

from pydantic import BaseModel, field_validator, model_validator

from app.core.enums import DataQualityFlag


class IngestedDailyPrice(BaseModel):
    symbol: str
    trade_date: date
    open_price: Decimal
    high_price: Decimal
    low_price: Decimal
    close_price: Decimal
    adjusted_close_price: Decimal | None = None
    previous_close_price: Decimal | None = None
    volume: int
    trade_count: int | None = None
    turnover: Decimal | None = None
    source: str
    data_quality_flag: DataQualityFlag = DataQualityFlag.OK

    @field_validator("symbol", "source", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().upper()
        return value

    @model_validator(mode="after")
    def validate_prices(self) -> Self:
        if self.high_price < self.low_price:
            raise ValueError("high_price must be greater than or equal to low_price")
        return self


class MarketDataSource(ABC):
    source_name: str

    @abstractmethod
    async def fetch_daily_prices(self, trade_date: date) -> list[IngestedDailyPrice]:
        """Fetch normalized daily prices for a trade date."""

