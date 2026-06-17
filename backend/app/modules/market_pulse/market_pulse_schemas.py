from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import ExchangeCode, MarketAlertType, PulseFocusLabel, PulseScoreBand


class PulseScoreBreakdownRead(BaseModel):
    trend: int
    momentum: int
    volume: int
    signal_boost: int
    risk_penalty: int
    total: int
    contributors: list[str]
    band: PulseScoreBand


class FocusStockRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rank: int
    stock_id: UUID
    symbol: str
    name: str
    exchange: ExchangeCode
    pulse_score: int
    score_breakdown: PulseScoreBreakdownRead
    focus_label: PulseFocusLabel
    label_tone: str
    why_here: list[str] = Field(max_length=3)
    trigger: str
    action_summary: str
    latest_price: str
    price_change_percent: str
    price_tone: str
    sparkline_points: list[float]
    recommendation: str


class MarketPulseHeroRead(BaseModel):
    greeting: str
    attention_headline: str
    attention_subline: str
    last_updated_label: str | None
    relative_updated_label: str | None
    session_label: str | None
    focus_count: int
    recent_focus_count: int


class SinceLastVisitRead(BaseModel):
    visible: bool
    new_changes_count: int
    new_focus_count: int
    new_alerts_count: int
    summary_label: str


class TodayInsightRead(BaseModel):
    title: str
    explanation: str
    supporting_fact: str
    tone: str


class PulseChangeRead(BaseModel):
    id: str
    time_label: str
    change_type: str
    title: str
    description: str
    badge: str
    badge_tone: str
    symbol: str | None = None
    exchange: ExchangeCode | None = None


class MarketAlertRead(BaseModel):
    id: str
    alert_type: MarketAlertType
    event_title: str
    event_explanation: str
    why_it_matters: str
    metric_label: str
    significance: str
    time_label: str | None = None
    symbol: str | None = None
    exchange: ExchangeCode | None = None
    latest_price: str | None = None
    price_change_percent: str | None = None
    price_tone: str | None = None


class MarketMoverRead(BaseModel):
    symbol: str
    name: str
    exchange: ExchangeCode
    latest_price: str
    price_change_percent: str
    price_tone: str
    turnover: str | None = None


class MarketMoversRead(BaseModel):
    gainers: list[MarketMoverRead] = Field(default_factory=list)
    losers: list[MarketMoverRead] = Field(default_factory=list)


class MarketStoryMetricRead(BaseModel):
    label: str
    value: str
    sub_value: str | None = None
    tone: str


class MarketStoryRead(BaseModel):
    headline: str
    explanation: str
    tone: str
    metrics: list[MarketStoryMetricRead]


class MarketStateDimensionRead(BaseModel):
    key: str
    label: str
    value: str
    tone: str


class MarketStateRead(BaseModel):
    dimensions: list[MarketStateDimensionRead]
    overall_label: str
    overall_tone: str


class MoneyFlowSectorRead(BaseModel):
    sector: str
    change_label: str
    strength: float
    tone: str


class MoneyFlowRead(BaseModel):
    inflows: list[MoneyFlowSectorRead]
    outflows: list[MoneyFlowSectorRead]


class OpportunityScoreRead(BaseModel):
    score: int
    label: str
    history: list[int] = Field(default_factory=list)
    previous_session: int | None = None
    weekly_average: int | None = None
    trend_label: str | None = None


class PlaybookItemRead(BaseModel):
    profile: str
    summary: str
    guidance: str
    tone: str


class PlaybookRead(BaseModel):
    question: str
    items: list[PlaybookItemRead]


class HighPriorityRead(BaseModel):
    symbol: str
    name: str
    exchange: ExchangeCode
    reason: str
    trigger_level: str
    metric_label: str
    latest_price: str
    price_change_percent: str
    price_tone: str
    sparkline_points: list[float]


class LeadershipCardRead(BaseModel):
    kind: str
    title: str
    name: str
    detail: str | None = None
    subtitle: str | None = None
    tone: str
    href: str | None = None
    sparkline_points: list[float] = Field(default_factory=list)


class MarketLeadershipRead(BaseModel):
    cards: list[LeadershipCardRead]
    fresh_buy_signals: list[str]
    narrative: str = ""
    fresh_new_count: int = 0
    fresh_upgraded_count: int = 0


class MarketSummaryHighlightRead(BaseModel):
    label: str
    value: str
    tone: str


class TradingEnvironmentSignalRead(BaseModel):
    text: str
    tone: str


class TradingEnvironmentRead(BaseModel):
    signals: list[TradingEnvironmentSignalRead] = Field(default_factory=list)
    overall_label: str
    overall_tone: str


class MarketSummaryRead(BaseModel):
    text: str
    tone: str
    highlights: list[MarketSummaryHighlightRead] = Field(default_factory=list)
    trading_environment: TradingEnvironmentRead | None = None


class MarketBriefingRead(BaseModel):
    story: MarketStoryRead
    state: MarketStateRead
    money_flow: MoneyFlowRead
    opportunity_score: OpportunityScoreRead
    playbook: PlaybookRead
    high_priority: HighPriorityRead | None
    leadership: MarketLeadershipRead
    summary: MarketSummaryRead


class MarketPulsePreviousSnapshot(BaseModel):
    last_synced_at: datetime | None = None
    focus_stock_ids: list[UUID] = Field(default_factory=list)
    scores: dict[str, int] = Field(default_factory=dict)
    recommendations: dict[str, str] = Field(default_factory=dict)
    alert_ids: list[str] = Field(default_factory=list)


class MarketPulseRead(BaseModel):
    hero: MarketPulseHeroRead
    since_last_visit: SinceLastVisitRead
    briefing: MarketBriefingRead | None
    focus_stocks: list[FocusStockRead]
    monitor_candidates: list[FocusStockRead]
    today_insight: TodayInsightRead | None
    changes: list[PulseChangeRead]
    alerts: list[MarketAlertRead]
    market_movers: MarketMoversRead
    empty_state: str
    empty_message: str | None
    data_quality_note: str | None
