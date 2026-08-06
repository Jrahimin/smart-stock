from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import Depends
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_repository import BaseRepository
from app.core.database_session import get_db_session
from app.core.enums import (
    EmailCampaignStatus,
    SystemJobExecutionStatus,
    SystemJobTriggerSource,
    SystemJobType,
)
from app.models import EmailCampaign, SchedulerHeartbeat, SystemJobExecution

TERMINAL_JOB_STATUSES = (
    SystemJobExecutionStatus.SUCCEEDED,
    SystemJobExecutionStatus.PARTIAL,
    SystemJobExecutionStatus.SKIPPED,
    SystemJobExecutionStatus.FAILED,
    SystemJobExecutionStatus.CANCELLED,
)


class AdminJobsRepository(BaseRepository[SystemJobExecution]):
    model = SystemJobExecution

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def list_executions(
        self,
        *,
        job_type: SystemJobType | None = None,
        status: SystemJobExecutionStatus | None = None,
        trigger_source: SystemJobTriggerSource | None = None,
        created_from: datetime | None = None,
        created_before: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[SystemJobExecution]:
        statement = select(SystemJobExecution)
        if job_type is not None:
            statement = statement.where(SystemJobExecution.job_type == job_type)
        if status is not None:
            statement = statement.where(SystemJobExecution.status == status)
        if trigger_source is not None:
            statement = statement.where(
                SystemJobExecution.trigger_source == trigger_source
            )
        if created_from is not None:
            statement = statement.where(SystemJobExecution.created_at >= created_from)
        if created_before is not None:
            statement = statement.where(
                SystemJobExecution.created_at < created_before
            )
        statement = statement.order_by(
            SystemJobExecution.created_at.desc(),
            SystemJobExecution.id.desc(),
        ).limit(limit).offset(offset)
        result = await self.session.scalars(statement)
        return list(result.all())

    async def get_by_id(self, execution_id: UUID) -> SystemJobExecution | None:
        return await self.session.get(SystemJobExecution, execution_id)

    async def get_active_by_dedupe_key(
        self,
        dedupe_key: str,
    ) -> SystemJobExecution | None:
        statement = (
            select(SystemJobExecution)
            .where(
                SystemJobExecution.dedupe_key == dedupe_key,
                SystemJobExecution.status.in_(
                    [
                        SystemJobExecutionStatus.PENDING,
                        SystemJobExecutionStatus.RUNNING,
                    ]
                ),
            )
            .order_by(
                SystemJobExecution.created_at,
                SystemJobExecution.id,
            )
            .limit(1)
        )
        return await self.session.scalar(statement)

    async def claim_next_pending(
        self,
        *,
        claimed_at: datetime,
    ) -> SystemJobExecution | None:
        statement = (
            select(SystemJobExecution)
            .where(
                SystemJobExecution.status == SystemJobExecutionStatus.PENDING
            )
            .order_by(
                SystemJobExecution.created_at,
                SystemJobExecution.id,
            )
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        execution = await self.session.scalar(statement)
        if execution is None:
            return None
        execution.status = SystemJobExecutionStatus.RUNNING
        execution.started_at = claimed_at
        execution.completed_at = None
        execution.duration_ms = None
        execution.error_message = None
        execution.attempt_count += 1
        await self.session.flush()
        return execution

    async def mark_terminal(
        self,
        execution_id: UUID,
        *,
        status: SystemJobExecutionStatus,
        completed_at: datetime,
        duration_ms: int | None,
        result: dict[str, Any] | None,
        error_message: str | None,
        error_metadata: dict[str, Any] | None = None,
    ) -> SystemJobExecution | None:
        statement = (
            select(SystemJobExecution)
            .where(
                SystemJobExecution.id == execution_id,
                SystemJobExecution.status == SystemJobExecutionStatus.RUNNING,
            )
            .with_for_update()
        )
        execution = await self.session.scalar(statement)
        if execution is None:
            return None
        metadata = dict(execution.metadata_json)
        if result is not None:
            metadata["result"] = result
        if error_metadata is not None:
            metadata["error"] = error_metadata
        execution.status = status
        execution.completed_at = completed_at
        execution.duration_ms = duration_ms
        execution.error_message = error_message
        execution.metadata_json = metadata
        await self.session.flush()
        return execution

    async def recover_abandoned_running(
        self,
        *,
        recovered_at: datetime,
        reason: str,
    ) -> int:
        statement = (
            select(SystemJobExecution)
            .where(
                SystemJobExecution.status == SystemJobExecutionStatus.RUNNING
            )
            .with_for_update(skip_locked=True)
        )
        executions = list((await self.session.scalars(statement)).all())
        for execution in executions:
            execution.status = SystemJobExecutionStatus.FAILED
            execution.completed_at = recovered_at
            execution.duration_ms = (
                max(
                    0,
                    int(
                        (recovered_at - execution.started_at).total_seconds()
                        * 1000
                    ),
                )
                if execution.started_at is not None
                else None
            )
            execution.error_message = reason
            execution.metadata_json = {
                **execution.metadata_json,
                "error": {
                    "type": "AbandonedExecution",
                    "message": reason,
                    "recoverable": True,
                    "recovered_at": recovered_at.isoformat(),
                },
            }
            if execution.job_type == SystemJobType.EMAIL_CAMPAIGN:
                campaign_statement = select(EmailCampaign).where(
                    EmailCampaign.system_job_execution_id == execution.id,
                    EmailCampaign.status == EmailCampaignStatus.RUNNING,
                )
                campaign = await self.session.scalar(campaign_statement)
                if campaign is not None:
                    campaign.status = EmailCampaignStatus.FAILED
                    campaign.completed_at = recovered_at
                    campaign.metadata_json = {
                        **campaign.metadata_json,
                        "recovery_error": reason,
                    }
        await self.session.flush()
        return len(executions)

    async def delete_terminal_history_before(self, cutoff: datetime) -> int:
        statement = delete(SystemJobExecution).where(
            SystemJobExecution.status.in_(TERMINAL_JOB_STATUSES),
            SystemJobExecution.completed_at.is_not(None),
            SystemJobExecution.completed_at < cutoff,
        )
        result = await self.session.execute(statement)
        return int(getattr(result, "rowcount", 0) or 0)

    async def get_scheduler_heartbeat(
        self,
        component_name: str,
    ) -> SchedulerHeartbeat | None:
        statement = select(SchedulerHeartbeat).where(
            SchedulerHeartbeat.component_name == component_name
        )
        return await self.session.scalar(statement)

    async def record_scheduler_heartbeat(
        self,
        *,
        component_name: str,
        heartbeat_at: datetime,
        metadata: dict[str, Any],
    ) -> SchedulerHeartbeat:
        heartbeat = await self.get_scheduler_heartbeat(component_name)
        if heartbeat is None:
            heartbeat = SchedulerHeartbeat(
                component_name=component_name,
                heartbeat_at=heartbeat_at,
                metadata_json=metadata,
            )
            self.session.add(heartbeat)
        else:
            heartbeat.heartbeat_at = heartbeat_at
            heartbeat.metadata_json = metadata
        await self.session.flush()
        return heartbeat

    async def count_by_status(self, status: SystemJobExecutionStatus) -> int:
        statement = select(func.count()).select_from(SystemJobExecution).where(
            SystemJobExecution.status == status
        )
        return int(await self.session.scalar(statement) or 0)

    async def get_latest_by_job_type(self, job_type: SystemJobType) -> SystemJobExecution | None:
        statement = (
            select(SystemJobExecution)
            .where(SystemJobExecution.job_type == job_type)
            .order_by(
                SystemJobExecution.created_at.desc(),
                SystemJobExecution.id.desc(),
            )
            .limit(1)
        )
        return await self.session.scalar(statement)


def get_admin_jobs_repository(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminJobsRepository:
    return AdminJobsRepository(session)
