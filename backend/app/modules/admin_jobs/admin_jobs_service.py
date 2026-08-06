from __future__ import annotations

import hashlib
import json
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Any
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import Depends
from sqlalchemy.exc import IntegrityError

from app.core.core_config import Settings, get_settings
from app.core.enums import (
    ExchangeCode,
    StockDetailsSyncScope,
    SystemJobExecutionStatus,
    SystemJobTriggerSource,
    SystemJobType,
)
from app.core.exception_handlers import NotFoundError
from app.core.security_config import UserContext
from app.models import SystemJobExecution
from app.modules.admin_jobs.admin_jobs_repository import (
    AdminJobsRepository,
    get_admin_jobs_repository,
)
from app.modules.admin_jobs.admin_jobs_schemas import (
    AdminJobTriggerRequest,
    SystemJobExecutionRead,
    SystemJobTriggerResult,
)

DHAKA_TIMEZONE = ZoneInfo("Asia/Dhaka")
MANUAL_JOB_NAMES = {
    SystemJobType.MARKET_SNAPSHOT: "Market Snapshot",
    SystemJobType.MARKET_SYNC: "Daily Close, News & Finalization",
    SystemJobType.STOCK_DETAILS_SYNC: "Stock Details Batch (20)",
    SystemJobType.INDICATORS: "Daily Indicators",
    SystemJobType.SIGNALS: "Daily Signals",
}


class AdminJobsService:
    def __init__(self, repository: AdminJobsRepository, settings: Settings) -> None:
        self.repository = repository
        self.settings = settings

    async def list_executions(
        self,
        *,
        job_type: SystemJobType | None = None,
        status: SystemJobExecutionStatus | None = None,
        trigger_source: SystemJobTriggerSource | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[SystemJobExecution]:
        created_from = (
            datetime.combine(date_from, time.min, tzinfo=DHAKA_TIMEZONE).astimezone(
                UTC
            )
            if date_from is not None
            else None
        )
        created_before = (
            datetime.combine(
                date_to + timedelta(days=1),
                time.min,
                tzinfo=DHAKA_TIMEZONE,
            ).astimezone(UTC)
            if date_to is not None
            else None
        )
        return await self.repository.list_executions(
            job_type=job_type,
            status=status,
            trigger_source=trigger_source,
            created_from=created_from,
            created_before=created_before,
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
        metadata = self._normalize_metadata(
            job_type=request.job_type,
            metadata=request.metadata,
            trigger_source=SystemJobTriggerSource.MANUAL,
        )
        execution, deduplicated = await self.enqueue_job(
            job_type=request.job_type,
            job_name=request.job_name
            or MANUAL_JOB_NAMES.get(request.job_type, request.job_type.value),
            trigger_source=SystemJobTriggerSource.MANUAL,
            triggered_by_user_id=UUID(actor.user_id),
            metadata=metadata,
        )
        return SystemJobTriggerResult(
            execution=SystemJobExecutionRead.model_validate(execution),
            deduplicated=deduplicated,
        )

    async def enqueue_job(
        self,
        *,
        job_type: SystemJobType,
        job_name: str,
        trigger_source: SystemJobTriggerSource,
        triggered_by_user_id: UUID | None,
        metadata: dict[str, Any] | None = None,
        dedupe_key: str | None = None,
    ) -> tuple[SystemJobExecution, bool]:
        normalized_metadata = self._normalize_metadata(
            job_type=job_type,
            metadata=metadata or {},
            trigger_source=trigger_source,
        )
        resolved_dedupe_key = dedupe_key or build_system_job_dedupe_key(
            job_type=job_type,
            metadata=normalized_metadata,
        )
        existing = await self.repository.get_active_by_dedupe_key(
            resolved_dedupe_key
        )
        if existing is not None:
            return existing, True

        try:
            execution = await self.repository.create(
                {
                    "job_type": job_type,
                    "job_name": job_name,
                    "dedupe_key": resolved_dedupe_key,
                    "status": SystemJobExecutionStatus.PENDING,
                    "trigger_source": trigger_source,
                    "triggered_by_user_id": triggered_by_user_id,
                    "started_at": None,
                    "completed_at": None,
                    "attempt_count": 0,
                    "metadata_json": normalized_metadata,
                }
            )
            await self.repository.commit()
            return execution, False
        except IntegrityError:
            await self.repository.session.rollback()
            existing = await self.repository.get_active_by_dedupe_key(
                resolved_dedupe_key
            )
            if existing is None:
                raise
            return existing, True

    def _normalize_metadata(
        self,
        *,
        job_type: SystemJobType,
        metadata: dict[str, Any],
        trigger_source: SystemJobTriggerSource,
    ) -> dict[str, Any]:
        normalized = dict(metadata)
        if job_type in {
            SystemJobType.MARKET_SNAPSHOT,
            SystemJobType.MARKET_SYNC,
            SystemJobType.INDICATORS,
            SystemJobType.SIGNALS,
        }:
            normalized.setdefault(
                "trade_date",
                datetime.now(DHAKA_TIMEZONE).date().isoformat(),
            )
        if job_type == SystemJobType.STOCK_DETAILS_SYNC:
            normalized.setdefault("exchange", ExchangeCode.DSE.value)
            normalized.setdefault("scope", StockDetailsSyncScope.FULL.value)
            normalized.setdefault("offset", 0)
            normalized.setdefault("force", False)
            normalized.setdefault(
                "limit",
                20
                if trigger_source == SystemJobTriggerSource.MANUAL
                else self.settings.stock_details_sync_batch_size,
            )
        return normalized


def build_system_job_dedupe_key(
    *,
    job_type: SystemJobType,
    metadata: dict[str, Any],
) -> str:
    canonical = json.dumps(
        {"job_type": job_type.value, "metadata": metadata},
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"{job_type.value.lower()}:{digest}"


def get_admin_jobs_service(
    repository: Annotated[AdminJobsRepository, Depends(get_admin_jobs_repository)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AdminJobsService:
    return AdminJobsService(repository, settings)
