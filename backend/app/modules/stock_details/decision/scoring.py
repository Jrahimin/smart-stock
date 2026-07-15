from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.core.constants.trading_constants import (
    CATEGORY_RISK_SCORES,
    ELEVATED_VOLATILITY_THRESHOLD,
    GAP_RISK_VOLATILITY_BONUS,
    HIGH_VOLATILITY_THRESHOLD,
    MIN_RISK_REWARD_RATIO,
    NEAR_LEVEL_PERCENT_THRESHOLD,
    OPPORTUNITY_WEIGHT_MOMENTUM,
    OPPORTUNITY_WEIGHT_PRICE_POSITION,
    OPPORTUNITY_WEIGHT_RISK_PENALTY,
    OPPORTUNITY_WEIGHT_TREND,
    OPPORTUNITY_WEIGHT_VOLUME,
    OVEREXTENSION_ABOVE_SMA20_PERCENT,
    OVEREXTENSION_RETURN_20D_PERCENT,
    RECOMMENDATION_BREAKOUT_VOLUME_RATIO,
    RECOMMENDATION_HOLD_OPPORTUNITY_MIN,
    RETURN_MEDIUM_LOOKBACK,
    RETURN_SHORT_LOOKBACK,
    RISK_WEIGHT_CATEGORY,
    RISK_WEIGHT_DATA_QUALITY,
    RISK_WEIGHT_LIQUIDITY,
    RISK_WEIGHT_OVEREXTENSION,
    RISK_WEIGHT_STALE_DATA,
    RISK_WEIGHT_VOLATILITY,
    RSI_OVERBOUGHT_THRESHOLD,
    RSI_OVERSOLD_THRESHOLD,
    VOLUME_EXPANSION_RATIO,
    VOLUME_THIN_RATIO,
)
from app.core.enums import (
    EligibilityStatus,
    EntryReadiness,
    EntryTiming,
    HolderAction,
    LiquidityLabel,
    NonHolderAction,
    OpportunityQuality,
    RiskLevelLabel,
    TradePlanStatus,
    TraderRecommendation,
    TraderStance,
    TrendDirection,
)
from app.modules.stock_details.decision.technical import TechnicalSnapshot

if TYPE_CHECKING:
    from app.modules.stock_details.decision.constraints import (
        ConstraintResult,
        DecisionConstraint,
    )
    from app.modules.stock_details.decision.evidence import (
        DataReliabilityResult,
        DirectionalEvidenceResult,
    )
    from app.modules.stock_details.decision.market_regime import MarketRegimeResult
    from app.modules.stock_details.decision.risk import TradingRiskResult


def _clamp(value: float, minimum: float = 0.0, maximum: float = 100.0) -> int:
    return int(max(minimum, min(maximum, round(value))))


def _percent_distance(from_price: float | None, to_price: float | None) -> float | None:
    if from_price is None or to_price is None or from_price <= 0:
        return None
    return ((to_price - from_price) / from_price) * 100


def _risk_allows_new_buy(risk: RiskScoreResult) -> bool:
    return risk.label in {RiskLevelLabel.LOW, RiskLevelLabel.MEDIUM}


def _high_risk_context(risk: RiskScoreResult) -> bool:
    return risk.label in {RiskLevelLabel.HIGH, RiskLevelLabel.SPECULATIVE}


def _blocks_buy_on_risk_reward(risk_reward: float | None, *, near_resistance: bool) -> bool:
    if risk_reward is None or not near_resistance:
        return False
    return risk_reward < MIN_RISK_REWARD_RATIO


def _momentum_extended(snapshot: TechnicalSnapshot) -> bool:
    return snapshot.rsi is not None and snapshot.rsi > RSI_OVERBOUGHT_THRESHOLD


def _momentum_blocks_buy(snapshot: TechnicalSnapshot) -> bool:
    return snapshot.rsi is not None and snapshot.rsi > 78


