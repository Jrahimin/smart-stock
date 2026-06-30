from datetime import date, datetime
from decimal import Decimal
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.enums import DataQualityFlag, ExchangeCode, MarketSessionStatus
from app.modules.stock_details.stock_details_schemas import TraderDecisionSummaryRead
from app.modules.stocks.stocks_schemas import StockRead


class DailyPriceBase(BaseModel):
    stock_id: UUID
    trade_date: date
    open_price: Decimal = Field(ge=0)
    high_price: Decimal = Field(ge=0)
    low_price: Decimal = Field(ge=0)
    close_price: Decimal = Field(ge=0)
    adjusted_close_price: Decimal | None = Field(default=None, ge=0)
    previous_close_price: Decimal | None = Field(default=None, ge=0)
    price_change: Decimal | None = None
    price_change_percent: Decimal | None = None
    day_range: Decimal | None = Field(default=None, ge=0)
    day_range_percent: Decimal | None = Field(default=None, ge=0)
    vwap: Decimal | None = Field(default=None, ge=0)
    volume: int = Field(ge=0)
    trade_count: int | None = Field(default=None, ge=0)
    turnover: Decimal | None = Field(default=None, ge=0)
    source: str = Field(min_length=1, max_length=80)
    data_quality_flag: DataQualityFlag = DataQualityFlag.OK

    @field_validator("source", mode="before")
    @classmethod
    def normalize_source(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().upper()
        return value

    @model_validator(mode="after")
    def validate_price_range(self) -> Self:
        if self.high_price < self.low_price:
            raise ValueError("high_price must be greater than or equal to low_price")

        bounded_prices = {"close_price": self.close_price}
        for field_name, value in bounded_prices.items():
            if value is not None and (value < self.low_price or value > self.high_price):
                raise ValueError(f"{field_name} must be between low_price and high_price")

        return self


class DailyPriceCreate(DailyPriceBase):
    pass


class DailyPriceRead(DailyPriceBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


class DailyMarketSummaryBase(BaseModel):
    exchange: ExchangeCode
    trade_date: date
    index_name: str = Field(default="GENERAL", min_length=1, max_length=80)
    index_close: Decimal | None = Field(default=None, ge=0)
    index_change: Decimal | None = None
    index_change_percent: Decimal | None = None
    total_volume: int | None = Field(default=None, ge=0)
    total_turnover: Decimal | None = Field(default=None, ge=0)
    total_trades: int | None = Field(default=None, ge=0)
    advancing_issues: int | None = Field(default=None, ge=0)
    declining_issues: int | None = Field(default=None, ge=0)
    unchanged_issues: int | None = Field(default=None, ge=0)
    market_cap: Decimal | None = Field(default=None, ge=0)
    source: str = Field(min_length=1, max_length=80)
    has_suspicious_prices: bool = False
    data_quality_flag: DataQualityFlag = DataQualityFlag.OK

    @field_validator("index_name", "source", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().upper()
        return value


class DailyMarketSummaryCreate(DailyMarketSummaryBase):
    pass


class DailyMarketSummaryRead(DailyMarketSummaryBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


class LatestMarketPriceRead(BaseModel):
    stock: StockRead
    price: DailyPriceRead


class MarketPriceWindowRead(BaseModel):
    stock: StockRead
    prices: list[DailyPriceRead]
    trader_decision: TraderDecisionSummaryRead | None = None


class DsexIndexSnapshotRead(BaseModel):
    index_name: str = "DSEX"
    trade_date: date
    market_status: str
    index_close: Decimal
    index_change: Decimal
    index_change_percent: Decimal
    day_open: Decimal
    day_high: Decimal
    day_low: Decimal
    range_52w_low: Decimal
    range_52w_high: Decimal
    range_position_percent: Decimal
    return_1m_percent: Decimal | None = None
    return_6m_percent: Decimal | None = None
    return_1y_percent: Decimal | None = None
    total_volume: int | None = None
    total_turnover: Decimal | None = None
    total_trades: int | None = None
    advancing_issues: int
    declining_issues: int
    unchanged_issues: int
    source: str


class MarketSnapshotSyncResult(BaseModel):
    exchange: ExchangeCode
    trade_date: date
    source: str
    fetched_count: int
    created_count: int
    skipped_unknown_symbol_count: int
    suspicious_count: int = 0
    index_summary_upserted: bool = False
    index_summary_error: str | None = None
    session_skipped: bool = False
    session_skip_reason: str | None = None


class DailyNewsSyncResult(BaseModel):
    exchange: ExchangeCode
    trade_date: date
    news_upserted: int = 0
    news_skipped: int = 0
    news_error: str | None = None
    session_skipped: bool = False
    session_skip_reason: str | None = None


class MarketFreshnessRead(BaseModel):
    exchange: ExchangeCode
    trade_date: date | None
    last_synced_at: datetime | None
    next_sync_at: datetime | None
    snapshot_interval_minutes: int
    market_sync_interval_seconds: int
    dashboard_cache_ttl_seconds: int
    expected_delay_minutes: int
    market_open_time: str
    market_close_time: str
    market_status: MarketSessionStatus
    freshness_label: str


class DailyPriceIngestionResult(BaseModel):
    exchange: ExchangeCode
    trade_date: date
    source: str
    fetched_count: int
    created_count: int
    skipped_existing_count: int
    skipped_unknown_symbol_count: int
    suspicious_count: int = 0
    post_news_upserted: int = 0
    post_news_skipped: int = 0
    post_latest_price_trade_fields_patched: int = 0
    post_latest_price_trade_rows_missing: int = 0
    post_news_error: str | None = None
    post_latest_price_patch_error: str | None = None

