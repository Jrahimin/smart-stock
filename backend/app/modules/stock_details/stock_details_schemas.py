from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import (
    DataQualityFlag,
    DataReliabilityLabel,
    DecisionConstraintKind,
    EligibilityStatus,
    EvidenceDirection,
    ExchangeCode,
    HolderAction,
    LiquidityLabel,
    NonHolderAction,
    PatternStatus,
    RiskLevelLabel,
    StockDetailsSyncJobStatus,
    StockDetailsSyncScope,
    StockDetailsSyncTriggerType,
    TradePlanStatus,
    TraderRecommendation,
    TraderStance,
    TrendDirection,
    TurnoverProvenance,
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
            return [
                symbol.strip().upper()
                for symbol in value
                if isinstance(symbol, str) and symbol.strip()
            ]
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
    score_semantics: str = "HEURISTIC_LONG_SETUP_INDEX"


class RiskScoreRead(BaseModel):
    score: int
    label: RiskLevelLabel
    components: list[ScoreComponentRead]
    score_semantics: str = "LEGACY_COMPOSITE_RISK"


class DirectionalEvidenceComponentRead(BaseModel):
    key: str
    label: str
    direction: EvidenceDirection
    strength: int
    weight: float
    explanation: str


class DirectionalEvidenceRead(BaseModel):
    direction: EvidenceDirection
    bullish_score: int
    bearish_score: int
    coverage_percent: int
    components: list[DirectionalEvidenceComponentRead]
    score_semantics: str = "HEURISTIC_DIRECTIONAL_EVIDENCE"


class DataReliabilityRead(BaseModel):
    score: int
    label: DataReliabilityLabel
    reason_codes: list[str] = Field(default_factory=list)
    explanation: str
    score_semantics: str = "DETERMINISTIC_INPUT_RELIABILITY"


class TradingRiskRead(BaseModel):
    score: int
    label: RiskLevelLabel
    components: list[ScoreComponentRead]
    score_semantics: str = "HEURISTIC_TRADING_RISK"


class DecisionConstraintRead(BaseModel):
    code: str
    title: str
    kind: DecisionConstraintKind
    reason: str
    is_critical: bool = False


class CanonicalDecisionResultRead(BaseModel):
    stock_id: UUID
    exchange: ExchangeCode
    strategy_version: str
    threshold_version: str
    action_taxonomy: str
    as_of_date: date
    previous_session_date: date | None = None
    calculated_at: datetime
    shared_decision_id: str
    result_semantics: dict[str, str]
    recommendation: TraderRecommendation
    evidence_strength: int
    opportunity_score: int
    risk_label: RiskLevelLabel
    trade_plan_status: TradePlanStatus
    eligibility_status: EligibilityStatus
    primary_reason: str
    primary_reason_code: str
    stance: TraderStance
    non_holder_action: NonHolderAction
    holder_action: HolderAction


def canonical_decision_to_read(result: Any) -> CanonicalDecisionResultRead:
    return CanonicalDecisionResultRead(
        stock_id=result.stock_id,
        exchange=result.exchange,
        strategy_version=result.strategy_version,
        threshold_version=result.threshold_version,
        action_taxonomy=result.action_taxonomy,
        as_of_date=result.as_of_date,
        previous_session_date=result.previous_session_date,
        calculated_at=result.calculated_at,
        shared_decision_id=result.shared_decision_id,
        result_semantics=result.semantics_dict(),
        recommendation=result.recommendation,
        evidence_strength=result.evidence_strength,
        opportunity_score=result.opportunity_score,
        risk_label=result.risk_label,
        trade_plan_status=result.trade_plan_status,
        eligibility_status=result.eligibility_status,
        primary_reason=result.primary_reason,
        primary_reason_code=result.primary_reason_code,
        stance=result.stance,
        non_holder_action=result.non_holder_action,
        holder_action=result.holder_action,
    )


class TraderDecisionRead(BaseModel):
    recommendation: TraderRecommendation
    confidence: int
    reasoning: list[str]
    confidence_semantics: str = "HEURISTIC_EVIDENCE"
    evidence_strength: int | None = None
    evidence_strength_semantics: str = "HEURISTIC_DIRECTIONAL_EVIDENCE"
    primary_reason: str | None = None
    primary_reason_code: str | None = None
    stance: TraderStance | None = None
    non_holder_action: NonHolderAction | None = None
    holder_action: HolderAction | None = None
    constraints: list[DecisionConstraintRead] = Field(default_factory=list)
    canonical: CanonicalDecisionResultRead | None = None


class TraderDecisionSummaryRead(BaseModel):
    recommendation: TraderRecommendation
    confidence: int
    reason: str
    opportunity_score: int
    risk_label: RiskLevelLabel
    confidence_semantics: str = "HEURISTIC_EVIDENCE"
    evidence_strength: int | None = None
    evidence_strength_semantics: str = "HEURISTIC_DIRECTIONAL_EVIDENCE"
    primary_reason: str | None = None
    primary_reason_code: str | None = None
    stance: TraderStance | None = None
    non_holder_action: NonHolderAction | None = None
    holder_action: HolderAction | None = None
    data_reliability: DataReliabilityRead | None = None
    trading_risk: TradingRiskRead | None = None
    constraints: list[DecisionConstraintRead] = Field(default_factory=list)
    canonical: CanonicalDecisionResultRead | None = None


class TechnicalSnapshotRead(BaseModel):
    latest_price: float | None = None
    previous_close: float | None = None
    price_change: float | None = None
    price_change_percent: float | None = None
    volume: int = 0
    average_volume: float | None = None
    turnover: float | None = None
    rsi: float | None = None
    sma20: float | None = None
    ema20: float | None = None
    volatility: float | None = None
    support: float | None = None
    resistance: float | None = None
    trend: TrendDirection = TrendDirection.UNKNOWN
    data_quality: DataQualityFlag = DataQualityFlag.OK
    latest_trade_date: str | None = None
    ohlcv_row_count: int = 0
    sparkline_closes: list[float] = Field(default_factory=list, max_length=12)
    sma50: float | None = None
    atr14: float | None = None
    average_turnover: float | None = None
    return_5d_percent: float | None = None
    return_20d_percent: float | None = None
    is_breakout: bool = False
    structure: str = "neutral"
    gap_frequency_percent: float | None = None
    invalid_ohlcv_row_count: int = 0
    latest_row_valid: bool = True
    traded_session_count: int = 0
    zero_volume_session_count: int = 0
    traded_session_ratio: float = 0.0
    volume_observation_count: int = 0
    median_turnover: float | None = None
    turnover_observation_count: int = 0
    turnover_provenance: TurnoverProvenance = TurnoverProvenance.UNKNOWN
    analytical_price_basis: str = "RAW_UNADJUSTED"
    adjusted_close_coverage_ratio: float = 0.0


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
    status: TradePlanStatus = TradePlanStatus.UNAVAILABLE
    reasons: list[str] = Field(default_factory=list)


class LiquidityAnalysisRead(BaseModel):
    label: LiquidityLabel
    average_volume: float | None
    latest_volume_ratio: float | None
    volume_consistency_score: int
    average_turnover: float | None
    median_turnover: float | None = None
    turnover_observation_count: int = 0
    turnover_provenance: TurnoverProvenance = TurnoverProvenance.UNKNOWN
    traded_session_ratio: float = 0.0
    explanation: str


class EligibilityResultRead(BaseModel):
    status: EligibilityStatus
    reason_codes: list[str] = Field(default_factory=list)
    exchange_session_date: date | None = None
    latest_trade_date: date | None = None
    missed_session_count: int | None = None
    valid_ohlcv_row_count: int = 0
    invalid_ohlcv_row_count: int = 0
    traded_session_count: int = 0
    zero_volume_session_count: int = 0
    traded_session_ratio: float = 0.0
    quality_ok_count: int = 0
    quality_partial_count: int = 0
    quality_suspicious_count: int = 0
    median_turnover: float | None = None
    turnover_observation_count: int = 0
    turnover_provenance: TurnoverProvenance = TurnoverProvenance.UNKNOWN
    analytical_price_basis: str = "RAW_UNADJUSTED"
    corporate_action_status: str = "NONE"


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
    pattern_match_score: int | None = None
    score_semantics: str = "HEURISTIC_PATTERN_MATCH"


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
    direction: str = "breakout"
    evidence_score: int | None = None
    score_semantics: str = "HEURISTIC_BREAKOUT_EVIDENCE"


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
    canonical_decision: CanonicalDecisionResultRead | None = None
    technical_snapshot: TechnicalSnapshotRead | None = None
    opportunity: OpportunityScoreRead
    risk: RiskScoreRead
    directional_evidence: DirectionalEvidenceRead | None = None
    data_reliability: DataReliabilityRead | None = None
    trading_risk: TradingRiskRead | None = None
    price_position: PricePositionRead
    trade_plan: TradePlanRead
    liquidity: LiquidityAnalysisRead
    eligibility: EligibilityResultRead | None = None
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
        eligibility = kwargs["eligibility"]
        directional_evidence = kwargs["directional_evidence"]
        data_reliability = kwargs["data_reliability"]
        trading_risk = kwargs["trading_risk"]
        canonical_result = kwargs.get("canonical_result")

        pattern_reads = [
            PatternDetectionRead(
                name=pattern.name,
                confidence=pattern.confidence,
                status=pattern.status,
                breakout_level=pattern.breakout_level,
                target_estimate=pattern.target_estimate,
                invalidation_level=pattern.invalidation_level,
                swing_points=[
                    SwingPointRead(
                        index=point.index, date=point.date, price=point.price, kind=point.kind
                    )
                    for point in pattern.swing_points
                ],
                matched_reasons=pattern.matched_reasons,
                target_calculation=pattern.target_calculation,
                direction=pattern.direction,
                pattern_match_score=pattern.pattern_match_score,
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
                confidence_semantics="HEURISTIC_EVIDENCE",
                evidence_strength=decision.evidence_strength,
                primary_reason=decision.primary_reason,
                primary_reason_code=decision.primary_reason_code,
                stance=decision.stance,
                non_holder_action=decision.non_holder_action,
                holder_action=decision.holder_action,
                constraints=[
                    DecisionConstraintRead(
                        code=constraint.code,
                        title=constraint.title,
                        kind=constraint.kind,
                        reason=constraint.reason,
                        is_critical=constraint.is_critical,
                    )
                    for constraint in decision.constraints
                ],
                canonical=(
                    canonical_decision_to_read(canonical_result)
                    if canonical_result is not None
                    else None
                ),
            ),
            canonical_decision=(
                canonical_decision_to_read(canonical_result)
                if canonical_result is not None
                else None
            ),
            technical_snapshot=TechnicalSnapshotRead(
                latest_price=snapshot.latest_price,
                previous_close=snapshot.previous_close,
                price_change=snapshot.price_change,
                price_change_percent=snapshot.price_change_percent,
                volume=snapshot.volume,
                average_volume=snapshot.average_volume,
                turnover=snapshot.turnover,
                rsi=snapshot.rsi,
                sma20=snapshot.sma20,
                ema20=snapshot.ema20,
                volatility=snapshot.volatility,
                support=snapshot.support,
                resistance=snapshot.resistance,
                trend=snapshot.trend,
                data_quality=snapshot.data_quality,
                latest_trade_date=snapshot.latest_trade_date,
                ohlcv_row_count=snapshot.ohlcv_row_count,
                sparkline_closes=list(snapshot.sparkline_closes),
                sma50=snapshot.sma50,
                atr14=snapshot.atr14,
                average_turnover=snapshot.average_turnover,
                return_5d_percent=snapshot.return_5d_percent,
                return_20d_percent=snapshot.return_20d_percent,
                is_breakout=snapshot.is_breakout,
                structure=snapshot.structure,
                gap_frequency_percent=snapshot.gap_frequency_percent,
                invalid_ohlcv_row_count=snapshot.invalid_ohlcv_row_count,
                latest_row_valid=snapshot.latest_row_valid,
                traded_session_count=snapshot.traded_session_count,
                zero_volume_session_count=snapshot.zero_volume_session_count,
                traded_session_ratio=snapshot.traded_session_ratio,
                volume_observation_count=snapshot.volume_observation_count,
                median_turnover=snapshot.median_turnover,
                turnover_observation_count=snapshot.turnover_observation_count,
                turnover_provenance=snapshot.turnover_provenance,
                analytical_price_basis=snapshot.analytical_price_basis,
                adjusted_close_coverage_ratio=snapshot.adjusted_close_coverage_ratio,
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
            directional_evidence=DirectionalEvidenceRead(
                direction=directional_evidence.direction,
                bullish_score=directional_evidence.bullish_score,
                bearish_score=directional_evidence.bearish_score,
                coverage_percent=directional_evidence.coverage_percent,
                components=[
                    DirectionalEvidenceComponentRead(
                        key=component.key,
                        label=component.label,
                        direction=component.direction,
                        strength=component.strength,
                        weight=component.weight,
                        explanation=component.explanation,
                    )
                    for component in directional_evidence.components
                ],
            ),
            data_reliability=DataReliabilityRead(
                score=data_reliability.score,
                label=data_reliability.label,
                reason_codes=list(data_reliability.reason_codes),
                explanation=data_reliability.explanation,
            ),
            trading_risk=TradingRiskRead(
                score=trading_risk.score,
                label=trading_risk.label,
                components=[
                    ScoreComponentRead(
                        key=component.key,
                        label=component.label,
                        score=component.score,
                        weight=component.weight,
                        explanation=component.explanation,
                    )
                    for component in trading_risk.components
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
                status=trade_plan.status,
                reasons=list(trade_plan.reasons),
            ),
            liquidity=LiquidityAnalysisRead(
                label=liquidity.label,
                average_volume=liquidity.average_volume,
                latest_volume_ratio=liquidity.latest_volume_ratio,
                volume_consistency_score=liquidity.volume_consistency_score,
                average_turnover=liquidity.average_turnover,
                median_turnover=liquidity.median_turnover,
                turnover_observation_count=liquidity.turnover_observation_count,
                turnover_provenance=liquidity.turnover_provenance,
                traded_session_ratio=liquidity.traded_session_ratio,
                explanation=liquidity.explanation,
            ),
            eligibility=EligibilityResultRead(
                status=eligibility.status,
                reason_codes=list(eligibility.reason_codes),
                exchange_session_date=eligibility.exchange_session_date,
                latest_trade_date=eligibility.latest_trade_date,
                missed_session_count=eligibility.missed_session_count,
                valid_ohlcv_row_count=eligibility.valid_ohlcv_row_count,
                invalid_ohlcv_row_count=eligibility.invalid_ohlcv_row_count,
                traded_session_count=eligibility.traded_session_count,
                zero_volume_session_count=eligibility.zero_volume_session_count,
                traded_session_ratio=eligibility.traded_session_ratio,
                quality_ok_count=eligibility.quality_ok_count,
                quality_partial_count=eligibility.quality_partial_count,
                quality_suspicious_count=eligibility.quality_suspicious_count,
                median_turnover=eligibility.median_turnover,
                turnover_observation_count=eligibility.turnover_observation_count,
                turnover_provenance=eligibility.turnover_provenance,
                analytical_price_basis=eligibility.analytical_price_basis,
                corporate_action_status=eligibility.corporate_action_status,
            ),
            warnings=[
                SmartWarningRead(
                    code=warning.code,
                    title=warning.title,
                    message=warning.message,
                    severity=warning.severity,
                )
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
                    BreakoutFactorRead(
                        label=factor.label, matched=factor.matched, explanation=factor.explanation
                    )
                    for factor in breakout.factors
                ],
                breakout_level=breakout.breakout_level,
                confirmation_level=breakout.confirmation_level,
                projected_target=breakout.projected_target,
                explanation=breakout.explanation,
                direction=breakout.direction,
                evidence_score=breakout.evidence_score,
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