def _volume_supports_breakout(snapshot: TechnicalSnapshot) -> bool:
    if not snapshot.average_volume or snapshot.average_volume <= 0:
        return True
    return snapshot.volume / snapshot.average_volume >= RECOMMENDATION_BREAKOUT_VOLUME_RATIO


def _breakout_confirmed(snapshot: TechnicalSnapshot) -> bool:
    """A structural breakout above prior resistance with volume participation."""
    return snapshot.is_breakout and _volume_supports_breakout(snapshot)


def _constructive_uptrend(snapshot: TechnicalSnapshot, opportunity_score: int) -> bool:
    return (
        snapshot.trend == TrendDirection.UPTREND
        and opportunity_score >= RECOMMENDATION_HOLD_OPPORTUNITY_MIN
    )


@dataclass(frozen=True)
class ScoreComponent:
    key: str
    label: str
    score: int
    weight: float
    explanation: str


@dataclass(frozen=True)
class OpportunityScoreResult:
    score: int
    components: list[ScoreComponent]


@dataclass(frozen=True)
class RiskScoreResult:
    score: int
    label: RiskLevelLabel
    components: list[ScoreComponent]


@dataclass(frozen=True)
class DecisionResult:
    recommendation: TraderRecommendation
    confidence: int
    reasoning: list[str]
    evidence_strength: int = 0
    primary_reason: str = ""
    primary_reason_code: str = "no_directional_edge"
    stance: TraderStance = TraderStance.NEUTRAL
    non_holder_action: NonHolderAction = NonHolderAction.WAIT
    holder_action: HolderAction = HolderAction.REVIEW
    constraints: tuple[DecisionConstraint, ...] = ()


def _score_trend(snapshot: TechnicalSnapshot) -> ScoreComponent:
    score = 50.0
    explanations: list[str] = []
    if snapshot.trend == TrendDirection.UPTREND:
        score = 82
        explanations.append("Price is in an uptrend above moving averages.")
    elif snapshot.trend == TrendDirection.DOWNTREND:
        score = 22
        explanations.append("Price is in a downtrend below moving averages.")
    elif snapshot.trend == TrendDirection.SIDEWAYS:
        score = 48
        explanations.append("Trend is sideways; direction is not clearly established.")
    else:
        score = 35
        explanations.append("Trend cannot be determined from available data.")

    distance = _percent_distance(snapshot.sma20, snapshot.latest_price)
    if distance is not None:
        if distance > 2:
            score = min(100, score + 8)
            explanations.append(f"Price is {distance:.1f}% above SMA20.")
        elif distance < -2:
            score = max(0, score - 8)
            explanations.append(f"Price is {abs(distance):.1f}% below SMA20.")

    return ScoreComponent(
        key="trend",
        label="Trend",
        score=_clamp(score),
        weight=OPPORTUNITY_WEIGHT_TREND,
        explanation=" ".join(explanations),
    )


