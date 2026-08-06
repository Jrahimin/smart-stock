import asyncio
import logging
from contextlib import suppress
from datetime import datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from app.core.core_config import Settings, get_settings
from app.core.enums import (
    ExchangeCode,
    StockDetailsSyncScope,
    SystemJobTriggerSource,
    SystemJobType,
)
from app.jobs.market_session_schedule import (
    next_daily_sync_at,
    next_snapshot_sync_at,
    next_stock_details_sync_at,
)
from app.jobs.system_job_queue import enqueue_system_job

logger = logging.getLogger(__name__)

DHAKA_TIMEZONE = ZoneInfo("Asia/Dhaka")


async def enqueue_scheduled_market_snapshot(
    next_run_at: datetime,
    *,
    settings: Settings,
) -> tuple[UUID, bool]:
    return await enqueue_system_job(
        job_type=SystemJobType.MARKET_SNAPSHOT,
        job_name="Scheduled Market Snapshot",
        trigger_source=SystemJobTriggerSource.SCHEDULER,
        metadata={"trade_date": next_run_at.date().isoformat()},
        settings=settings,
    )


async def enqueue_scheduled_daily_market_sync(
    next_run_at: datetime,
    *,
    settings: Settings,
) -> tuple[UUID, bool]:
    return await enqueue_system_job(
        job_type=SystemJobType.MARKET_SYNC,
        job_name="Scheduled Daily Close, News & Finalization",
        trigger_source=SystemJobTriggerSource.SCHEDULER,
        metadata={"trade_date": next_run_at.date().isoformat()},
        settings=settings,
    )


async def enqueue_scheduled_stock_details_sync(
    *,
    settings: Settings,
) -> tuple[UUID, bool]:
    return await enqueue_system_job(
        job_type=SystemJobType.STOCK_DETAILS_SYNC,
        job_name=(
            "Scheduled Stock Details Due Batch "
            f"({settings.stock_details_sync_batch_size})"
        ),
        trigger_source=SystemJobTriggerSource.SCHEDULER,
        metadata={
            "exchange": ExchangeCode.DSE.value,
            "scope": StockDetailsSyncScope.FULL.value,
            "limit": settings.stock_details_sync_batch_size,
            "offset": 0,
            "force": False,
        },
        settings=settings,
    )


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
                execution_id, deduplicated = (
                    await enqueue_scheduled_market_snapshot(
                        next_run_at,
                        settings=settings,
                    )
                )
                logger.info(
                    "Scheduled market snapshot queued id=%s deduplicated=%s",
                    execution_id,
                    deduplicated,
                )
            except Exception:
                logger.exception("Market snapshot enqueue failed")


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
                execution_id, deduplicated = (
                    await enqueue_scheduled_daily_market_sync(
                        next_run_at,
                        settings=settings,
                    )
                )
                logger.info(
                    "Scheduled daily market sync queued id=%s deduplicated=%s",
                    execution_id,
                    deduplicated,
                )
            except Exception:
                logger.exception("Daily market sync enqueue failed")


class StockDetailsSyncScheduler:
    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._task = asyncio.create_task(
            self._run(),
            name="stock-details-sync-scheduler",
        )
        logger.info("Stock details sync scheduler started")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        with suppress(asyncio.CancelledError):
            await self._task
        self._task = None
        logger.info("Stock details sync scheduler stopped")

    async def _run(self) -> None:
        while True:
            settings = get_settings()
            now = datetime.now(DHAKA_TIMEZONE)
            next_run_at = next_stock_details_sync_at(now, settings)
            if next_run_at is None:
                await asyncio.sleep(3600)
                continue
            wait_seconds = max((next_run_at - now).total_seconds(), 0)
            logger.info(
                "Next stock details due batch scheduled for %s",
                next_run_at.isoformat(),
            )
            await asyncio.sleep(wait_seconds)
            try:
                execution_id, deduplicated = (
                    await enqueue_scheduled_stock_details_sync(
                        settings=settings,
                    )
                )
                logger.info(
                    "Scheduled stock details due batch queued "
                    "id=%s deduplicated=%s",
                    execution_id,
                    deduplicated,
                )
            except Exception:
                logger.exception("Stock details due-batch enqueue failed")


market_snapshot_scheduler = MarketSnapshotScheduler()
daily_market_sync_scheduler = DailyMarketSyncScheduler()
stock_details_sync_scheduler = StockDetailsSyncScheduler()

# Backward-compatible alias for imports expecting a single scheduler name.
market_data_scheduler = market_snapshot_scheduler
