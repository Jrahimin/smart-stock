from datetime import UTC, datetime
from uuid import UUID

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_repository import BaseRepository
from app.core.database_session import get_db_session
from app.core.enums import SystemJobExecutionStatus, SystemJobType
from app.models import SystemJobExecution


class AdminJobsRepository(BaseRepository[SystemJobExecution]):
    model = SystemJobExecution

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def list_executions(
        self,
        *,
        job_type: SystemJobType | None = None,
        status: SystemJobExecutionStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[SystemJobExecution]:
        statement = select(SystemJobExecution)
        if job_type is not None:
            statement = statement.where(SystemJobExecution.job_type == job_type)
        if status is not None:
            statement = statement.where(SystemJobExecution.status == status)
        statement = statement.order_by(
            SystemJobExecution.started_at.desc().nullslast(),
            SystemJobExecution.created_at.desc(),
            SystemJobExecution.id.desc(),
        ).limit(limit).offset(offset)
        result = await self.session.scalars(statement)
        return list(result.all())

    async def get_by_id(self, execution_id: UUID) -> SystemJobExecution | None:
        return await self.session.get(SystemJobExecution, execution_id)

    async def count_by_status(self, status: SystemJobExecutionStatus) -> int:
        statement = select(func.count()).select_from(SystemJobExecution).where(
            SystemJobExecution.status == status
        )
        return int(await self.session.scalar(statement) or 0)

    async def get_latest_by_job_type(self, job_type: SystemJobType) -> SystemJobExecution | None:
        statement = (
            select(SystemJobExecution)
            .where(SystemJobExecution.job_type == job_type)
            .order_by(SystemJobExecution.started_at.desc().nullslast(), SystemJobExecution.id.desc())
            .limit(1)
        )
        return await self.session.scalar(statement)


def get_admin_jobs_repository(session: AsyncSession = Depends(get_db_session)) -> AdminJobsRepository:
    return AdminJobsRepository(session)
