"""Fire-and-forget entry points for market cache rebuild (no heavy imports at module load)."""

from __future__ import annotations

import asyncio
import logging

from app.core.core_config import Settings, get_settings
from app.core.enums import ExchangeCode

logger = logging.getLogger(__name__)

_rebuild_tasks: set[asyncio.Task[None]] = set()


def spawn_rebuild_market_read_cache(
    exchange: ExchangeCode,
    *,
    settings: Settings | None = None,
    include_universe: bool = True,
) -> None:
    """Schedule full read-cache rebuild without blocking the caller."""

    async def _run() -> None:
        from app.jobs.market_cache_rebuild import rebuild_market_read_cache

        try:
            await rebuild_market_read_cache(
                exchange,
                settings=settings,
                include_universe=include_universe,
            )
        except Exception:
            logger.exception("Background rebuild_market_read_cache failed for %s", exchange.value)

    task = asyncio.create_task(_run(), name=f"rebuild-market-read-cache-{exchange.value}")
    _rebuild_tasks.add(task)
    task.add_done_callback(_rebuild_tasks.discard)


def spawn_rebuild_universe_read_cache(exchange: ExchangeCode, *, settings: Settings | None = None) -> None:
    async def _run() -> None:
        from app.jobs.market_cache_rebuild import rebuild_universe_read_cache

        try:
            await rebuild_universe_read_cache(exchange, settings=settings or get_settings())
        except Exception:
            logger.exception("Background universe rebuild failed for %s", exchange.value)

    task = asyncio.create_task(_run(), name=f"rebuild-universe-read-cache-{exchange.value}")
    _rebuild_tasks.add(task)
    task.add_done_callback(_rebuild_tasks.discard)
