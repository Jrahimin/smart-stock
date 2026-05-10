from datetime import date
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.core.enums import DataQualityFlag, MarketEventType, ReportPeriodType, ReportStatus


class ApiFinancialMetric(BaseModel):
    fiscal_year: int
    statement_section: str
    metric_code: str
    value: Decimal
    as_of_date: date
    source_label: str
    source_value: str
    period_type: ReportPeriodType = ReportPeriodType.ANNUAL
    report_status: ReportStatus = ReportStatus.AUDITED
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("metric_code", mode="before")
    @classmethod
    def normalize_metric_code(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().upper()
        return value


class ApiDailyPrice(BaseModel):
    trade_date: date
    open_price: Decimal
    high_price: Decimal
    low_price: Decimal
    close_price: Decimal
    volume: int
    trade_count: int | None = None
    source_value: dict[str, Any] = Field(default_factory=dict)
    data_quality_flag: DataQualityFlag = DataQualityFlag.OK


class ApiStockProfile(BaseModel):
    name: str | None = None
    sector: str | None = None
    category: str | None = None
    listing_date: date | None = None
    paid_up_capital: Decimal | None = None
    market_cap: Decimal | None = None
    is_active: bool | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ApiValuationSnapshot(BaseModel):
    valuation_date: date
    close_price: Decimal | None = None
    market_cap: Decimal | None = None
    pe_ratio: Decimal | None = None
    pb_ratio: Decimal | None = None
    dividend_yield: Decimal | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    data_quality_flag: DataQualityFlag = DataQualityFlag.OK


class ApiShareholdingSnapshot(BaseModel):
    snapshot_date: date
    sponsor_director_percent: Decimal | None = None
    government_percent: Decimal | None = None
    institution_percent: Decimal | None = None
    foreign_percent: Decimal | None = None
    public_percent: Decimal | None = None
    total_shares: int | None = None
    circulating_shares: int | None = None
    free_float_percent: Decimal | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    data_quality_flag: DataQualityFlag = DataQualityFlag.OK


class ApiMarketEvent(BaseModel):
    event_type: MarketEventType = MarketEventType.NEWS
    event_date: date
    title: str
    summary: str | None = None
    source_url: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ApiStockDetailsPayload(BaseModel):
    symbol: str
    source: str
    snapshot_url: str
    historical_url: str
    company_url: str
    scrape_date: date
    stock_profile: ApiStockProfile | None = None
    daily_prices: list[ApiDailyPrice] = Field(default_factory=list)
    financial_metrics: list[ApiFinancialMetric] = Field(default_factory=list)
    valuation: ApiValuationSnapshot | None = None
    shareholding: ApiShareholdingSnapshot | None = None
    market_events: list[ApiMarketEvent] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    data_quality_flag: DataQualityFlag = DataQualityFlag.OK

    @field_validator("symbol", "source", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().upper()
        return value
