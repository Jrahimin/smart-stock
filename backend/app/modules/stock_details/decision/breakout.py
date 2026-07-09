from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.core.constants.trading_constants import BREAKOUT_NEAR_RESISTANCE_PERCENT, VOLUME_EXPANSION_RATIO
from app.core.enums import TrendDirection
from app.modules.stock_details.decision.patterns import PatternDetection
from app.modules.stock_details.decision.technical import TechnicalSnapshot

BreakoutScenario = Literal["breakout", "breakdown"]


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
    direction: BreakoutScenario


def _active_patterns(patterns: list[PatternDetection]) -> list[PatternDetection]:
    return [pattern for pattern in patterns if pattern.status.value in {"Active", "Confirmed"}]


def _infer_scenario(pattern: PatternDetection | None, snapshot: TechnicalSnapshot) -> BreakoutScenario:
    if pattern is None:
        return "breakout"
    if pattern.direction == "bullish":
        return "breakout"
    if pattern.direction == "bearish":
        return "breakdown"
    latest = snapshot.latest_price
    target = pattern.target_estimate
    if latest is not None and target is not None:
        if target < latest:
            return "breakdown"
        if target > latest:
            return "breakout"
    return "breakout"


def _pick_directional_pattern(
    patterns: list[PatternDetection],
    snapshot: TechnicalSnapshot,
) -> tuple[PatternDetection | None, BreakoutScenario]:
    active = _active_patterns(patterns)
    if not active:
        return None, "breakout"

    bullish = next((pattern for pattern in active if pattern.direction == "bullish"), None)
    bearish = next((pattern for pattern in active if pattern.direction == "bearish"), None)

    for pattern in active:
        scenario = _infer_scenario(pattern, snapshot)
        if scenario == "breakdown":
            return pattern, "breakdown"

    if bullish:
        return bullish, "breakout"
    if bearish:
        return bearish, "breakdown"
    return active[0], _infer_scenario(active[0], snapshot)


def analyze_breakout(snapshot: TechnicalSnapshot, patterns: list[PatternDetection]) -> BreakoutAnalysisResult:
    active_pattern, scenario = _pick_directional_pattern(patterns, snapshot)
    bullish = scenario == "breakout"
    factors: list[BreakoutFactor] = []

    volume_increasing = bool(
        snapshot.average_volume
        and snapshot.average_volume > 0
        and snapshot.volume / snapshot.average_volume >= VOLUME_EXPANSION_RATIO
    )
    factors.append(
        BreakoutFactor(
            label="Volume increasing",
            matched=volume_increasing,
            explanation="Latest volume exceeds the 20-day average materially."
            if volume_increasing
            else "Volume has not expanded enough.",
        )
    )

    if bullish:
        trend_aligned = snapshot.trend == TrendDirection.UPTREND
        trend_explanation = (
            "Uptrend supports upside continuation."
            if trend_aligned
            else "Trend is not aligned for a bullish breakout."
        )
    else:
        trend_aligned = snapshot.trend == TrendDirection.DOWNTREND
        trend_explanation = (
            "Downtrend supports downside continuation."
            if trend_aligned
            else "Trend is not aligned for a bearish breakdown."
        )
    factors.append(
        BreakoutFactor(
            label="Trend aligned",
            matched=trend_aligned,
            explanation=trend_explanation,
        )
    )

    at_trigger_zone = False
    if snapshot.latest_price is not None:
        if bullish and snapshot.resistance is not None:
            distance = ((snapshot.resistance - snapshot.latest_price) / snapshot.latest_price) * 100
            at_trigger_zone = 0 <= distance <= BREAKOUT_NEAR_RESISTANCE_PERCENT or snapshot.is_breakout
        elif not bullish and snapshot.support is not None:
            distance = ((snapshot.latest_price - snapshot.support) / snapshot.latest_price) * 100
            at_trigger_zone = 0 <= distance <= BREAKOUT_NEAR_RESISTANCE_PERCENT
    factors.append(
        BreakoutFactor(
            label="At trigger zone" if not bullish else "At breakout zone",
            matched=at_trigger_zone,
            explanation=(
                "Price is testing or clearing the key trigger level."
                if at_trigger_zone
                else "Price is not near the trigger level."
            ),
        )
    )

    pattern_aligned = active_pattern is not None and (
        (bullish and active_pattern.direction == "bullish")
        or (not bullish and active_pattern.direction in {"bearish", "neutral"})
    )
    factors.append(
        BreakoutFactor(
            label="Pattern active",
            matched=pattern_aligned,
            explanation=active_pattern.name if pattern_aligned and active_pattern else "No active pattern aligned with this scenario.",
        )
    )

    matched_count = sum(1 for factor in factors if factor.matched)
    probability = min(
        92,
        matched_count * 20 + (active_pattern.confidence // 10 if pattern_aligned and active_pattern else 0),
    )

    if bullish:
        trigger_level = (
            active_pattern.breakout_level
            if active_pattern and active_pattern.direction == "bullish"
            else snapshot.resistance
        )
        projected_target = (
            active_pattern.target_estimate
            if active_pattern and active_pattern.direction == "bullish"
            else (snapshot.resistance * 1.05 if snapshot.resistance is not None else None)
        )
        explanation = "Breakout probability combines volume, trend, resistance proximity, and active pattern context."
    else:
        trigger_level = (
            active_pattern.breakout_level
            if active_pattern and active_pattern.direction in {"bearish", "neutral"}
            else snapshot.support
        )
        projected_target = (
            active_pattern.target_estimate
            if active_pattern and active_pattern.direction in {"bearish", "neutral"}
            else (snapshot.support * 0.95 if snapshot.support is not None else None)
        )
        explanation = "Breakdown probability combines volume, trend, support proximity, and active pattern context."

    confirmation_level = trigger_level * (1.01 if bullish else 0.99) if trigger_level is not None else None

    return BreakoutAnalysisResult(
        probability=probability,
        factors=factors,
        breakout_level=round(trigger_level, 4) if trigger_level is not None else None,
        confirmation_level=round(confirmation_level, 4) if confirmation_level is not None else None,
        projected_target=round(projected_target, 4) if projected_target is not None else None,
        explanation=explanation,
        direction=scenario,
    )
