from datetime import date
from typing import Any

from app.core.constants.trading_constants import (
    TRADING_ACTION_TAXONOMY,
    TRADING_STRATEGY_VERSION,
    TRADING_THRESHOLD_VERSION,
)
from app.core.enums import ExchangeCode
from app.jobs.market_cache_spawn import spawn_rebuild_universe_read_cache

STRATEGY_NAME = "canonical_trader"


def map_trader_recommendation_to_signal_type(recommendation: str) -> str:
    if recommendation == "SELL":
        return "SELL"
    if recommendation == "BUY":
        return "BUY"
    return "HOLD"


async def generate_daily_signals(trade_date: date) -> dict[str, Any]:
    """Persist daily strategy rows from the shared trader decision engine.

    Runtime UI surfaces consume versioned canonical decisions through the market
    universe or stock decision-support APIs rather than waiting for this batch job.
    """
    _ = trade_date
    result = {
        "trade_date": trade_date.isoformat(),
        "signals_generated": 0,
        "strategy_name": STRATEGY_NAME,
        "strategy_version": TRADING_STRATEGY_VERSION,
        "threshold_version": TRADING_THRESHOLD_VERSION,
        "action_taxonomy": TRADING_ACTION_TAXONOMY,
        "note": "Batch persistence hook reserved; live decisions use the shared decision engine.",
    }
    spawn_rebuild_universe_read_cache(ExchangeCode.DSE)
    return result
