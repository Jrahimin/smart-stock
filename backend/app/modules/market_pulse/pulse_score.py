"""Deterministic Pulse Score and focus-label logic for Market Pulse."""

from __future__ import annotations

from dataclasses import dataclass

from app.core.constants.trading_constants import (
    PULSE_SCORE_FOCUS_THRESHOLD,
    PULSE_SCORE_MOMENTUM_MAX,
    PULSE_SCORE_RISK_PENALTY_MAX,
    PULSE_SCORE_SIGNAL_BOOST_MAX,
    PULSE_SCORE_TREND_MAX,
    PULSE_SCORE_VERSION,
    PULSE_SCORE_VOLUME_MAX,
    PULSE_VOLUME_BREAKOUT_RATIO,
    VOLUME_EXPANSION_RATIO,
)
from app.core.enums import (
    DataQualityFlag,
    DecisionDisplayAction,
    PulseFocusLabel,
    PulseScoreBand,
    TrendDirection,
)
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
    score_version: str = PULSE_SCORE_VERSION


def get_volume_ratio(snapshot: TechnicalSnapshot) -> float | None:
    if snapshot.average_volume is None or snapshot.average_volume <= 0:
        return None
    return snapshot.volume / snapshot.average_volume


def get_pulse_score_band(score: int) -> PulseScoreBand:
    if score >= 90:
        return PulseScoreBand.HIGH_ATTENTION
    if score >= 75:
        return PulseScoreBand.WORTH_WATCHING
    return PulseScoreBand.MONITOR


def _compute_trend_score(snapshot: TechnicalSnapshot) -> int:
    if snapshot.trend == TrendDirection.UPTREND:
        return min(PULSE_SCORE_TREND_MAX, 30)
    if snapshot.trend == TrendDirection.SIDEWAYS:
        return 12
    return 0


def _compute_momentum_score(snapshot: TechnicalSnapshot) -> int:
    score = 0
    rsi = snapshot.rsi
    return_5d = snapshot.return_5d_percent

    if rsi is not None:
        if 45 <= rsi <= 68:
            score += 15
        elif 35 <= rsi < 45:
            score += 10
        elif 68 < rsi <= 75:
            score += 8
        elif rsi < 30:
            score += 6

    if return_5d is not None:
        if return_5d > 3:
            score += 15
        elif return_5d > 0:
            score += 10
        elif return_5d == 0:
            score += 3

    return min(PULSE_SCORE_MOMENTUM_MAX, score)


def _compute_volume_score(snapshot: TechnicalSnapshot) -> int:
    ratio = get_volume_ratio(snapshot)
    if ratio is None:
        return 0
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
    if decision.display_action == DecisionDisplayAction.POTENTIAL_BUY:
        return PULSE_SCORE_SIGNAL_BOOST_MAX
    if decision.display_action == DecisionDisplayAction.HOLD:
        return 4
    if decision.display_action == DecisionDisplayAction.WAIT:
        return 1
    return 0


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

    if ratio is not None and ratio < 0.4:
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
        contributors.append("Canonical uptrend")
    elif trend >= 12:
        contributors.append("Sideways trend context")
    if momentum >= 18:
        contributors.append("RSI and five-session momentum")
    elif momentum >= 10:
        contributors.append("Positive momentum evidence")
    if volume >= 18:
        contributors.append("Expanded relative volume")
    elif volume >= 10:
        contributors.append("Above-baseline volume")
    if signal_boost >= 6:
        contributors.append("Conditional potential-buy context")
    if risk_penalty >= 10:
        contributors.append("Elevated modeled trading risk")
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
    previous_recommendation: DecisionDisplayAction | None = None,
) -> PulseFocusLabel:
    volume_ratio = get_volume_ratio(snapshot)

    if (
        previous_recommendation
        in {DecisionDisplayAction.WAIT, DecisionDisplayAction.HOLD}
        and decision.display_action == DecisionDisplayAction.POTENTIAL_BUY
    ):
        return PulseFocusLabel.SIGNAL_UPGRADE

    if decision.display_action == DecisionDisplayAction.POTENTIAL_BUY:
        return PulseFocusLabel.POTENTIAL_BUY_SETUP

    if (
        snapshot.is_breakout
        and volume_ratio is not None
        and volume_ratio >= PULSE_VOLUME_BREAKOUT_RATIO
        and snapshot.resistance is not None
        and snapshot.previous_close is not None
        and snapshot.latest_price is not None
        and snapshot.previous_close <= snapshot.resistance < snapshot.latest_price
    ):
        return PulseFocusLabel.VOLUME_BREAKOUT

    if snapshot.trend == TrendDirection.UPTREND or score.momentum >= 18:
        return PulseFocusLabel.MOMENTUM_BUILDING

    return PulseFocusLabel.WATCH_CLOSELY


