from datetime import date
from typing import Any

from app.core.enums import ExchangeCode
from app.core.market_cache import invalidate_market_caches_for_exchange


async def compute_daily_indicators(trade_date: date) -> dict[str, Any]:
    """Compute technical indicators from generated market features."""
    result = {
        "trade_date": trade_date.isoformat(),
        "indicators_computed": 0,
    }
    await invalidate_market_caches_for_exchange(ExchangeCode.DSE)
    return result
