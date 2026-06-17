from __future__ import annotations

import logging

from app.core.enums import ExchangeCode
from app.core.redis_client import OptionalRedisClient
from app.modules.market_universe.market_universe_cache import UNIVERSE_CACHE_KEY_NAMES, universe_cache_key

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

PULSE_CACHE_KEY_NAMES: tuple[str, ...] = (
    "response",
    "summary",
)


def dashboard_cache_key(section: str, exchange: ExchangeCode) -> str:
    return f"dashboard:{section}:{exchange.value}"


def pulse_cache_key(section: str, exchange: ExchangeCode) -> str:
    return f"pulse:{section}:{exchange.value}"


async def invalidate_market_caches(
    redis: OptionalRedisClient,
    exchange: ExchangeCode,
) -> None:
    """Delete presentation caches then foundation universe:scored (best-effort)."""
    if not redis.is_available:
        return

    for section in DASHBOARD_CACHE_KEY_NAMES:
        key = dashboard_cache_key(section, exchange)
        try:
            await redis.delete(key)
        except Exception:
            logger.warning("Failed to delete dashboard cache key %s", key, exc_info=True)

    for section in PULSE_CACHE_KEY_NAMES:
        key = pulse_cache_key(section, exchange)
        try:
            await redis.delete(key)
        except Exception:
            logger.warning("Failed to delete pulse cache key %s", key, exc_info=True)

    for section in UNIVERSE_CACHE_KEY_NAMES:
        key = universe_cache_key(section, exchange)
        try:
            await redis.delete(key)
        except Exception:
            logger.warning("Failed to delete universe cache key %s", key, exc_info=True)


async def invalidate_dashboard_cache(
    redis: OptionalRedisClient,
    exchange: ExchangeCode,
) -> None:
    """Backward-compatible alias — invalidates all market caches."""
    await invalidate_market_caches(redis, exchange)
