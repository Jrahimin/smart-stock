import asyncio
import logging
from contextlib import suppress
from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.core_config import get_settings
from app.jobs.ingestion.ingest_daily_market_prices import run_daily_market_sync, sync_market_snapshot
from app.jobs.market_session_schedule import next_daily_sync_at, next_snapshot_sync_at

logger = logging.getLogger(__name__)

DHAKA_TIMEZONE = ZoneInfo("Asia/Dhaka")


class MarketSnapshotScheduler:
    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._task = asyncio.create_task(self._run(), name="market-snapshot-scheduler")
        logger.info("Market snapshot scheduler started")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        with suppress(asyncio.CancelledError):
            await self._task
        self._task = None
        logger.info("Market snapshot scheduler stopped")

    async def _run(self) -> None:
        while True:
            settings = get_settings()
            now = datetime.now(DHAKA_TIMEZONE)
            next_run_at = next_snapshot_sync_at(now, settings)
            if next_run_at is None:
                await asyncio.sleep(3600)
                continue
            wait_seconds = max((next_run_at - now).total_seconds(), 0)
            logger.info("Next market snapshot scheduled for %s", next_run_at.isoformat())
            await asyncio.sleep(wait_seconds)
            try:
                await sync_market_snapshot(next_run_at.date())
            except Exception:
                logger.exception("Market snapshot sync failed")


class DailyMarketSyncScheduler:
    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._task = asyncio.create_task(self._run(), name="daily-market-sync-scheduler")
        logger.info("Daily market sync scheduler started")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        with suppress(asyncio.CancelledError):
            await self._task
        self._task = None
        logger.info("Daily market sync scheduler stopped")

    async def _run(self) -> None:
        while True:
            settings = get_settings()
            now = datetime.now(DHAKA_TIMEZONE)
            next_run_at = next_daily_sync_at(now, settings)
            if next_run_at is None:
                await asyncio.sleep(3600)
                continue
            wait_seconds = max((next_run_at - now).total_seconds(), 0)
            logger.info("Next daily market sync scheduled for %s", next_run_at.isoformat())
            await asyncio.sleep(wait_seconds)
            try:
                await run_daily_market_sync(next_run_at.date())
            except Exception:
                logger.exception("Daily market sync failed")


market_snapshot_scheduler = MarketSnapshotScheduler()
daily_market_sync_scheduler = DailyMarketSyncScheduler()

# Backward-compatible alias for imports expecting a single scheduler name.
market_data_scheduler = market_snapshot_scheduler
