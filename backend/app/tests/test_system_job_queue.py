from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.core.core_config import Settings
from app.core.enums import (
    StockDetailsSyncScope,
    StockDetailsSyncTriggerType,
    SystemJobExecutionStatus,
    SystemJobTriggerSource,
    SystemJobType,
)
from app.jobs.market_data_scheduler import (
    enqueue_scheduled_daily_market_sync,
    enqueue_scheduled_market_snapshot,
    enqueue_scheduled_stock_details_sync,
)
from app.models import SystemJobExecution
from app.modules.admin_jobs.admin_jobs_repository import AdminJobsRepository
from app.modules.admin_jobs.admin_jobs_runner import run_system_job
from app.modules.admin_jobs.admin_jobs_schemas import AdminJobTriggerRequest
from app.modules.admin_jobs.admin_jobs_service import AdminJobsService

NOW = datetime(2026, 8, 6, 10, 30, tzinfo=UTC)


def _execution(
    *,
    job_type: SystemJobType = SystemJobType.MARKET_SNAPSHOT,
    status: SystemJobExecutionStatus = SystemJobExecutionStatus.PENDING,
    trigger_source: SystemJobTriggerSource = SystemJobTriggerSource.MANUAL,
    metadata: dict[str, object] | None = None,
) -> SystemJobExecution:
    return SystemJobExecution(
        id=uuid4(),
        job_type=job_type,
        job_name="Test Job",
        dedupe_key="test-dedupe",
        status=status,
        trigger_source=trigger_source,
        triggered_by_user_id=None,
        started_at=None,
        completed_at=None,
        duration_ms=None,
        attempt_count=0,
        error_message=None,
        metadata_json=metadata or {"trade_date": "2026-08-06"},
        created_at=NOW,
        updated_at=NOW,
    )


class FakeQueueRepository:
    def __init__(self) -> None:
        self.active: SystemJobExecution | None = None
        self.created_values: dict[str, object] | None = None
        self.commit_count = 0
        self.session = SimpleNamespace(rollback=AsyncMock())

    async def get_active_by_dedupe_key(
        self,
        dedupe_key: str,
    ) -> SystemJobExecution | None:
        if self.active is not None and self.active.dedupe_key == dedupe_key:
            return self.active
        return None

    async def create(self, values: dict[str, object]) -> SystemJobExecution:
        self.created_values = values
        self.active = SystemJobExecution(
            id=uuid4(),
            created_at=NOW,
            updated_at=NOW,
            **values,
        )
        return self.active

    async def commit(self) -> None:
        self.commit_count += 1


@pytest.mark.asyncio
async def test_manual_trigger_enqueues_pending_and_deduplicates_active_work() -> None:
    repository = FakeQueueRepository()
    service = AdminJobsService(repository, Settings(_env_file=None))
    actor = SimpleNamespace(user_id=str(uuid4()))
    request = AdminJobTriggerRequest(job_type=SystemJobType.MARKET_SNAPSHOT)

    first = await service.trigger_job(request=request, actor=actor)
    second = await service.trigger_job(request=request, actor=actor)

    assert first.deduplicated is False
    assert first.execution.status == SystemJobExecutionStatus.PENDING
    assert first.execution.started_at is None
    assert first.execution.attempt_count == 0
    assert second.deduplicated is True
    assert second.execution.id == first.execution.id
    assert repository.commit_count == 1


class ClaimSession:
    def __init__(self, execution: SystemJobExecution) -> None:
        self.execution = execution
        self.statement = None

    async def scalar(self, statement):
        self.statement = statement
        return self.execution

    async def flush(self) -> None:
        return None


@pytest.mark.asyncio
async def test_concurrent_claim_contract_uses_skip_locked_and_records_start() -> None:
    execution = _execution()
    session = ClaimSession(execution)
    repository = AdminJobsRepository(session)

    claimed = await repository.claim_next_pending(claimed_at=NOW)

    assert claimed is execution
    assert claimed.status == SystemJobExecutionStatus.RUNNING
    assert claimed.started_at == NOW
    assert claimed.attempt_count == 1
    sql = str(
        session.statement.compile(dialect=postgresql.dialect())
    ).upper()
    assert "FOR UPDATE SKIP LOCKED" in sql


def test_manual_trigger_rejects_job_types_without_a_queue_runner() -> None:
    with pytest.raises(ValidationError):
        AdminJobTriggerRequest(job_type=SystemJobType.EMAIL_CAMPAIGN)


def test_trigger_route_declares_http_202() -> None:
    from app.modules.admin_jobs.admin_jobs_router import router

    route = next(
        item
        for item in router.routes
        if getattr(item, "path", "").endswith("/trigger")
    )
    assert route.status_code == 202


@pytest.mark.asyncio
async def test_runner_marks_valid_session_no_work_as_skipped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result = SimpleNamespace(
        model_dump=lambda **_: {
            "session_skipped": True,
            "session_skip_reason": "No trading session.",
        }
    )
    monkeypatch.setattr(
        "app.modules.admin_jobs.admin_jobs_runner.sync_market_snapshot",
        AsyncMock(return_value=result),
    )

    outcome = await run_system_job(
        _execution(),
        settings=Settings(_env_file=None),
    )

    assert outcome.status == SystemJobExecutionStatus.SKIPPED
    assert outcome.result is not None
    assert outcome.result["session_skip_reason"] == "No trading session."


