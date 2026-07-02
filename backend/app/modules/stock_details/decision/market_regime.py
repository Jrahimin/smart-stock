from __future__ import annotations

from app.core.constants.trading_constants import (
    MARKET_REGIME_BEARISH,
    MARKET_REGIME_BULLISH,
    MARKET_REGIME_NEUTRAL,
    REGIME_BREADTH_BEARISH_RATIO,
    REGIME_BREADTH_BULLISH_RATIO,
    REGIME_INDEX_BAND_PERCENT,
    REGIME_INDEX_LOOKBACK,
)
from app.models import DailyMarketSummary

# The benchmark index name, in priority order, used to gauge the broad regime.
_PREFERRED_INDEX_NAMES = ("DSEX", "GENERAL")


def classify_market_regime(
    index_closes: list[float],
    advancing: int | None,
    declining: int | None,
) -> str:
    """Classify BULLISH / NEUTRAL / BEARISH from index trend and market breadth.

    - Index trend: latest close vs its ~50-session average (with a small band).
    - Breadth: advancers / (advancers + decliners) on the latest session.
    A directional call requires the index trend and does not require breadth, but
    breadth can veto a call when it strongly disagrees.
    """
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
    bullish_breadth = breadth_ratio is not None and breadth_ratio >= REGIME_BREADTH_BULLISH_RATIO
    bearish_breadth = breadth_ratio is not None and breadth_ratio <= REGIME_BREADTH_BEARISH_RATIO

    if index_above and not bearish_breadth:
        return MARKET_REGIME_BULLISH
    if index_below and not bullish_breadth:
        return MARKET_REGIME_BEARISH
    return MARKET_REGIME_NEUTRAL


def resolve_regime_from_summaries(summaries: list[DailyMarketSummary]) -> str:
    """Compute the shared regime from raw market-summary rows.

    Both the universe rebuild and the workspace detail path call this with the
    same underlying data so list and detail stay identical.
    """
    if not summaries:
        return MARKET_REGIME_NEUTRAL

    index_name = next(
        (name for name in _PREFERRED_INDEX_NAMES if any(row.index_name == name for row in summaries)),
        None,
    )
    if index_name is not None:
        relevant = [row for row in summaries if row.index_name == index_name]
    else:
        # Fall back to whichever single index has the most history.
        by_index: dict[str, list[DailyMarketSummary]] = {}
        for row in summaries:
            by_index.setdefault(row.index_name, []).append(row)
        relevant = max(by_index.values(), key=len) if by_index else []

    relevant = sorted(relevant, key=lambda row: row.trade_date)
    index_closes = [float(row.index_close) for row in relevant if row.index_close is not None]
    latest = relevant[-1] if relevant else None
    advancing = latest.advancing_issues if latest is not None else None
    declining = latest.declining_issues if latest is not None else None
    return classify_market_regime(index_closes, advancing, declining)