def build_pulse_trigger(snapshot: TechnicalSnapshot, decision: TraderDecisionSummaryRead) -> str:
    if decision.entry_condition:
        return decision.entry_condition
    volume_ratio = get_volume_ratio(snapshot)

    if snapshot.resistance is not None and snapshot.latest_price is not None:
        if snapshot.latest_price < snapshot.resistance:
            return f"Break above {snapshot.resistance:.2f}"
        return f"Hold above {snapshot.resistance:.2f}"

    if volume_ratio is not None and volume_ratio >= 1.5:
        return f"Volume stays above {max(1.5, volume_ratio - 0.3):.1f}x average"

    if snapshot.sma20 is not None:
        return f"Close holds above {snapshot.sma20:.2f}"

    if snapshot.rsi is not None and snapshot.rsi < 55:
        return "RSI crosses above 55"

    if snapshot.return_5d_percent is not None and snapshot.return_5d_percent > 0:
        return "Five-session momentum remains positive"

    return "Await fresh technical confirmation"


def build_conviction_insight(
    snapshot: TechnicalSnapshot,
    decision: TraderDecisionSummaryRead,
    score: PulseScoreBreakdown,
    label: PulseFocusLabel,
) -> str:
    volume_ratio = get_volume_ratio(snapshot)
    change = snapshot.price_change_percent or 0

    if label == PulseFocusLabel.VOLUME_BREAKOUT or (
        volume_ratio is not None and volume_ratio >= 2.0
    ):
        if change > 0 and volume_ratio is not None and volume_ratio >= 2.5:
            return "Volume expanding faster than price"
        return "Price-volume break needs follow-through"

    if label == PulseFocusLabel.POTENTIAL_BUY_SETUP:
        return "Potential entry setup has a defined condition"

    if label == PulseFocusLabel.MOMENTUM_BUILDING:
        return "Momentum evidence is improving"

    if label == PulseFocusLabel.SIGNAL_UPGRADE:
        return "Comparable action changed to POTENTIAL_BUY"

    if score.momentum >= 18:
        return "Momentum evidence is improving"

    return build_action_summary(label)


def build_action_summary(label: PulseFocusLabel) -> str:
    if label == PulseFocusLabel.POTENTIAL_BUY_SETUP:
        return "Review the entry condition before acting"
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

    if label == PulseFocusLabel.POTENTIAL_BUY_SETUP:
        reasons.append(
            f"Potential-buy setup with {decision.confidence}/100 evidence strength"
        )
    elif label == PulseFocusLabel.SIGNAL_UPGRADE:
        reasons.append("Trader decision upgraded to POTENTIAL_BUY")
    elif label == PulseFocusLabel.VOLUME_BREAKOUT:
        if volume_ratio is not None:
            reasons.append(f"Price-volume break at {volume_ratio:.1f}x baseline volume")
    elif label == PulseFocusLabel.MOMENTUM_BUILDING:
        reasons.append("Momentum improving today")

    if (
        volume_ratio is not None
        and volume_ratio >= PULSE_VOLUME_BREAKOUT_RATIO
        and label != PulseFocusLabel.VOLUME_BREAKOUT
    ):
        reasons.append(f"Volume {volume_ratio:.1f}x prior-session median")

    if snapshot.trend == TrendDirection.UPTREND and "Momentum" not in " ".join(reasons):
        reasons.append("Price above moving-average context")

    if not reasons:
        reasons.append(decision.reason)

    return reasons[:3]


def meets_focus_threshold(score: int) -> bool:
    return score >= PULSE_SCORE_FOCUS_THRESHOLD
