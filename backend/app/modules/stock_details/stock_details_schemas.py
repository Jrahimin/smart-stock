from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import (
    ExchangeCode,
    LiquidityLabel,
    PatternStatus,
    RiskLevelLabel,
    StockDetailsSyncJobStatus,
    StockDetailsSyncScope,
    StockDetailsSyncTriggerType,
    TraderRecommendation,
    WarningSeverity,
)


class StockDetailsSyncRequest(BaseModel):
    exchange: ExchangeCode = ExchangeCode.DSE
    symbols: list[str] | None = None
    limit: int | None = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    historical_window_days: int | None = Field(default=None, ge=1, le=3650)
    force: bool = False
    trigger_type: StockDetailsSyncTriggerType = StockDetailsSyncTriggerType.MANUAL
    scope: StockDetailsSyncScope = StockDetailsSyncScope.FULL

    @field_validator("symbols", mode="before")
    @classmethod
    def normalize_symbols(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            value = [symbol.strip() for symbol in value.split(",")]
        if isinstance(value, list):
            return [symbol.strip().upper() for symbol in value if isinstance(symbol, str) and symbol.strip()]
        return value


class StockDetailsSyncResult(BaseModel):
    exchange: ExchangeCode
    scope: StockDetailsSyncScope = StockDetailsSyncScope.FULL
    source: str
    requested_count: int
    selected_count: int
    synced_count: int
    partial_count: int
    failed_count: int
    skipped_count: int
    stock_profile_count: int
    daily_price_count: int
    daily_price_skipped_count: int = 0
    metric_count: int
    valuation_count: int
    shareholding_count: int
    event_count: int
    latest_price_profile_fill_count: int = 0
    latest_price_shareholding_count: int = 0
    latest_price_valuation_count: int = 0


class StockDetailsSyncJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    stock_id: UUID
    source: str
    source_url: str | None
    status: StockDetailsSyncJobStatus
    trigger_type: StockDetailsSyncTriggerType
    started_at: datetime | None
    completed_at: datetime | None
    attempt_count: int
    error_message: str | None
    metadata_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class ScoreComponentRead(BaseModel):
    key: str
    label: str
    score: int
    weight: float
    explanation: str


class OpportunityScoreRead(BaseModel):
    score: int
    components: list[ScoreComponentRead]


class RiskScoreRead(BaseModel):
    score: int
    label: RiskLevelLabel
    components: list[ScoreComponentRead]


class TraderDecisionRead(BaseModel):
    recommendation: TraderRecommendation
    confidence: int
    reasoning: list[str]


class TraderDecisionSummaryRead(BaseModel):
    recommendation: TraderRecommendation
    confidence: int
    reason: str
    opportunity_score: int
    risk_label: RiskLevelLabel


class PricePositionRead(BaseModel):
    current_price: float | None
    distance_to_support_percent: float | None
    distance_to_resistance_percent: float | None
    above_sma20_percent: float | None
    above_ema20_percent: float | None


class TradePlanRead(BaseModel):
    entry_zone_low: float | None
    entry_zone_high: float | None
    stop_loss: float | None
    target_low: float | None
    target_high: float | None
    risk_reward_ratio: float | None
    explanation: str


class LiquidityAnalysisRead(BaseModel):
    label: LiquidityLabel
    average_volume: float | None
    latest_volume_ratio: float | None
    volume_consistency_score: int
    average_turnover: float | None
    explanation: str


class SmartWarningRead(BaseModel):
    code: str
    title: str
    message: str
    severity: WarningSeverity


class DataFreshnessRead(BaseModel):
    latest_trade_date: str | None
    ohlcv_row_count: int
    is_stale: bool
    is_sparse: bool
    missing_fields: list[str]
    data_quality: str
    source_summary: str


class SwingPointRead(BaseModel):
    index: int
    date: str
    price: float
    kind: str


class PatternDetectionRead(BaseModel):
    name: str
    confidence: int
    status: PatternStatus
    breakout_level: float | None
    target_estimate: float | None
    invalidation_level: float | None
    swing_points: list[SwingPointRead]
    matched_reasons: list[str]
    target_calculation: str
    direction: str


class BreakoutFactorRead(BaseModel):
    label: str
    matched: bool
    explanation: str


class BreakoutAnalysisRead(BaseModel):
    probability: int
    factors: list[BreakoutFactorRead]
    breakout_level: float | None
    confirmation_level: float | None
    projected_target: float | None
    explanation: str


class OwnershipTrendPointRead(BaseModel):
    snapshot_label: str | None = None
    value: float


class OwnershipTrendRead(BaseModel):
    segment_key: str
    label: str
    points: list[OwnershipTrendPointRead] = Field(default_factory=list)
    coverage_status: str
    direction: str | None = None


class OwnershipInsightRead(BaseModel):
    sponsor_percent: float | None
    institution_percent: float | None
    foreign_percent: float | None
    public_percent: float | None
    free_float_percent: float | None
    interpretations: list[str]
    snapshot_date: str | None
    source: str | None
    trends: list[OwnershipTrendRead] = Field(default_factory=list)


class ValuationInsightRead(BaseModel):
    close_price: float | None
    market_cap: float | None
    pe_ratio: float | None
    pb_ratio: float | None
    dividend_yield: float | None
    earnings_yield: float | None
    interpretations: list[str]
    valuation_date: str | None
    source: str | None


class EventTimelineItemRead(BaseModel):
    event_type: str
    category: str
    event_date: str
    title: str
    summary: str | None
    source: str | None


class StockDecisionSupportRead(BaseModel):
    stock_id: UUID
    symbol: str
    exchange: ExchangeCode
    decision: TraderDecisionRead
    opportunity: OpportunityScoreRead
    risk: RiskScoreRead
    price_position: PricePositionRead
    trade_plan: TradePlanRead
    liquidity: LiquidityAnalysisRead
    warnings: list[SmartWarningRead]
    data_freshness: DataFreshnessRead
    support: float | None
    resistance: float | None
    trend: str
    patterns: list[PatternDetectionRead] = Field(default_factory=list)
    primary_pattern: PatternDetectionRead | None = None
    breakout: BreakoutAnalysisRead | None = None
    ownership: OwnershipInsightRead | None = None
    valuation: ValuationInsightRead | None = None
    events: list[EventTimelineItemRead] = Field(default_factory=list)

    @classmethod
    def from_context(cls, **kwargs: Any) -> "StockDecisionSupportRead":
        from app.models import Stock

        stock: Stock = kwargs["stock"]
        snapshot = kwargs["snapshot"]
        decision = kwargs["decision"]
        opportunity = kwargs["opportunity"]
        risk = kwargs["risk"]
        price_position = kwargs["price_position"]
        trade_plan = kwargs["trade_plan"]
        liquidity = kwargs["liquidity"]
        warnings = kwargs["warnings"]
        patterns = kwargs["patterns"]
        breakout = kwargs["breakout"]
        ownership = kwargs["ownership"]
        valuation = kwargs["valuation"]
        events = kwargs["events"]
        is_stale = kwargs["is_stale"]
        is_sparse = kwargs["is_sparse"]
        missing_fields = kwargs["missing_fields"]
        confidence = kwargs["confidence"]

        pattern_reads = [
            PatternDetectionRead(
                name=pattern.name,
                confidence=pattern.confidence,
                status=pattern.status,
                breakout_level=pattern.breakout_level,
                target_estimate=pattern.target_estimate,
                invalidation_level=pattern.invalidation_level,
                swing_points=[
                    SwingPointRead(index=point.index, date=point.date, price=point.price, kind=point.kind)
                    for point in pattern.swing_points
                ],
                matched_reasons=pattern.matched_reasons,
                target_calculation=pattern.target_calculation,
                direction=pattern.direction,
            )
            for pattern in patterns
        ]

        return cls(
            stock_id=stock.id,
            symbol=stock.symbol,
            exchange=stock.exchange,
            decision=TraderDecisionRead(
                recommendation=decision.recommendation,
                confidence=confidence,
                reasoning=decision.reasoning,
            ),
            opportunity=OpportunityScoreRead(
                score=opportunity.score,
                components=[
                    ScoreComponentRead(
                        key=component.key,
                        label=component.label,
                        score=component.score,
                        weight=component.weight,
                        explanation=component.explanation,
                    )
                    for component in opportunity.components
                ],
            ),
            risk=RiskScoreRead(
                score=risk.score,
                label=risk.label,
                components=[
                    ScoreComponentRead(
                        key=component.key,
                        label=component.label,
                        score=component.score,
                        weight=component.weight,
                        explanation=component.explanation,
                    )
                    for component in risk.components
                ],
            ),
            price_position=PricePositionRead(
                current_price=price_position.current_price,
                distance_to_support_percent=price_position.distance_to_support_percent,
                distance_to_resistance_percent=price_position.distance_to_resistance_percent,
                above_sma20_percent=price_position.above_sma20_percent,
                above_ema20_percent=price_position.above_ema20_percent,
            ),
            trade_plan=TradePlanRead(
                entry_zone_low=trade_plan.entry_zone_low,
                entry_zone_high=trade_plan.entry_zone_high,
                stop_loss=trade_plan.stop_loss,
                target_low=trade_plan.target_low,
                target_high=trade_plan.target_high,
                risk_reward_ratio=trade_plan.risk_reward_ratio,
                explanation=trade_plan.explanation,
            ),
            liquidity=LiquidityAnalysisRead(
                label=liquidity.label,
                average_volume=liquidity.average_volume,
                latest_volume_ratio=liquidity.latest_volume_ratio,
                volume_consistency_score=liquidity.volume_consistency_score,
                average_turnover=liquidity.average_turnover,
                explanation=liquidity.explanation,
            ),
            warnings=[
                SmartWarningRead(code=warning.code, title=warning.title, message=warning.message, severity=warning.severity)
                for warning in warnings
            ],
            data_freshness=DataFreshnessRead(
                latest_trade_date=snapshot.latest_trade_date,
                ohlcv_row_count=snapshot.ohlcv_row_count,
                is_stale=is_stale,
                is_sparse=is_sparse,
                missing_fields=missing_fields,
                data_quality=snapshot.data_quality.value,
                source_summary="Computed from stored daily_prices and stock master profile.",
            ),
            support=snapshot.support,
            resistance=snapshot.resistance,
            trend=snapshot.trend.value,
            patterns=pattern_reads,
            primary_pattern=pattern_reads[0] if pattern_reads else None,
            breakout=BreakoutAnalysisRead(
                probability=breakout.probability,
                factors=[
                    BreakoutFactorRead(label=factor.label, matched=factor.matched, explanation=factor.explanation)
                    for factor in breakout.factors
                ],
                breakout_level=breakout.breakout_level,
                confirmation_level=breakout.confirmation_level,
                projected_target=breakout.projected_target,
                explanation=breakout.explanation,
            ),
            ownership=(
                OwnershipInsightRead(
                    sponsor_percent=ownership.sponsor_percent,
                    institution_percent=ownership.institution_percent,
                    foreign_percent=ownership.foreign_percent,
                    public_percent=ownership.public_percent,
                    free_float_percent=ownership.free_float_percent,
                    interpretations=ownership.interpretations,
                    snapshot_date=ownership.snapshot_date,
                    source=ownership.source,
                    trends=[
                        OwnershipTrendRead(
                            segment_key=trend.segment_key,
                            label=trend.label,
                            points=[
                                OwnershipTrendPointRead(
                                    snapshot_label=point.snapshot_label,
                                    value=point.value,
                                )
                                for point in trend.points
                            ],
                            coverage_status=trend.coverage_status,
                            direction=trend.direction,
                        )
                        for trend in ownership.trends
                    ],
                )
                if ownership
                else None
            ),
            valuation=(
                ValuationInsightRead(
                    close_price=valuation.close_price,
                    market_cap=valuation.market_cap,
                    pe_ratio=valuation.pe_ratio,
                    pb_ratio=valuation.pb_ratio,
                    dividend_yield=valuation.dividend_yield,
                    earnings_yield=valuation.earnings_yield,
                    interpretations=valuation.interpretations,
                    valuation_date=valuation.valuation_date,
                    source=valuation.source,
                )
                if valuation
                else None
            ),
            events=[
                EventTimelineItemRead(
                    event_type=event.event_type,
                    category=event.category,
                    event_date=event.event_date,
                    title=event.title,
                    summary=event.summary,
                    source=event.source,
                )
                for event in events
            ],
        )