@pytest.mark.asyncio
async def test_runner_records_sanitized_failure_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.modules.admin_jobs.admin_jobs_runner.sync_market_snapshot",
        AsyncMock(
            side_effect=RuntimeError(
                "upstream failed token=top-secret password=hunter2"
            )
        ),
    )

    outcome = await run_system_job(
        _execution(),
        settings=Settings(_env_file=None),
    )

    assert outcome.status == SystemJobExecutionStatus.FAILED
    assert outcome.error_metadata is not None
    assert outcome.error_metadata["recoverable"] is True
    assert "top-secret" not in (outcome.error_message or "")
    assert "hunter2" not in (outcome.error_message or "")


@pytest.mark.asyncio
async def test_terminal_state_persists_result_and_error_metadata() -> None:
    execution = _execution(status=SystemJobExecutionStatus.RUNNING)
    session = ClaimSession(execution)
    repository = AdminJobsRepository(session)

    terminal = await repository.mark_terminal(
        execution.id,
        status=SystemJobExecutionStatus.FAILED,
        completed_at=NOW,
        duration_ms=1_250,
        result={"processed": 3},
        error_message="Upstream failed.",
        error_metadata={"type": "UpstreamError", "recoverable": True},
    )

    assert terminal is execution
    assert execution.completed_at == NOW
    assert execution.duration_ms == 1_250
    assert execution.metadata_json["result"] == {"processed": 3}
    assert execution.metadata_json["error"]["recoverable"] is True


class ScalarCollection:
    def __init__(self, values: list[SystemJobExecution]) -> None:
        self.values = values

    def all(self) -> list[SystemJobExecution]:
        return self.values


class RecoverySession:
    def __init__(self, executions: list[SystemJobExecution]) -> None:
        self.executions = executions
        self.flush_count = 0

    async def scalars(self, _statement):
        return ScalarCollection(self.executions)

    async def scalar(self, _statement):
        return None

    async def flush(self) -> None:
        self.flush_count += 1


@pytest.mark.asyncio
async def test_startup_recovery_fails_abandoned_running_rows_as_recoverable() -> None:
    execution = _execution(status=SystemJobExecutionStatus.RUNNING)
    execution.started_at = NOW - timedelta(minutes=3)
    session = RecoverySession([execution])
    repository = AdminJobsRepository(session)

    count = await repository.recover_abandoned_running(
        recovered_at=NOW,
        reason="Scheduler restarted.",
    )

    assert count == 1
    assert execution.status == SystemJobExecutionStatus.FAILED
    assert execution.completed_at == NOW
    assert execution.duration_ms == 180_000
    assert execution.metadata_json["error"]["recoverable"] is True


class CleanupSession:
    def __init__(self) -> None:
        self.statement = None

    async def execute(self, statement):
        self.statement = statement
        return SimpleNamespace(rowcount=4)


@pytest.mark.asyncio
async def test_cleanup_deletes_only_terminal_history_older_than_90_days() -> None:
    session = CleanupSession()
    repository = AdminJobsRepository(session)
    cutoff = NOW - timedelta(days=90)

    deleted = await repository.delete_terminal_history_before(cutoff)

    assert deleted == 4
    sql = str(
        session.statement.compile(dialect=postgresql.dialect())
    ).upper()
    assert "DELETE FROM SYSTEM_JOB_EXECUTIONS" in sql
    assert "COMPLETED_AT" in sql
    assert "STATUS IN" in sql


@pytest.mark.asyncio
async def test_scheduler_enqueues_market_and_due_stock_jobs_with_scheduler_source(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enqueue_mock = AsyncMock(return_value=(uuid4(), False))
    monkeypatch.setattr(
        "app.jobs.market_data_scheduler.enqueue_system_job",
        enqueue_mock,
    )
    settings = Settings(
        _env_file=None,
        stock_details_sync_batch_size=50,
    )

    await enqueue_scheduled_market_snapshot(NOW, settings=settings)
    await enqueue_scheduled_daily_market_sync(NOW, settings=settings)
    await enqueue_scheduled_stock_details_sync(settings=settings)

    assert [call.kwargs["trigger_source"] for call in enqueue_mock.await_args_list] == [
        SystemJobTriggerSource.SCHEDULER,
        SystemJobTriggerSource.SCHEDULER,
        SystemJobTriggerSource.SCHEDULER,
    ]
    stock_call = enqueue_mock.await_args_list[2]
    assert stock_call.kwargs["metadata"] == {
        "exchange": "DSE",
        "scope": StockDetailsSyncScope.FULL.value,
        "limit": 50,
        "offset": 0,
        "force": False,
    }


@pytest.mark.asyncio
async def test_scheduled_stock_details_runner_uses_due_cadence_and_batch_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result = SimpleNamespace(
        model_dump=lambda **_: {
            "selected_count": 50,
            "synced_count": 50,
            "partial_count": 0,
            "failed_count": 0,
        }
    )
    ingest_mock = AsyncMock(return_value=result)
    monkeypatch.setattr(
        "app.modules.admin_jobs.admin_jobs_runner.ingest_stock_details",
        ingest_mock,
    )
    execution = _execution(
        job_type=SystemJobType.STOCK_DETAILS_SYNC,
        trigger_source=SystemJobTriggerSource.SCHEDULER,
        metadata={
            "exchange": "DSE",
            "scope": "full",
            "limit": 50,
            "offset": 0,
            "force": False,
        },
    )

    outcome = await run_system_job(
        execution,
        settings=Settings(_env_file=None),
    )

    assert outcome.status == SystemJobExecutionStatus.SUCCEEDED
    assert ingest_mock.await_args.kwargs["limit"] == 50
    assert (
        ingest_mock.await_args.kwargs["trigger_type"]
        == StockDetailsSyncTriggerType.SCHEDULED
    )
    assert (
        ingest_mock.await_args.kwargs["scope"]
        == StockDetailsSyncScope.FULL
    )
