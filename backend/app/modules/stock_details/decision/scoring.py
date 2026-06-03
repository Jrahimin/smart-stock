from __future__ import annotations

from dataclasses import dataclass

from app.core.constants.trading_constants import (
    CATEGORY_RISK_SCORES,
    CONFIDENCE_WEIGHT_DATA,
    CONFIDENCE_WEIGHT_MOMENTUM,
    CONFIDENCE_WEIGHT_PRICE_POSITION,
    CONFIDENCE_WEIGHT_RISK,
    CONFIDENCE_WEIGHT_TREND,
    CONFIDENCE_WEIGHT_VOLUME,
    ELEVATED_VOLATILITY_THRESHOLD,
    HIGH_VOLATILITY_THRESHOLD,
    NEAR_LEVEL_PERCENT_THRESHOLD,
    OPPORTUNITY_WEIGHT_MOMENTUM,
    OPPORTUNITY_WEIGHT_PRICE_POSITION,
    OPPORTUNITY_WEIGHT_RISK_PENALTY,
    OPPORTUNITY_WEIGHT_TREND,
    OPPORTUNITY_WEIGHT_VOLUME,
    MIN_RISK_REWARD_RATIO,
    RECOMMENDATION_BREAKOUT_VOLUME_RATIO,
    RECOMMENDATION_BUY_HIGH_RISK_OPPORTUNITY_MIN,
    RECOMMENDATION_BUY_OPPORTUNITY_MIN,
    RECOMMENDATION_HOLD_OPPORTUNITY_MIN,
    RECOMMENDATION_SELL_OPPORTUNITY_MAX,
    RISK_WEIGHT_CATEGORY,
    RISK_WEIGHT_DATA_QUALITY,
    RISK_WEIGHT_LIQUIDITY,
    RISK_WEIGHT_STALE_DATA,
    RISK_WEIGHT_VOLATILITY,
    RSI_OVERBOUGHT_THRESHOLD,
    RSI_OVERSOLD_THRESHOLD,
    VOLUME_EXPANSION_RATIO,
    VOLUME_THIN_RATIO,
)
from app.core.enums import LiquidityLabel, RiskLevelLabel, TraderRecommendation, TrendDirection
from app.modules.stock_details.decision.technical import TechnicalSnapshot


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


def _constructive_uptrend(snapshot: TechnicalSnapshot, opportunity_score: int) -> bool:
    return snapshot.trend == TrendDirection.UPTREND and opportunity_score >= RECOMMENDATION_HOLD_OPPORTUNITY_MIN


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
    if snapshot.price_change_percent is not None:
        if snapshot.price_change_percent > 1.5:
            score = min(100, score + 10)
            explanations.append("Recent session momentum is positive.")
        elif snapshot.price_change_percent < -1.5:
            score = max(0, score - 10)
            explanations.append("Recent session momentum is negative.")
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
        if support_distance <= NEAR_LEVEL_PERCENT_THRESHOLD:
            score += 12
            explanations.append("Price is near support, offering a favorable risk zone.")
        elif support_distance < 0:
            score -= 20
            explanations.append("Price is below support; structure is weakened.")

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


