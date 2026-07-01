"""Fire-and-forget entry points for market cache rebuild (no heavy imports at module load)."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable

from app.core.core_config import Settings, get_settings
from app.core.enums import ExchangeCode
from app.core.redis_client import OptionalRedisClient, build_redis_client
from app.modules.market_universe.market_universe_cache import universe_cache_key, universe_prev_cache_key

logger = logging.getLogger(__name__)

_rebuild_tasks: set[asyncio.Task[None]] = set()
_inflight_rebuilds: dict[str, asyncio.Task[None]] = {}


def _rebuild_key(kind: str, exchange: ExchangeCode) -> str:
    return f"{kind}:{exchange.value}"


def _is_rebuild_in_flight(key: str) -> bool:
    task = _inflight_rebuilds.get(key)
    return task is not None and not task.done()


def _spawn_rebuild_task(
    key: str,
    *,
    task_name: str,
    runner: Callable[[], Awaitable[None]],
) -> bool:
    if _is_rebuild_in_flight(key):
        logger.debug("Rebuild already in flight for %s; skipping duplicate spawn", key)
        return False

    async def _run() -> None:
        try:
            await runner()
        except Exception:
            logger.exception("Background rebuild failed for %s", key)
        finally:
            _inflight_rebuilds.pop(key, None)

    task = asyncio.create_task(_run(), name=task_name)
    _inflight_rebuilds[key] = task
    _rebuild_tasks.add(task)
    task.add_done_callback(_rebuild_tasks.discard)
    return True


async def warm_market_read_cache_if_cold(
    exchange: ExchangeCode = ExchangeCode.DSE,
    *,
    settings: Settings | None = None,
    redis: OptionalRedisClient | None = None,
) -> None:
    """Spawn a full read-cache rebuild when Redis has no scored universe (e.g. after docker up)."""
    resolved_settings = settings or get_settings()
    resolved_redis = redis if redis is not None else build_redis_client(resolved_settings)
    if not resolved_redis.is_available:
        return

    scored = await resolved_redis.get_json(universe_cache_key("scored", exchange))
    if scored is not None:
        return

    prev = await resolved_redis.get_json(universe_prev_cache_key(exchange))
    if prev is not None:
        return

    logger.info("Cold scored-universe cache for %s; spawning background warm", exchange.value)
    spawn_rebuild_market_read_cache(exchange, settings=resolved_settings)


def spawn_rebuild_market_read_cache(
    exchange: ExchangeCode,
    *,
    settings: Settings | None = None,
    include_universe: bool = True,
) -> bool:
    """Schedule full read-cache rebuild without blocking the caller."""

    async def _run() -> None:
        from app.jobs.market_cache_rebuild import rebuild_market_read_cache

        await rebuild_market_read_cache(
            exchange,
            settings=settings,
            include_universe=include_universe,
        )

    return _spawn_rebuild_task(
        _rebuild_key("market-read", exchange),
        task_name=f"rebuild-market-read-cache-{exchange.value}",
        runner=_run,
    )


def spawn_rebuild_universe_read_cache(exchange: ExchangeCode, *, settings: Settings | None = None) -> bool:
    market_key = _rebuild_key("market-read", exchange)
    universe_key = _rebuild_key("universe-read", exchange)
    if _is_rebuild_in_flight(market_key) or _is_rebuild_in_flight(universe_key):
        logger.debug(
            "Universe rebuild already covered or in flight for %s; skipping duplicate spawn",
            exchange.value,
        )
        return False

    async def _run() -> None:
        from app.jobs.market_cache_rebuild import rebuild_universe_read_cache

        await rebuild_universe_read_cache(exchange, settings=settings or get_settings())

    return _spawn_rebuild_task(
        universe_key,
        task_name=f"rebuild-universe-read-cache-{exchange.value}",
        runner=_run,
    )
