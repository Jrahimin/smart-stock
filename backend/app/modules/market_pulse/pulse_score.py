"""Deterministic Pulse Score and focus-label logic for Market Pulse."""

from __future__ import annotations

from dataclasses import dataclass

from app.core.constants.trading_constants import (
    PULSE_SCORE_FOCUS_THRESHOLD,
    PULSE_SCORE_MOMENTUM_MAX,
    PULSE_SCORE_RISK_PENALTY_MAX,
    PULSE_SCORE_SIGNAL_BOOST_MAX,
    PULSE_SCORE_TREND_MAX,
    PULSE_SCORE_VOLUME_MAX,
    PULSE_VOLUME_BREAKOUT_RATIO,
    VOLUME_EXPANSION_RATIO,
)
from app.core.enums import DataQualityFlag, PulseFocusLabel, PulseScoreBand, TrendDirection, TraderRecommendation
from app.modules.stock_details.decision.technical import TechnicalSnapshot
from app.modules.stock_details.stock_details_schemas import TraderDecisionSummaryRead


@dataclass(frozen=True)
class PulseScoreBreakdown:
    trend: int
    momentum: int
    volume: int
    signal_boost: int
    risk_penalty: int
    total: int
    contributors: list[str]
    band: PulseScoreBand


def get_volume_ratio(snapshot: TechnicalSnapshot) -> float:
    if snapshot.average_volume is None or snapshot.average_volume <= 0:
        return 1.0
    return snapshot.volume / snapshot.average_volume


def get_pulse_score_band(score: int) -> PulseScoreBand:
    if score >= 90:
        return PulseScoreBand.HIGH_ATTENTION
    if score >= 75:
        return PulseScoreBand.WORTH_WATCHING
    return PulseScoreBand.MONITOR


def _compute_trend_score(snapshot: TechnicalSnapshot) -> int:
    score = 0
    latest = snapshot.latest_price
    change = snapshot.price_change_percent or 0.0

    if latest is not None and snapshot.sma20 is not None and latest > snapshot.sma20:
        score += 12
    if latest is not None and snapshot.ema20 is not None and latest > snapshot.ema20:
        score += 10
    if snapshot.trend == TrendDirection.UPTREND:
        score += 13
    elif snapshot.trend == TrendDirection.SIDEWAYS and change > 0:
        score += 8
    elif snapshot.trend == TrendDirection.DOWNTREND and change > 0:
        score += 5

    return min(PULSE_SCORE_TREND_MAX, score)


def _compute_momentum_score(snapshot: TechnicalSnapshot) -> int:
    score = 0
    rsi = snapshot.rsi
    change = snapshot.price_change_percent or 0.0

    if rsi is not None:
        if 45 <= rsi <= 68:
            score += 15
        elif 35 <= rsi < 45:
            score += 10
        elif 68 < rsi <= 75:
            score += 8
        elif rsi < 30:
            score += 6

    if change > 2:
        score += 10
    elif change > 0.5:
        score += 7
    elif change > 0:
        score += 4

    if snapshot.trend == TrendDirection.UPTREND:
        score += 5

    return min(PULSE_SCORE_MOMENTUM_MAX, score)


def _compute_volume_score(snapshot: TechnicalSnapshot) -> int:
    ratio = get_volume_ratio(snapshot)
    if ratio >= 2.5:
        return PULSE_SCORE_VOLUME_MAX
    if ratio >= VOLUME_EXPANSION_RATIO:
        return 20
    if ratio >= 1.3:
        return 14
    if ratio >= 1.0:
        return 8
    if ratio >= 0.7:
        return 4
    return 0


def _compute_signal_boost(decision: TraderDecisionSummaryRead) -> int:
    boost = 0
    if decision.recommendation == TraderRecommendation.BUY and decision.confidence >= 65:
        boost += 6
    elif decision.recommendation == TraderRecommendation.BUY:
        boost += 4
    elif decision.recommendation == TraderRecommendation.WAIT and decision.confidence >= 60:
        boost += 3

    if decision.confidence >= 75:
        boost += 4
    elif decision.confidence >= 65:
        boost += 2

    return min(PULSE_SCORE_SIGNAL_BOOST_MAX, boost)


def _compute_risk_penalty(snapshot: TechnicalSnapshot, decision: TraderDecisionSummaryRead) -> int:
    penalty = 0
    ratio = get_volume_ratio(snapshot)

    if snapshot.data_quality == DataQualityFlag.SUSPICIOUS:
        penalty += 12
    elif snapshot.data_quality == DataQualityFlag.PARTIAL:
        penalty += 6

    risk = decision.risk_label.upper()
    if risk in {"HIGH", "SPECULATIVE"}:
        penalty += 12
    elif risk == "MEDIUM":
        penalty += 6

    if snapshot.volatility is not None and snapshot.volatility >= 4:
        penalty += 6

    if ratio < 0.4:
        penalty += 8

    return min(PULSE_SCORE_RISK_PENALTY_MAX, penalty)


def _build_contributors(
    trend: int,
    momentum: int,
    volume: int,
    signal_boost: int,
    risk_penalty: int,
) -> list[str]:
    contributors: list[str] = []
    if trend >= 20:
        contributors.append("Improving trend")
    elif trend >= 12:
        contributors.append("Supportive trend")
    if momentum >= 18:
        contributors.append("Stronger momentum")
    elif momentum >= 10:
        contributors.append("Momentum improving")
    if volume >= 18:
        contributors.append("High relative volume")
    elif volume >= 10:
        contributors.append("Volume confirmation")
    if signal_boost >= 6:
        contributors.append("Actionable signal context")
    if risk_penalty >= 10:
        contributors.append("Risk-adjusted")
    return contributors[:3]


