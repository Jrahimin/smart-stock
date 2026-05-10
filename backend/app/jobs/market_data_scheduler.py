import asyncio
import logging
from contextlib import suppress
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.jobs.ingestion.ingest_daily_market_prices import run_daily_market_sync

logger = logging.getLogger(__name__)

DHAKA_TIMEZONE = ZoneInfo("Asia/Dhaka")
DAILY_MARKET_SYNC_TIME = time(hour=14, minute=30, tzinfo=DHAKA_TIMEZONE)


class MarketDataScheduler:
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
            next_run_at = self._next_run_at(datetime.now(DHAKA_TIMEZONE))
            wait_seconds = max((next_run_at - datetime.now(DHAKA_TIMEZONE)).total_seconds(), 0)
            logger.info("Next daily market sync scheduled for %s", next_run_at.isoformat())
            await asyncio.sleep(wait_seconds)

            try:
                await run_daily_market_sync(next_run_at.date())
            except Exception:
                logger.exception("Daily market sync failed")

    def _next_run_at(self, now: datetime) -> datetime:
        today_run_at = datetime.combine(now.date(), DAILY_MARKET_SYNC_TIME)
        if now < today_run_at:
            return today_run_at
        return today_run_at + timedelta(days=1)


market_data_scheduler = MarketDataScheduler()
