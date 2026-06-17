from __future__ import annotations

import logging

from app.core.enums import ExchangeCode
from app.core.redis_client import OptionalRedisClient

logger = logging.getLogger(__name__)

DASHBOARD_CACHE_KEY_NAMES: tuple[str, ...] = (
    "overview",
    "movers",
    "sectors",
    "market-alerts",
    "stocks-in-focus",
    "heatmap",
    "market-sentiment",
)


def dashboard_cache_key(section: str, exchange: ExchangeCode) -> str:
    return f"dashboard:{section}:{exchange.value}"


async def invalidate_dashboard_cache(
    redis: OptionalRedisClient,
    exchange: ExchangeCode,
) -> None:
    if not redis.is_available:
        return

    for section in DASHBOARD_CACHE_KEY_NAMES:
        key = dashboard_cache_key(section, exchange)
        try:
            await redis.delete(key)
        except Exception:
            logger.warning("Failed to delete dashboard cache key %s", key, exc_info=True)