def compute_pulse_score(
    snapshot: TechnicalSnapshot,
    decision: TraderDecisionSummaryRead,
) -> PulseScoreBreakdown:
    trend = _compute_trend_score(snapshot)
    momentum = _compute_momentum_score(snapshot)
    volume = _compute_volume_score(snapshot)
    signal_boost = _compute_signal_boost(decision)
    risk_penalty = _compute_risk_penalty(snapshot, decision)
    total = max(0, min(100, round(trend + momentum + volume + signal_boost - risk_penalty)))

    return PulseScoreBreakdown(
        trend=trend,
        momentum=momentum,
        volume=volume,
        signal_boost=signal_boost,
        risk_penalty=risk_penalty,
        total=total,
        contributors=_build_contributors(trend, momentum, volume, signal_boost, risk_penalty),
        band=get_pulse_score_band(total),
    )


def derive_pulse_focus_label(
    snapshot: TechnicalSnapshot,
    decision: TraderDecisionSummaryRead,
    score: PulseScoreBreakdown,
    *,
    previous_recommendation: TraderRecommendation | None = None,
) -> PulseFocusLabel:
    volume_ratio = get_volume_ratio(snapshot)

    if previous_recommendation in {TraderRecommendation.WAIT, TraderRecommendation.HOLD} and decision.recommendation == TraderRecommendation.BUY:
        return PulseFocusLabel.SIGNAL_UPGRADE

    if decision.recommendation == TraderRecommendation.BUY and decision.confidence >= 60:
        return PulseFocusLabel.NEW_BUY_SETUP

    if volume_ratio >= PULSE_VOLUME_BREAKOUT_RATIO:
        return PulseFocusLabel.VOLUME_BREAKOUT

    if snapshot.trend == TrendDirection.UPTREND or score.momentum >= 18:
        return PulseFocusLabel.MOMENTUM_BUILDING

    return PulseFocusLabel.WATCH_CLOSELY


def build_pulse_trigger(snapshot: TechnicalSnapshot, decision: TraderDecisionSummaryRead) -> str:
    volume_ratio = get_volume_ratio(snapshot)

    if snapshot.resistance is not None and snapshot.latest_price is not None and snapshot.latest_price < snapshot.resistance:
        return f"Break above {snapshot.resistance:.2f}"

    if volume_ratio >= 1.5:
        return f"Volume stays above {max(1.5, volume_ratio - 0.3):.1f}x average"

    if snapshot.sma20 is not None:
        return f"Close holds above {snapshot.sma20:.2f}"

    if snapshot.rsi is not None and snapshot.rsi < 55:
        return "RSI crosses above 55"

    if decision.recommendation == TraderRecommendation.BUY:
        return "Price confirms BUY setup"

    return "Momentum holds with positive participation"


def build_conviction_insight(
    snapshot: TechnicalSnapshot,
    decision: TraderDecisionSummaryRead,
    score: PulseScoreBreakdown,
    label: PulseFocusLabel,
) -> str:
    volume_ratio = get_volume_ratio(snapshot)
    change = snapshot.price_change_percent or 0

    if label == PulseFocusLabel.VOLUME_BREAKOUT or volume_ratio >= 2.0:
        if change > 0 and volume_ratio >= 2.5:
            return "Volume expanding faster than price"
        return "Participation surge needs price follow-through"

    if label == PulseFocusLabel.NEW_BUY_SETUP:
        if snapshot.trend == TrendDirection.UPTREND:
            return "Fresh breakout from consolidation"
        return "Investigate for entry today"

    if label == PulseFocusLabel.MOMENTUM_BUILDING:
        return "Sector leadership improving"

    if label == PulseFocusLabel.SIGNAL_UPGRADE:
        return "Signal strength upgraded today"

    if score.momentum >= 18:
        return "Momentum building with participation"

    return build_action_summary(label)


def build_action_summary(label: PulseFocusLabel) -> str:
    if label == PulseFocusLabel.NEW_BUY_SETUP:
        return "Investigate for entry today"
    if label == PulseFocusLabel.VOLUME_BREAKOUT:
        return "Confirm volume before acting"
    if label == PulseFocusLabel.MOMENTUM_BUILDING:
        return "Monitor for confirmation"
    if label == PulseFocusLabel.SIGNAL_UPGRADE:
        return "Review upgraded signal"
    return "Watch closely today"


def build_why_here(
    snapshot: TechnicalSnapshot,
    decision: TraderDecisionSummaryRead,
    score: PulseScoreBreakdown,
    label: PulseFocusLabel,
) -> list[str]:
    reasons: list[str] = []
    volume_ratio = get_volume_ratio(snapshot)

    if label == PulseFocusLabel.NEW_BUY_SETUP:
        reasons.append(f"BUY setup with {decision.confidence}/100 evidence strength")
    elif label == PulseFocusLabel.SIGNAL_UPGRADE:
        reasons.append("Trader signal upgraded to BUY")
    elif label == PulseFocusLabel.VOLUME_BREAKOUT:
        reasons.append(f"Volume {volume_ratio:.1f}x normal")
    elif label == PulseFocusLabel.MOMENTUM_BUILDING:
        reasons.append("Momentum improving today")

    if volume_ratio >= 1.8 and label != PulseFocusLabel.VOLUME_BREAKOUT:
        reasons.append(f"Volume {volume_ratio:.1f}x normal")

    if snapshot.trend == TrendDirection.UPTREND and "Momentum" not in " ".join(reasons):
        reasons.append("Price above moving-average context")

    if not reasons:
        reasons.append(decision.reason)

    return reasons[:3]


def meets_focus_threshold(score: int) -> bool:
    return score >= PULSE_SCORE_FOCUS_THRESHOLD
