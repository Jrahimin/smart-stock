from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from fastapi import Depends

from app.core.core_config import Settings, get_settings
from app.core.enums import (
    ExchangeCode,
    StockDetailsSyncScope,
    StockDetailsSyncTriggerType,
    SystemJobExecutionStatus,
    SystemJobTriggerSource,
    SystemJobType,
)
from app.core.exception_handlers import NotFoundError
from app.core.security_config import UserContext
from app.jobs.indicators.compute_daily_indicators import compute_daily_indicators
from app.jobs.ingestion.ingest_daily_market_prices import run_daily_market_sync, sync_market_snapshot
from app.jobs.ingest_stock_details import ingest_stock_details
from app.jobs.signals.generate_daily_signals import generate_daily_signals
from app.models import SystemJobExecution
from app.modules.admin_jobs.admin_jobs_repository import AdminJobsRepository, get_admin_jobs_repository
from app.modules.admin_jobs.admin_jobs_schemas import (
    AdminJobTriggerRequest,
    SystemJobExecutionRead,
    SystemJobTriggerResult,
)
from zoneinfo import ZoneInfo

DHAKA_TIMEZONE = ZoneInfo("Asia/Dhaka")


def _duration_ms(started_at: datetime | None, completed_at: datetime | None) -> int | None:
    if started_at is None or completed_at is None:
        return None
    return int((completed_at - started_at).total_seconds() * 1000)


class AdminJobsService:
    def __init__(self, repository: AdminJobsRepository, settings: Settings) -> None:
        self.repository = repository
        self.settings = settings

    async def list_executions(
        self,
        *,
        job_type: SystemJobType | None = None,
        status: SystemJobExecutionStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[SystemJobExecution]:
        return await self.repository.list_executions(
            job_type=job_type,
            status=status,
            limit=limit,
            offset=offset,
        )

    async def get_execution(self, execution_id: UUID) -> SystemJobExecution:
        execution = await self.repository.get_by_id(execution_id)
        if execution is None:
            raise NotFoundError("System job execution was not found")
        return execution

    async def trigger_job(
        self,
        *,
        request: AdminJobTriggerRequest,
        actor: UserContext,
    ) -> SystemJobTriggerResult:
        execution = await self._create_execution(
            job_type=request.job_type,
            job_name=request.job_name or request.job_type.value,
            trigger_source=SystemJobTriggerSource.MANUAL,
            triggered_by_user_id=UUID(actor.user_id),
            metadata=request.metadata,
        )
        await self.repository.commit()

        try:
            result = await self._run_job(request.job_type, request.metadata)
            execution.status = SystemJobExecutionStatus.SUCCEEDED
            execution.completed_at = datetime.now(UTC)
            execution.duration_ms = _duration_ms(execution.started_at, execution.completed_at)
            execution.metadata_json = {**execution.metadata_json, "result": result}
        except Exception as exc:
            execution.status = SystemJobExecutionStatus.FAILED
            execution.completed_at = datetime.now(UTC)
            execution.duration_ms = _duration_ms(execution.started_at, execution.completed_at)
            execution.error_message = str(exc)
            await self.repository.commit()
            raise

        await self.repository.commit()
        return SystemJobTriggerResult(
            execution=SystemJobExecutionRead.model_validate(execution),
            result_summary=result,
        )

    async def _create_execution(
        self,
        *,
        job_type: SystemJobType,
        job_name: str,
        trigger_source: SystemJobTriggerSource,
        triggered_by_user_id: UUID | None,
        metadata: dict[str, Any] | None = None,
    ) -> SystemJobExecution:
        now = datetime.now(UTC)
        return await self.repository.create(
            {
                "job_type": job_type,
                "job_name": job_name,
                "status": SystemJobExecutionStatus.RUNNING,
                "trigger_source": trigger_source,
                "triggered_by_user_id": triggered_by_user_id,
                "started_at": now,
                "metadata_json": metadata or {},
            }
        )

    async def _run_job(self, job_type: SystemJobType, metadata: dict[str, Any]) -> dict[str, Any]:
        trade_date = date.fromisoformat(metadata["trade_date"]) if metadata.get("trade_date") else datetime.now(DHAKA_TIMEZONE).date()

        if job_type == SystemJobType.MARKET_SNAPSHOT:
            result = await sync_market_snapshot(trade_date)
            return result.model_dump()
        if job_type == SystemJobType.MARKET_SYNC:
            result = await run_daily_market_sync(trade_date)
            return result.model_dump()
        if job_type == SystemJobType.STOCK_DETAILS_SYNC:
            result = await ingest_stock_details(
                exchange=ExchangeCode(metadata.get("exchange", ExchangeCode.DSE.value)),
                symbols=metadata.get("symbols"),
                limit=metadata.get("limit", 20),
                offset=metadata.get("offset", 0),
                force=bool(metadata.get("force", False)),
                trigger_type=StockDetailsSyncTriggerType.MANUAL,
                scope=StockDetailsSyncScope(metadata.get("scope", StockDetailsSyncScope.FULL.value)),
            )
            return result.model_dump()
        if job_type == SystemJobType.INDICATORS:
            return await compute_daily_indicators(trade_date)
        if job_type == SystemJobType.SIGNALS:
            return await generate_daily_signals(trade_date)
        raise ValueError(f"Unsupported job type: {job_type}")


def get_admin_jobs_service(
    repository: AdminJobsRepository = Depends(get_admin_jobs_repository),
    settings: Settings = Depends(get_settings),
) -> AdminJobsService:
    return AdminJobsService(repository, settings)
