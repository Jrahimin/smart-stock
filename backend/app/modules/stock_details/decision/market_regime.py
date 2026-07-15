from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.core.constants.trading_constants import (
    MARKET_REGIME_BEARISH,
    MARKET_REGIME_BULLISH,
    MARKET_REGIME_NEUTRAL,
    REGIME_BREADTH_BEARISH_RATIO,
    REGIME_BREADTH_BULLISH_RATIO,
    REGIME_EXTENDED_DISTANCE_PERCENT,
    REGIME_INDEX_BAND_PERCENT,
    REGIME_INDEX_LOOKBACK,
    REGIME_SCORE_TREND_CAP,
)
from app.core.enums import EntryTiming, MarketRegimePhase
from app.models import DailyMarketSummary

# The benchmark index name, in priority order, used to gauge the broad regime.
_PREFERRED_INDEX_NAMES = ("DSEX", "GENERAL")


@dataclass(frozen=True)
class MarketRegimeResult:
    score: int
    label: str
    phase: MarketRegimePhase
    confidence: int
    explanation: str

    def permits_plan(self, timing: EntryTiming | None) -> bool:
        if timing not in {EntryTiming.BREAKOUT, EntryTiming.CONTINUATION}:
            return True
        return (
            self.label != MARKET_REGIME_BEARISH
            and self.phase != MarketRegimePhase.REVERSAL_RISK
        )


def _clamp_score(value: float) -> int:
    return max(0, min(100, round(value)))


def classify_market_regime(
    index_closes: list[float],
    advancing: int | None,
    declining: int | None,
) -> str:
    """Classify BULLISH / NEUTRAL / BEARISH from index trend and breadth."""
    if not index_closes:
        return MARKET_REGIME_NEUTRAL

    latest = index_closes[-1]
    window = index_closes[-REGIME_INDEX_LOOKBACK:]
    average = sum(window) / len(window)
    if average <= 0:
        return MARKET_REGIME_NEUTRAL

    band = average * (REGIME_INDEX_BAND_PERCENT / 100)
    index_above = latest > average + band
    index_below = latest < average - band

    breadth_ratio: float | None = None
    if advancing is not None and declining is not None and (advancing + declining) > 0:
        breadth_ratio = advancing / (advancing + declining)
    bullish_breadth = (
        breadth_ratio is not None and breadth_ratio >= REGIME_BREADTH_BULLISH_RATIO
    )
    bearish_breadth = (
        breadth_ratio is not None and breadth_ratio <= REGIME_BREADTH_BEARISH_RATIO
    )

    if index_above and not bearish_breadth:
        return MARKET_REGIME_BULLISH
    if index_below and not bullish_breadth:
        return MARKET_REGIME_BEARISH
    return MARKET_REGIME_NEUTRAL


