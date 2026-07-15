from __future__ import annotations

import logging

from app.core.constants.trading_constants import (
    PULSE_SCORE_VERSION,
    TRADING_INPUT_SCHEMA_VERSION,
    TRADING_STRATEGY_VERSION,
    TRADING_THRESHOLD_VERSION,
)
from app.core.core_config import Settings, get_settings
from app.core.enums import ExchangeCode
from app.core.redis_client import OptionalRedisClient, build_redis_client
from app.modules.market_universe.market_universe_cache import (
    UNIVERSE_CACHE_KEY_NAMES,
    legacy_universe_cache_key,
    strategy_only_universe_cache_key,
    universe_cache_key,
    universe_prev_cache_key,
)
from app.modules.stock_details.stock_details_cache import (
    stock_sector_context_cache_pattern,
    stock_workspace_cache_pattern,
)

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
    return (
        f"pulse:{section}:{exchange.value}:"
        f"{TRADING_STRATEGY_VERSION}:{TRADING_THRESHOLD_VERSION}:"
        f"{TRADING_INPUT_SCHEMA_VERSION}:{PULSE_SCORE_VERSION}"
    )


def market_rebuild_lock_key(exchange: ExchangeCode) -> str:
    return f"market:rebuild-lock:{exchange.value}"


REBUILD_LOCK_TTL_SECONDS = 180


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
        for key in (
            universe_cache_key(section, exchange),
            strategy_only_universe_cache_key(section, exchange),
            legacy_universe_cache_key(section, exchange),
        ):
            try:
                await redis.delete(key)
            except Exception:
                logger.warning("Failed to delete universe cache key %s", key, exc_info=True)

    try:
        await redis.delete(universe_prev_cache_key(exchange))
    except Exception:
        logger.warning("Failed to delete universe prev cache for %s", exchange.value, exc_info=True)

    try:
        await redis.delete(strategy_only_universe_cache_key("scored:prev", exchange))
    except Exception:
        logger.warning(
            "Failed to delete strategy-only universe prev cache for %s",
            exchange.value,
            exc_info=True,
        )

    try:
        await redis.delete(legacy_universe_cache_key("scored:prev", exchange))
    except Exception:
        logger.warning("Failed to delete legacy universe prev cache for %s", exchange.value, exc_info=True)

    for pattern in (
        stock_sector_context_cache_pattern(exchange),
        stock_workspace_cache_pattern(exchange),
    ):
        try:
            deleted = await redis.delete_by_pattern(pattern)
            if deleted:
                logger.info("Deleted %s Redis keys matching %s", deleted, pattern)
        except Exception:
            logger.warning("Failed to delete stock detail cache keys for pattern %s", pattern, exc_info=True)


async def invalidate_dashboard_cache(
    redis: OptionalRedisClient,
    exchange: ExchangeCode,
) -> None:
    """Backward-compatible alias — invalidates all market caches."""
    await invalidate_market_caches(redis, exchange)


async def invalidate_market_caches_for_exchange(
    exchange: ExchangeCode,
    *,
    settings: Settings | None = None,
) -> None:
    """Best-effort Redis invalidation after price/indicator/signal data changes."""
    resolved_settings = settings or get_settings()
    await invalidate_market_caches(build_redis_client(resolved_settings), exchange)
