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


class FinancialTrendPointRead(BaseModel):
    fiscal_year: int
    value: float


class FinancialTrendRead(BaseModel):
    metric_code: str
    label: str
    latest_value: float | None
    points: list[FinancialTrendPointRead] = Field(default_factory=list)
    coverage_status: str
    direction: str | None = None


class ValuationMetricContextRead(BaseModel):
    metric_key: str
    stock_value: float | None
    sector_median: float | None
    relative_label: str | None
    peer_count: int
    has_sufficient_peers: bool


class ValuationContextRead(BaseModel):
    pe: ValuationMetricContextRead | None = None
    pb: ValuationMetricContextRead | None = None


class DividendIntelligenceRead(BaseModel):
    last_dividend_year: int | None = None
    last_dividend_value: str | None = None


class DisplayMetricsRead(BaseModel):
    """Backend-resolved mark-to-market metrics for page display (Rule #1)."""

    current_price: float | None = None
    pe_ratio: float | None = None
    pb_ratio: float | None = None
    earnings_yield: float | None = None
    market_cap: float | None = None
    marked_to_latest_price: bool = False
    pe_helper: str | None = None
    as_of_trade_date: str | None = None


class SectorPerformerRead(BaseModel):
    symbol: str
    change_percent: float


class SectorRankRead(BaseModel):
    key: str
    label: str
    rank: int
    total: int


class ComparativeMetricRead(BaseModel):
    key: str
    label: str
    stock_value: float | None
    sector_median: float | None
    market_median: float | None


class SectorContextRead(BaseModel):
    sector_name: str
    stock_count: int
    median_pe: float | None = None
    median_pb: float | None = None
    sector_trend_percent: float | None = None
    sector_trend_window: str | None = None
    top_performer: SectorPerformerRead | None = None
    worst_performer: SectorPerformerRead | None = None
    ranks: list[SectorRankRead] = Field(default_factory=list)
    comparative_snapshot: list[ComparativeMetricRead] = Field(default_factory=list)


class StockWorkspaceRead(BaseModel):
    """Page aggregate / read model for the public stock details page.

    Not the Stock Entity itself — a composed projection over the Stock domain
    (persisted facts + decision engines) for one page consumer.
    """

    stock: StockRead
    prices: list[DailyPriceRead]
    latest_trade_date: str
    decision_support: StockDecisionSupportRead
    fundamentals_snapshot: FundamentalsSnapshotRead | None = None
    financial_trends: list[FinancialTrendRead] = Field(default_factory=list)
    valuation_context: ValuationContextRead | None = None
    dividend_intelligence: DividendIntelligenceRead | None = None
    display_metrics: DisplayMetricsRead | None = None


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