def _score_momentum(snapshot: TechnicalSnapshot) -> ScoreComponent:
    score = 50.0
    explanations: list[str] = []
    if snapshot.rsi is not None:
        if snapshot.rsi < RSI_OVERSOLD_THRESHOLD:
            score = 72
            explanations.append(f"RSI {snapshot.rsi:.1f} is oversold; rebound potential exists.")
        elif snapshot.rsi > RSI_OVERBOUGHT_THRESHOLD:
            score = 28
            explanations.append(f"RSI {snapshot.rsi:.1f} is extended; upside may be crowded.")
        else:
            score = 55 + (snapshot.rsi - 50) * 0.4
            explanations.append(f"RSI {snapshot.rsi:.1f} is in a neutral-to-positive zone.")

    # Prefer multi-session rate-of-change over a single day's move so momentum is
    # not whipsawed by one session.
    return_5d = snapshot.return_5d_percent
    return_20d = snapshot.return_20d_percent
    if return_5d is not None:
        if return_5d > 3:
            score = min(100, score + 10)
            explanations.append(
                f"{RETURN_SHORT_LOOKBACK}-day momentum is positive ({return_5d:.1f}%)."
            )
        elif return_5d < -3:
            score = max(0, score - 10)
            explanations.append(
                f"{RETURN_SHORT_LOOKBACK}-day momentum is negative ({return_5d:.1f}%)."
            )
    elif snapshot.price_change_percent is not None:
        if snapshot.price_change_percent > 1.5:
            score = min(100, score + 10)
            explanations.append("Recent session momentum is positive.")
        elif snapshot.price_change_percent < -1.5:
            score = max(0, score - 10)
            explanations.append("Recent session momentum is negative.")
    if return_20d is not None:
        if return_20d > 8:
            score = min(100, score + 6)
            explanations.append(
                f"{RETURN_MEDIUM_LOOKBACK}-day trend momentum is strong ({return_20d:.1f}%)."
            )
        elif return_20d < -8:
            score = max(0, score - 6)
            explanations.append(
                f"{RETURN_MEDIUM_LOOKBACK}-day trend momentum is weak ({return_20d:.1f}%)."
            )
    return ScoreComponent(
        key="momentum",
        label="Momentum",
        score=_clamp(score),
        weight=OPPORTUNITY_WEIGHT_MOMENTUM,
        explanation=" ".join(explanations) or "Momentum data is limited.",
    )


def _score_volume(snapshot: TechnicalSnapshot, liquidity_label: LiquidityLabel) -> ScoreComponent:
    score = 50.0
    explanations: list[str] = []
    if snapshot.average_volume and snapshot.average_volume > 0:
        ratio = snapshot.volume / snapshot.average_volume
        if ratio >= VOLUME_EXPANSION_RATIO:
            score = 85
            explanations.append(f"Volume is {ratio:.1f}x the 20-day average.")
        elif ratio <= VOLUME_THIN_RATIO:
            score = 25
            explanations.append(f"Volume is only {ratio:.1f}x the 20-day average.")
        else:
            score = 45 + ratio * 20
            explanations.append(f"Volume participation is near normal at {ratio:.1f}x average.")
    if liquidity_label in {LiquidityLabel.THIN, LiquidityLabel.ILLIQUID}:
        score = max(0, score - 15)
        explanations.append("Liquidity is thin, reducing conviction.")
    return ScoreComponent(
        key="volume",
        label="Volume",
        score=_clamp(score),
        weight=OPPORTUNITY_WEIGHT_VOLUME,
        explanation=" ".join(explanations) or "Volume baseline unavailable.",
    )


def _score_price_position(snapshot: TechnicalSnapshot) -> ScoreComponent:
    score = 50.0
    explanations: list[str] = []
    if snapshot.latest_price is None:
        return ScoreComponent(
            key="price_position",
            label="Price Position",
            score=35,
            weight=OPPORTUNITY_WEIGHT_PRICE_POSITION,
            explanation="Latest price unavailable.",
        )
    support_distance = _percent_distance(snapshot.support, snapshot.latest_price)
    if support_distance is not None:
        if support_distance < 0:
            score -= 20
            explanations.append("Price is below support; structure is weakened.")
        elif support_distance <= NEAR_LEVEL_PERCENT_THRESHOLD:
            score += 12
            explanations.append("Price is near support, offering a favorable risk zone.")

    if _breakout_confirmed(snapshot):
        score += 12
        explanations.append("Price is breaking out above prior resistance on expanding volume.")
    else:
        resistance_distance = _percent_distance(snapshot.latest_price, snapshot.resistance)
        if resistance_distance is not None:
            if 0 <= resistance_distance <= 2.5:
                score -= 18
                explanations.append("Price is near resistance; upside may be limited.")
            elif resistance_distance >= 8:
                score += 8
                explanations.append("There is still room to resistance.")
    return ScoreComponent(
        key="price_position",
        label="Price Position",
        score=_clamp(score),
        weight=OPPORTUNITY_WEIGHT_PRICE_POSITION,
        explanation=" ".join(explanations) or "Support/resistance context is neutral.",
    )


