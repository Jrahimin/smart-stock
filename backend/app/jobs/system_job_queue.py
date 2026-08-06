from __future__ import annotations

import asyncio
import logging
from contextlib import suppress
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from app.core.core_config import Settings, get_settings
from app.core.database_session import AsyncSessionLocal
from app.core.enums import (
    SystemJobExecutionStatus,
    SystemJobTriggerSource,
    SystemJobType,
)
from app.models import SystemJobExecution
from app.modules.admin_jobs.admin_jobs_repository import AdminJobsRepository
from app.modules.admin_jobs.admin_jobs_runner import (
    SystemJobRunOutcome,
    run_system_job,
)
from app.modules.admin_jobs.admin_jobs_service import AdminJobsService

logger = logging.getLogger(__name__)

SCHEDULER_COMPONENT_NAME = "backend-scheduler"
SCHEDULER_HEARTBEAT_INTERVAL_SECONDS = 60
SCHEDULER_HEARTBEAT_FRESH_SECONDS = 120
SYSTEM_JOB_HISTORY_RETENTION_DAYS = 90
SYSTEM_JOB_HISTORY_CLEANUP_INTERVAL_SECONDS = 86_400
ABANDONED_EXECUTION_REASON = (
    "Scheduler restarted before this execution completed; the job is safe to retry."
)
SCHEDULER_SHUTDOWN_REASON = (
    "Scheduler stopped while this execution was running; the job is safe to retry."
)


async def enqueue_system_job(
    *,
    job_type: SystemJobType,
    job_name: str,
    trigger_source: SystemJobTriggerSource,
    metadata: dict[str, Any] | None = None,
    triggered_by_user_id: UUID | None = None,
    dedupe_key: str | None = None,
    settings: Settings | None = None,
) -> tuple[UUID, bool]:
    resolved_settings = settings or get_settings()
    async with AsyncSessionLocal() as session:
        service = AdminJobsService(
            AdminJobsRepository(session),
            resolved_settings,
        )
        execution, deduplicated = await service.enqueue_job(
            job_type=job_type,
            job_name=job_name,
            trigger_source=trigger_source,
            triggered_by_user_id=triggered_by_user_id,
            metadata=metadata,
            dedupe_key=dedupe_key,
        )
        return execution.id, deduplicated


