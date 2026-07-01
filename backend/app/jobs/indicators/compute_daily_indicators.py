from datetime import date
from typing import Any

from app.core.enums import ExchangeCode
from app.jobs.market_cache_spawn import spawn_rebuild_universe_read_cache


async def compute_daily_indicators(trade_date: date) -> dict[str, Any]:
    """Compute technical indicators from generated market features."""
    result = {
        "trade_date": trade_date.isoformat(),
        "indicators_computed": 0,
    }
    spawn_rebuild_universe_read_cache(ExchangeCode.DSE)
    return result