def _score_risk_penalty(risk_score: int) -> ScoreComponent:
    penalty = min(100, risk_score)
    adjusted = 100 - penalty
    return ScoreComponent(
        key="risk_adjustment",
        label="Risk Adjustment",
        score=_clamp(adjusted),
        weight=OPPORTUNITY_WEIGHT_RISK_PENALTY,
        explanation=f"Higher risk ({risk_score}) reduces opportunity conviction.",
    )


def compute_opportunity_score(
    snapshot: TechnicalSnapshot, risk_score: int, liquidity_label: LiquidityLabel
) -> OpportunityScoreResult:
    components = [
        _score_trend(snapshot),
        _score_momentum(snapshot),
        _score_volume(snapshot, liquidity_label),
        _score_price_position(snapshot),
        _score_risk_penalty(risk_score),
    ]
    weighted = sum(component.score * component.weight for component in components)
    return OpportunityScoreResult(score=_clamp(weighted), components=components)


def compute_risk_score(
    snapshot: TechnicalSnapshot,
    category: str | None,
    liquidity_label: LiquidityLabel,
    *,
    is_stale: bool,
    is_sparse: bool,
) -> RiskScoreResult:
    components: list[ScoreComponent] = []

    volatility_score = 35.0
    if snapshot.volatility is not None:
        if snapshot.volatility >= HIGH_VOLATILITY_THRESHOLD:
            volatility_score = 90
            vol_expl = f"Volatility is elevated at {snapshot.volatility:.2f}%."
        elif snapshot.volatility >= ELEVATED_VOLATILITY_THRESHOLD:
            volatility_score = 65
            vol_expl = f"Volatility is above normal at {snapshot.volatility:.2f}%."
        else:
            volatility_score = 30 + snapshot.volatility * 8
            vol_expl = f"Volatility is moderate at {snapshot.volatility:.2f}%."
    else:
        vol_expl = "Volatility could not be computed."
    # Gap risk: frequent opening gaps make stops unreliable, so they add to the
    # volatility component proportional to how often the name gaps.
    if snapshot.gap_frequency_percent is not None and snapshot.gap_frequency_percent > 0:
        volatility_score += GAP_RISK_VOLATILITY_BONUS * (snapshot.gap_frequency_percent / 100)
        vol_expl += f" Opens gap >3% in {snapshot.gap_frequency_percent:.0f}% of sessions."
    components.append(
        ScoreComponent(
            "volatility", "Volatility", _clamp(volatility_score), RISK_WEIGHT_VOLATILITY, vol_expl
        )
    )

    category_key = (category or "").upper()
    category_score = CATEGORY_RISK_SCORES.get(category_key, 40)
    components.append(
        ScoreComponent(
            "category",
            "Category",
            _clamp(category_score),
            RISK_WEIGHT_CATEGORY,
            f"DSE category {category_key or 'unknown'} contributes to structural risk.",
        )
    )

    liquidity_score_map = {
        LiquidityLabel.STRONG: 15,
        LiquidityLabel.NORMAL: 35,
        LiquidityLabel.THIN: 70,
        LiquidityLabel.ILLIQUID: 90,
    }
    components.append(
        ScoreComponent(
            "liquidity",
            "Liquidity",
            liquidity_score_map[liquidity_label],
            RISK_WEIGHT_LIQUIDITY,
            f"Liquidity profile is {liquidity_label.value.lower()}.",
        )
    )

    quality_score = {
        "OK": 20,
        "PARTIAL": 55,
        "SUSPICIOUS": 85,
    }.get(snapshot.data_quality.value, 45)
    components.append(
        ScoreComponent(
            "data_quality",
            "Data Quality",
            quality_score,
            RISK_WEIGHT_DATA_QUALITY,
            f"Latest OHLCV data quality is {snapshot.data_quality.value}.",
        )
    )

    stale_score = 80 if is_stale else (60 if is_sparse else 15)
    stale_expl = (
        "Data is stale."
        if is_stale
        else ("OHLCV history is sparse." if is_sparse else "Data freshness is acceptable.")
    )
    components.append(
        ScoreComponent(
            "stale_data", "Data Freshness", stale_score, RISK_WEIGHT_STALE_DATA, stale_expl
        )
    )

    # Overextension: a stock far above its mean after a big run is prone to sharp
    # mean-reversion (a proxy for operator-driven pumps on DSE).
    above_sma20 = _percent_distance(snapshot.sma20, snapshot.latest_price)
    return_20d = snapshot.return_20d_percent
    overextended_by_return = (
        return_20d is not None and return_20d > OVEREXTENSION_RETURN_20D_PERCENT
    )
    overextended_by_sma = (
        above_sma20 is not None and above_sma20 > OVEREXTENSION_ABOVE_SMA20_PERCENT
    )
    if overextended_by_return or overextended_by_sma:
        overextension_score = 80.0
        detail = []
        if overextended_by_return:
            detail.append(f"+{return_20d:.0f}% over {RETURN_MEDIUM_LOOKBACK} sessions")
        if overextended_by_sma:
            detail.append(f"{above_sma20:.0f}% above SMA20")
        overext_expl = (
            "Price is overextended (" + ", ".join(detail) + "); mean-reversion risk is elevated."
        )
    else:
        overextension_score = 25.0
        overext_expl = "Price is not overextended versus its recent mean."
    components.append(
        ScoreComponent(
            "overextension",
            "Overextension",
            _clamp(overextension_score),
            RISK_WEIGHT_OVEREXTENSION,
            overext_expl,
        )
    )

    weighted = sum(component.score * component.weight for component in components)
    score = _clamp(weighted)
    if score >= 75 or category_key == "Z":
        label = RiskLevelLabel.SPECULATIVE
    elif score >= 55:
        label = RiskLevelLabel.HIGH
    elif score >= 35:
        label = RiskLevelLabel.MEDIUM
    else:
        label = RiskLevelLabel.LOW
    return RiskScoreResult(score=score, label=label, components=components)