class SystemJobQueueRuntime:
    def __init__(self) -> None:
        self._worker_task: asyncio.Task[None] | None = None
        self._heartbeat_task: asyncio.Task[None] | None = None
        self._cleanup_task: asyncio.Task[None] | None = None
        self._settings: Settings | None = None

    async def start(self) -> None:
        if self._worker_task is not None and not self._worker_task.done():
            return
        self._settings = get_settings()
        recovered_count = await self.recover_abandoned_executions()
        if recovered_count:
            logger.warning(
                "Recovered %s abandoned system job execution(s)",
                recovered_count,
            )
        await self.record_heartbeat()
        await self.cleanup_terminal_history()
        self._worker_task = asyncio.create_task(
            self._worker_loop(),
            name="system-job-queue-worker",
        )
        self._heartbeat_task = asyncio.create_task(
            self._heartbeat_loop(),
            name="backend-scheduler-heartbeat",
        )
        self._cleanup_task = asyncio.create_task(
            self._cleanup_loop(),
            name="system-job-history-cleanup",
        )
        logger.info(
            "System job queue worker started (poll=%ss)",
            self.settings.system_job_queue_poll_seconds,
        )

    async def stop(self) -> None:
        tasks = [
            self._worker_task,
            self._heartbeat_task,
            self._cleanup_task,
        ]
        for task in tasks:
            if task is not None:
                task.cancel()
        for task in tasks:
            if task is not None:
                with suppress(asyncio.CancelledError):
                    await task
        self._worker_task = None
        self._heartbeat_task = None
        self._cleanup_task = None
        logger.info("System job queue worker stopped")

    @property
    def settings(self) -> Settings:
        return self._settings or get_settings()

    async def recover_abandoned_executions(self) -> int:
        async with AsyncSessionLocal() as session:
            repository = AdminJobsRepository(session)
            count = await repository.recover_abandoned_running(
                recovered_at=datetime.now(UTC),
                reason=ABANDONED_EXECUTION_REASON,
            )
            await session.commit()
            return count

    async def cleanup_terminal_history(self) -> int:
        cutoff = datetime.now(UTC) - timedelta(
            days=SYSTEM_JOB_HISTORY_RETENTION_DAYS
        )
        async with AsyncSessionLocal() as session:
            repository = AdminJobsRepository(session)
            count = await repository.delete_terminal_history_before(cutoff)
            await session.commit()
        if count:
            logger.info(
                "Deleted %s terminal system job execution(s) older than %s days",
                count,
                SYSTEM_JOB_HISTORY_RETENTION_DAYS,
            )
        return count

    async def record_heartbeat(self) -> None:
        now = datetime.now(UTC)
        async with AsyncSessionLocal() as session:
            repository = AdminJobsRepository(session)
            await repository.record_scheduler_heartbeat(
                component_name=SCHEDULER_COMPONENT_NAME,
                heartbeat_at=now,
                metadata={
                    "queue_poll_seconds": (
                        self.settings.system_job_queue_poll_seconds
                    ),
                    "market_snapshot_enabled": (
                        self.settings.market_snapshot_scheduler_enabled
                    ),
                    "daily_market_sync_enabled": (
                        self.settings.daily_market_sync_scheduler_enabled
                    ),
                    "stock_details_sync_enabled": (
                        self.settings.stock_details_sync_scheduler_enabled
                    ),
                },
            )
            await session.commit()

    async def _worker_loop(self) -> None:
        while True:
            try:
                execution = await self._claim_next_execution()
            except Exception:
                logger.exception("Failed to claim a pending system job")
                await asyncio.sleep(
                    self.settings.system_job_queue_poll_seconds
                )
                continue
            if execution is None:
                await asyncio.sleep(
                    self.settings.system_job_queue_poll_seconds
                )
                continue

            logger.info(
                "Executing queued system job id=%s type=%s attempt=%s",
                execution.id,
                execution.job_type.value,
                execution.attempt_count,
            )
            try:
                outcome = await run_system_job(
                    execution,
                    settings=self.settings,
                )
            except asyncio.CancelledError:
                with suppress(Exception):
                    await self._mark_terminal(
                        execution,
                        SystemJobRunOutcome(
                            status=SystemJobExecutionStatus.FAILED,
                            result=None,
                            error_message=SCHEDULER_SHUTDOWN_REASON,
                            error_metadata={
                                "type": "SchedulerShutdown",
                                "message": SCHEDULER_SHUTDOWN_REASON,
                                "recoverable": True,
                            },
                        ),
                    )
                raise
            await self._mark_terminal_with_retry(execution, outcome)

    async def _claim_next_execution(self) -> SystemJobExecution | None:
        async with AsyncSessionLocal() as session:
            repository = AdminJobsRepository(session)
            execution = await repository.claim_next_pending(
                claimed_at=datetime.now(UTC)
            )
            await session.commit()
            return execution

    async def _mark_terminal(
        self,
        execution: SystemJobExecution,
        outcome: SystemJobRunOutcome,
    ) -> None:
        completed_at = datetime.now(UTC)
        duration_ms = (
            max(
                0,
                int(
                    (completed_at - execution.started_at).total_seconds()
                    * 1000
                ),
            )
            if execution.started_at is not None
            else None
        )
        async with AsyncSessionLocal() as session:
            repository = AdminJobsRepository(session)
            terminal = await repository.mark_terminal(
                execution.id,
                status=outcome.status,
                completed_at=completed_at,
                duration_ms=duration_ms,
                result=outcome.result,
                error_message=outcome.error_message,
                error_metadata=outcome.error_metadata,
            )
            await session.commit()
        if terminal is None:
            logger.warning(
                "Queued system job id=%s was no longer RUNNING at completion",
                execution.id,
            )
            return
        logger.info(
            "Queued system job completed id=%s status=%s duration_ms=%s",
            execution.id,
            outcome.status.value,
            duration_ms,
        )

    async def _mark_terminal_with_retry(
        self,
        execution: SystemJobExecution,
        outcome: SystemJobRunOutcome,
    ) -> None:
        while True:
            try:
                await self._mark_terminal(execution, outcome)
                return
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception(
                    "Failed to persist terminal system job state id=%s; retrying",
                    execution.id,
                )
                await asyncio.sleep(
                    self.settings.system_job_queue_poll_seconds
                )

    async def _heartbeat_loop(self) -> None:
        while True:
            await asyncio.sleep(SCHEDULER_HEARTBEAT_INTERVAL_SECONDS)
            try:
                await self.record_heartbeat()
            except Exception:
                logger.exception("Failed to persist backend-scheduler heartbeat")

    async def _cleanup_loop(self) -> None:
        while True:
            await asyncio.sleep(
                SYSTEM_JOB_HISTORY_CLEANUP_INTERVAL_SECONDS
            )
            try:
                await self.cleanup_terminal_history()
            except Exception:
                logger.exception("Failed to clean terminal system job history")


system_job_queue_runtime = SystemJobQueueRuntime()
