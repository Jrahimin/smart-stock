from pydantic import BaseModel, Field

from app.modules.market_data.market_data_schemas import DailyPriceRead
from app.modules.stock_details.stock_details_schemas import (
    BreakoutAnalysisRead,
    EventTimelineItemRead,
    OwnershipInsightRead,
    PatternDetectionRead,
    StockDecisionSupportRead,
    ValuationInsightRead,
)
from app.modules.stocks.stocks_schemas import StockRead


class FinancialMetricSnapshotRead(BaseModel):
    metric_code: str
    label: str
    value: float | None
    as_of_date: str | None
    fiscal_year: int | None


class FundamentalsSnapshotRead(BaseModel):
    metrics: list[FinancialMetricSnapshotRead] = Field(default_factory=list)
    latest_fiscal_year: int | None = None
    latest_as_of_date: str | None = None


class StockWorkspaceRead(BaseModel):
    stock: StockRead
    prices: list[DailyPriceRead]
    latest_trade_date: str
    decision_support: StockDecisionSupportRead
    fundamentals_snapshot: FundamentalsSnapshotRead | None = None


class StockWorkspacePatternsRead(BaseModel):
    latest_trade_date: str
    patterns: list[PatternDetectionRead] = Field(default_factory=list)
    primary_pattern: PatternDetectionRead | None = None
    breakout: BreakoutAnalysisRead | None = None


class StockWorkspaceEventsRead(BaseModel):
    latest_trade_date: str
    ownership: OwnershipInsightRead | None = None
    valuation: ValuationInsightRead | None = None
    events: list[EventTimelineItemRead] = Field(default_factory=list)