def compute_market_regime_result(
    index_closes: list[float],
    advancing: int | None,
    declining: int | None,
) -> MarketRegimeResult:
    if not index_closes:
        return MarketRegimeResult(
            score=50,
            label=MARKET_REGIME_NEUTRAL,
            phase=MarketRegimePhase.HEALTHY,
            confidence=0,
            explanation=(
                "Market regime is neutral because completed-session index history is unavailable."
            ),
        )

    latest = index_closes[-1]
    window = index_closes[-REGIME_INDEX_LOOKBACK:]
    average = sum(window) / len(window)
    if average <= 0:
        return MarketRegimeResult(
            score=50,
            label=MARKET_REGIME_NEUTRAL,
            phase=MarketRegimePhase.HEALTHY,
            confidence=0,
            explanation="Market regime is neutral because the index baseline is invalid.",
        )

    distance_percent = (latest / average - 1) * 100
    trend_component = max(
        -REGIME_SCORE_TREND_CAP,
        min(
            REGIME_SCORE_TREND_CAP,
            distance_percent
            / REGIME_EXTENDED_DISTANCE_PERCENT
            * REGIME_SCORE_TREND_CAP,
        ),
    )
    breadth_ratio: float | None = None
    if advancing is not None and declining is not None and advancing + declining > 0:
        breadth_ratio = advancing / (advancing + declining)
    breadth_component = 0.0 if breadth_ratio is None else (breadth_ratio - 0.5) * 40
    score = _clamp_score(50 + trend_component + breadth_component)
    label = classify_market_regime(index_closes, advancing, declining)

    phase = MarketRegimePhase.HEALTHY
    if label == MARKET_REGIME_BEARISH:
        phase = MarketRegimePhase.REVERSAL_RISK
    elif label == MARKET_REGIME_BULLISH:
        previous_window = index_closes[:-1][-REGIME_INDEX_LOOKBACK:]
        previous_average = (
            sum(previous_window) / len(previous_window) if previous_window else latest
        )
        previous_was_above = (
            len(index_closes) > 1
            and index_closes[-2]
            > previous_average * (1 + REGIME_INDEX_BAND_PERCENT / 100)
        )
        if not previous_was_above:
            phase = MarketRegimePhase.EARLY
        elif distance_percent >= REGIME_EXTENDED_DISTANCE_PERCENT:
            phase = MarketRegimePhase.EXTENDED

    coverage_confidence = min(70, round(len(window) / REGIME_INDEX_LOOKBACK * 70))
    confidence = coverage_confidence + (30 if breadth_ratio is not None else 0)
    breadth_text = (
        "breadth unavailable"
        if breadth_ratio is None
        else f"advancing breadth {breadth_ratio * 100:.1f}%"
    )
    return MarketRegimeResult(
        score=score,
        label=label,
        phase=phase,
        confidence=confidence,
        explanation=(
            f"Completed-session index is {distance_percent:+.2f}% versus its baseline; "
            f"{breadth_text}."
        ),
    )


def market_regime_result_from_label(label: str | None) -> MarketRegimeResult:
    normalized = (label or MARKET_REGIME_NEUTRAL).upper()
    if normalized == MARKET_REGIME_BULLISH:
        return MarketRegimeResult(
            65,
            MARKET_REGIME_BULLISH,
            MarketRegimePhase.HEALTHY,
            0,
            "Only the legacy bullish regime label was supplied.",
        )
    if normalized == MARKET_REGIME_BEARISH:
        return MarketRegimeResult(
            35,
            MARKET_REGIME_BEARISH,
            MarketRegimePhase.REVERSAL_RISK,
            0,
            "Only the legacy bearish regime label was supplied.",
        )
    return MarketRegimeResult(
        50,
        MARKET_REGIME_NEUTRAL,
        MarketRegimePhase.HEALTHY,
        0,
        "Only a neutral or missing legacy regime label was supplied.",
    )


def normalize_market_regime(
    regime: MarketRegimeResult | str | None,
) -> MarketRegimeResult:
    if isinstance(regime, MarketRegimeResult):
        return regime
    return market_regime_result_from_label(regime)


def resolve_regime_result_from_summaries(
    summaries: list[DailyMarketSummary],
    *,
    decision_session_date: date | None = None,
) -> MarketRegimeResult:
    """Compute one capped regime result from completed-session summaries."""
    completed_summaries = [
        row
        for row in summaries
        if decision_session_date is None or row.trade_date <= decision_session_date
    ]
    if not completed_summaries:
        return compute_market_regime_result([], None, None)

    index_name = next(
        (
            name
            for name in _PREFERRED_INDEX_NAMES
            if any(row.index_name == name for row in completed_summaries)
        ),
        None,
    )
    if index_name is not None:
        relevant = [row for row in completed_summaries if row.index_name == index_name]
    else:
        by_index: dict[str, list[DailyMarketSummary]] = {}
        for row in completed_summaries:
            by_index.setdefault(row.index_name, []).append(row)
        relevant = max(by_index.values(), key=len) if by_index else []

    relevant = sorted(relevant, key=lambda row: row.trade_date)
    index_closes = [float(row.index_close) for row in relevant if row.index_close is not None]
    latest = relevant[-1] if relevant else None
    advancing = latest.advancing_issues if latest is not None else None
    declining = latest.declining_issues if latest is not None else None
    return compute_market_regime_result(index_closes, advancing, declining)


def resolve_regime_from_summaries(
    summaries: list[DailyMarketSummary],
    *,
    decision_session_date: date | None = None,
) -> str:
    """Backward-compatible label projection for callers not yet on the typed result."""
    return resolve_regime_result_from_summaries(
        summaries,
        decision_session_date=decision_session_date,
    ).label