def compute_recommendation(
    snapshot: TechnicalSnapshot,
    opportunity: OpportunityScoreResult,
    risk: RiskScoreResult,
    *,
    near_resistance: bool,
    below_support: bool,
    risk_reward: float | None,
    is_stale: bool,
    is_sparse: bool,
    liquidity_label: LiquidityLabel | None = None,
    suspected_adjustment: bool = False,
    market_regime: MarketRegimeResult | str | None = None,
    trade_plan_status: TradePlanStatus | None = None,
    eligibility_status: EligibilityStatus | None = None,
    eligibility_reasons: tuple[str, ...] = (),
    directional_evidence: DirectionalEvidenceResult | None = None,
    data_reliability: DataReliabilityResult | None = None,
    trading_risk: TradingRiskResult | None = None,
    constraints: ConstraintResult | None = None,
    opportunity_quality: OpportunityQuality | None = None,
    entry_readiness: EntryReadiness | None = None,
    entry_timing: EntryTiming | None = None,
) -> DecisionResult:
    """Compatibility entry point for the explicit Phase 3 action matrix."""
    from app.modules.stock_details.decision.recommendation import (
        compute_recommendation as compute_contextual_recommendation,
    )

    return compute_contextual_recommendation(
        snapshot,
        opportunity,
        risk,
        near_resistance=near_resistance,
        below_support=below_support,
        risk_reward=risk_reward,
        is_stale=is_stale,
        is_sparse=is_sparse,
        liquidity_label=liquidity_label,
        suspected_adjustment=suspected_adjustment,
        market_regime=market_regime,
        trade_plan_status=trade_plan_status,
        eligibility_status=eligibility_status,
        eligibility_reasons=eligibility_reasons,
        directional_evidence=directional_evidence,
        data_reliability=data_reliability,
        trading_risk=trading_risk,
        constraints=constraints,
        opportunity_quality=opportunity_quality,
        entry_readiness=entry_readiness,
        entry_timing=entry_timing,
    )
