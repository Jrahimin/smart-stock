from __future__ import annotations

from dataclasses import dataclass

from app.core.constants.trading_constants import BREAKOUT_NEAR_RESISTANCE_PERCENT, VOLUME_EXPANSION_RATIO
from app.core.enums import TrendDirection
from app.modules.stock_details.decision.patterns import PatternDetection
from app.modules.stock_details.decision.technical import TechnicalSnapshot


@dataclass(frozen=True)
class BreakoutFactor:
    label: str
    matched: bool
    explanation: str


@dataclass(frozen=True)
class BreakoutAnalysisResult:
    probability: int
    factors: list[BreakoutFactor]
    breakout_level: float | None
    confirmation_level: float | None
    projected_target: float | None
    explanation: str


def analyze_breakout(snapshot: TechnicalSnapshot, patterns: list[PatternDetection]) -> BreakoutAnalysisResult:
    factors: list[BreakoutFactor] = []
    volume_increasing = bool(
        snapshot.average_volume and snapshot.average_volume > 0 and snapshot.volume / snapshot.average_volume >= VOLUME_EXPANSION_RATIO
    )
    factors.append(
        BreakoutFactor(
            label="Volume increasing",
            matched=volume_increasing,
            explanation="Latest volume exceeds the 20-day average materially." if volume_increasing else "Volume has not expanded enough.",
        )
    )
    trend_aligned = snapshot.trend in {TrendDirection.UPTREND, TrendDirection.SIDEWAYS}
    factors.append(
        BreakoutFactor(
            label="Trend aligned",
            matched=trend_aligned,
            explanation="Trend supports upside continuation." if trend_aligned else "Trend is not aligned for bullish breakout.",
        )
    )
    near_resistance = False
    if snapshot.latest_price is not None and snapshot.resistance is not None:
        distance = ((snapshot.resistance - snapshot.latest_price) / snapshot.latest_price) * 100
        near_resistance = 0 <= distance <= BREAKOUT_NEAR_RESISTANCE_PERCENT
    factors.append(
        BreakoutFactor(
            label="Near resistance",
            matched=near_resistance,
            explanation="Price is close enough to resistance for a breakout attempt." if near_resistance else "Price is not near resistance.",
        )
    )
    active_pattern = next((pattern for pattern in patterns if pattern.status.value in {"Active", "Confirmed"}), None)
    factors.append(
        BreakoutFactor(
            label="Pattern active",
            matched=active_pattern is not None,
            explanation=active_pattern.name if active_pattern else "No active pattern detected.",
        )
    )

    matched_count = sum(1 for factor in factors if factor.matched)
    probability = min(92, 25 + matched_count * 18 + (active_pattern.confidence // 10 if active_pattern else 0))
    breakout_level = active_pattern.breakout_level if active_pattern else snapshot.resistance
    confirmation_level = breakout_level * 1.01 if breakout_level is not None else None
    projected_target = active_pattern.target_estimate if active_pattern else (
        snapshot.resistance * 1.05 if snapshot.resistance is not None else None
    )
    return BreakoutAnalysisResult(
        probability=probability,
        factors=factors,
        breakout_level=round(breakout_level, 4) if breakout_level is not None else None,
        confirmation_level=round(confirmation_level, 4) if confirmation_level is not None else None,
        projected_target=round(projected_target, 4) if projected_target is not None else None,
        explanation="Breakout probability combines volume, trend, resistance proximity, and active pattern context.",
    )