def compute_opportunity_score(snapshot: TechnicalSnapshot, risk_score: int, liquidity_label: LiquidityLabel) -> OpportunityScoreResult:
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
    components.append(
        ScoreComponent("volatility", "Volatility", _clamp(volatility_score), RISK_WEIGHT_VOLATILITY, vol_expl)
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
    stale_expl = "Data is stale." if is_stale else ("OHLCV history is sparse." if is_sparse else "Data freshness is acceptable.")
    components.append(
        ScoreComponent("stale_data", "Data Freshness", stale_score, RISK_WEIGHT_STALE_DATA, stale_expl)
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


def compute_decision_confidence(
    snapshot: TechnicalSnapshot,
    opportunity: OpportunityScoreResult,
    risk: RiskScoreResult,
    *,
    is_stale: bool,
    is_sparse: bool,
) -> int:
    trend_alignment = opportunity.components[0].score
    momentum_alignment = opportunity.components[1].score
    volume_alignment = opportunity.components[2].score
    price_alignment = opportunity.components[3].score
    risk_alignment = 100 - risk.score
    data_alignment = 35 if is_stale or is_sparse else 85

    confidence = (
        trend_alignment * CONFIDENCE_WEIGHT_TREND
        + momentum_alignment * CONFIDENCE_WEIGHT_MOMENTUM
        + volume_alignment * CONFIDENCE_WEIGHT_VOLUME
        + risk_alignment * CONFIDENCE_WEIGHT_RISK
        + price_alignment * CONFIDENCE_WEIGHT_PRICE_POSITION
        + data_alignment * CONFIDENCE_WEIGHT_DATA
    )
    if snapshot.trend == TrendDirection.UNKNOWN:
        confidence -= 12
    return _clamp(confidence)


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
) -> DecisionResult:
    reasoning: list[str] = []
    opportunity_score = opportunity.score
    risk_score = risk.score

    reasoning.append(f"Trend context: {snapshot.trend.value.lower()}.")
    if snapshot.rsi is not None:
        reasoning.append(f"Momentum: RSI {snapshot.rsi:.1f}.")
    if snapshot.average_volume and snapshot.average_volume > 0:
        reasoning.append(f"Volume: {snapshot.volume / snapshot.average_volume:.1f}x 20-day average.")
    reasoning.append(f"Opportunity score: {opportunity_score}/100.")
    reasoning.append(f"Risk level: {risk.label.value} ({risk_score}/100).")

    recommendation = TraderRecommendation.WAIT
    if is_stale or is_sparse:
        reasoning.append("Data is stale or sparse; wait for fresher confirmation.")
        recommendation = TraderRecommendation.WAIT
    elif below_support:
        reasoning.append("Price has failed recent support.")
        recommendation = TraderRecommendation.SELL
    elif (
        opportunity_score >= RECOMMENDATION_BUY_OPPORTUNITY_MIN
        and snapshot.trend == TrendDirection.UPTREND
        and not _momentum_blocks_buy(snapshot)
        and not _blocks_buy_on_risk_reward(risk_reward, near_resistance=near_resistance)
    ):
        if _risk_allows_new_buy(risk) and (not near_resistance or _volume_supports_breakout(snapshot)):
            reasoning.append(
                "Uptrend with favorable opportunity"
                + (" and resistance test participation." if near_resistance else " and acceptable reward potential.")
            )
            recommendation = TraderRecommendation.BUY
        elif _risk_allows_new_buy(risk):
            reasoning.append("Uptrend is constructive near resistance; wait for stronger volume confirmation.")
            recommendation = TraderRecommendation.HOLD
        elif opportunity_score >= RECOMMENDATION_BUY_HIGH_RISK_OPPORTUNITY_MIN and _volume_supports_breakout(snapshot):
            reasoning.append("High-risk name with strong trend and participation; treat as a selective setup.")
            recommendation = TraderRecommendation.HOLD
    elif (
        opportunity_score <= RECOMMENDATION_SELL_OPPORTUNITY_MAX
        and snapshot.trend == TrendDirection.DOWNTREND
    ) or (snapshot.trend == TrendDirection.DOWNTREND and _high_risk_context(risk) and opportunity_score < 45):
        reasoning.append("Bearish structure dominates the setup.")
        recommendation = TraderRecommendation.SELL
    elif _high_risk_context(risk) and not _constructive_uptrend(snapshot, opportunity_score):
        reasoning.append(f"Risk level is {risk.label.value}; wait for cleaner confirmation rather than forcing a trade.")
        recommendation = TraderRecommendation.WAIT
    elif _momentum_extended(snapshot) and near_resistance and not _volume_supports_breakout(snapshot):
        reasoning.append("Momentum is extended near resistance; wait for a better entry.")
        recommendation = TraderRecommendation.WAIT
    elif _momentum_extended(snapshot) and near_resistance and _constructive_uptrend(snapshot, opportunity_score):
        reasoning.append("Momentum is elevated but the uptrend remains intact; hold rather than chase.")
        recommendation = TraderRecommendation.HOLD
    elif near_resistance and snapshot.trend != TrendDirection.UPTREND:
        reasoning.append("Price is near resistance without an uptrend; wait for confirmation.")
        recommendation = TraderRecommendation.WAIT
    elif _constructive_uptrend(snapshot, opportunity_score) and _risk_allows_new_buy(risk):
        reasoning.append("Structure remains constructive; hold existing positions or wait for cleaner entry.")
        recommendation = TraderRecommendation.HOLD
    elif (
        snapshot.trend == TrendDirection.SIDEWAYS
        and opportunity_score >= RECOMMENDATION_BUY_OPPORTUNITY_MIN
        and _risk_allows_new_buy(risk)
        and not near_resistance
    ):
        reasoning.append("Sideways base with constructive opportunity; monitor for directional confirmation.")
        recommendation = TraderRecommendation.HOLD
    else:
        reasoning.append("No strong directional edge; patience is preferred.")
        recommendation = TraderRecommendation.WAIT

    confidence = compute_decision_confidence(snapshot, opportunity, risk, is_stale=is_stale, is_sparse=is_sparse)
    if recommendation in {TraderRecommendation.WAIT, TraderRecommendation.HOLD}:
        confidence = min(confidence, 72)
    return DecisionResult(recommendation=recommendation, confidence=confidence, reasoning=reasoning)
