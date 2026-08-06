from __future__ import annotations

from datetime import date, datetime, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from app.core.core_config import Settings
from app.core.enums import (
    EmailCampaignStatus,
    ExchangeCode,
    MarketDataState,
    StockDetailsSyncJobStatus,
    SystemJobExecutionStatus,
)
from app.modules.admin_dashboard.admin_dashboard_schemas import (
    AdminDataHealthState,
    AdminSchedulerLivenessState,
)
from app.modules.admin_dashboard.admin_dashboard_service import AdminDashboardService

NOW = datetime(2026, 8, 6, 10, 30, tzinfo=ZoneInfo("Asia/Dhaka"))
TRADE_DATE = date(2026, 8, 6)


class FakeAdminDashboardRepository:
    def __init__(self, heartbeat_at: datetime | None = None) -> None:
        self.suspicious_trade_dates: list[date] = []
        self.no_trade_dates: list[date] = []
        self.missing_trade_dates: list[date | None] = []
        self.heartbeat = (
            SimpleNamespace(heartbeat_at=heartbeat_at)
            if heartbeat_at is not None
            else None
        )

    async def count_users(self, **kwargs) -> int:
        if kwargs.get("is_active") is True:
            return 2
        if kwargs.get("role") is not None:
            return 0
        return 2

    async def count_deleted_users(self) -> int:
        return 0

    async def count_jobs_by_status(self, status: SystemJobExecutionStatus) -> int:
        assert status == SystemJobExecutionStatus.FAILED
        return 0

    async def get_scheduler_heartbeat(self, component_name: str):
        assert component_name == "backend-scheduler"
        return self.heartbeat

    async def count_latest_session_suspicious_prices(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date,
    ) -> int:
        assert exchange == ExchangeCode.DSE
        self.suspicious_trade_dates.append(trade_date)
        return 2

    async def count_latest_session_no_trade_prices(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date,
    ) -> int:
        assert exchange == ExchangeCode.DSE
        self.no_trade_dates.append(trade_date)
        return 4

    async def count_active_stocks_without_price(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date | None,
    ) -> int:
        assert exchange == ExchangeCode.DSE
        self.missing_trade_dates.append(trade_date)
        return 7

    async def list_recent_jobs(self, *, limit: int) -> list[object]:
        assert limit == 10
        return []

    async def count_campaigns_by_status(self, status: EmailCampaignStatus) -> int:
        return 0

    async def get_last_sent_campaign_at(self) -> datetime | None:
        return None


class FakeMarketDataRepository:
    def __init__(self) -> None:
        self.generation = SimpleNamespace(
            trade_date=TRADE_DATE,
            sync_id="live-20260806-1030",
            state=MarketDataState.LIVE,
            source="AMARSTOCK_MARKET_MSGPACK",
            source_last_synced_at=NOW - timedelta(minutes=5),
            published_at=NOW - timedelta(minutes=4),
            fetched_count=400,
            accepted_count=390,
            suspicious_count=2,
        )
        self.summary = SimpleNamespace(
            trade_date=TRADE_DATE,
            source="AMARSTOCK_INDEX_API",
            updated_at=NOW - timedelta(minutes=4),
            is_finalized=True,
        )

    async def get_latest_market_data_generation(self, **kwargs):
        assert kwargs == {
            "exchange": ExchangeCode.DSE,
            "state": MarketDataState.LIVE,
        }
        return self.generation

    async def get_latest_finalized_market_summary(self, **kwargs):
        assert kwargs == {"exchange": ExchangeCode.DSE}
        return self.summary


class FakeStockDetailsRepository:
    def __init__(self) -> None:
        self.latest = SimpleNamespace(
            status=StockDetailsSyncJobStatus.PARTIAL,
            source="AMARSTOCK_API",
            completed_at=NOW - timedelta(days=2),
        )

    async def get_latest_completed_sync_job(self, **kwargs):
        assert kwargs == {"exchange": ExchangeCode.DSE}
        return self.latest

    async def count_due_stocks(self, **kwargs) -> int:
        assert kwargs["exchange"] == ExchangeCode.DSE
        return 12

    async def count_sync_jobs_by_statuses(self, statuses, **kwargs) -> int:
        assert kwargs == {"exchange": ExchangeCode.DSE}
        if StockDetailsSyncJobStatus.FAILED in statuses:
            return 3
        return 280


def build_service(
    *,
    heartbeat_at: datetime | None = None,
) -> tuple[
    AdminDashboardService,
    FakeAdminDashboardRepository,
]:
    repository = FakeAdminDashboardRepository(heartbeat_at)
    service = AdminDashboardService(
        repository=repository,
        market_data_repository=FakeMarketDataRepository(),
        stock_details_repository=FakeStockDetailsRepository(),
        settings=Settings(_env_file=None),
        now=lambda: NOW,
    )
    return service, repository


@pytest.mark.asyncio
async def test_fresh_market_generation_is_current_without_system_job_rows() -> None:
    service, _ = build_service()

    overview = await service.get_overview()

    assert overview.recent_job_executions == []
    assert overview.data_health.market_snapshot_health.state == AdminDataHealthState.CURRENT
    assert overview.data_health.market_data_health.state == AdminDataHealthState.CURRENT
    assert overview.data_health.latest_market_generation is not None
    assert overview.data_health.latest_market_generation.accepted_count == 390


@pytest.mark.asyncio
async def test_missing_prices_uses_active_missing_count_not_partial_history() -> None:
    service, _ = build_service()

    health = (await service.get_overview()).data_health

    assert health.active_stocks_without_latest_price == 7
    assert health.expected_no_trade_count == 4
    assert not hasattr(health, "partial_prices_count")


@pytest.mark.asyncio
async def test_price_quality_counts_are_scoped_to_latest_generation_session() -> None:
    service, repository = build_service()

    health = (await service.get_overview()).data_health

    assert health.suspicious_prices_count == 2
    assert health.expected_no_trade_count == 4
    assert repository.suspicious_trade_dates == [TRADE_DATE]
    assert repository.no_trade_dates == [TRADE_DATE]
    assert repository.missing_trade_dates == [TRADE_DATE]


@pytest.mark.asyncio
async def test_stock_details_health_comes_from_stock_details_sync_jobs() -> None:
    service, _ = build_service()

    stock_details = (await service.get_overview()).data_health.stock_details

    assert stock_details.latest_status == StockDetailsSyncJobStatus.PARTIAL
    assert stock_details.latest_source == "AMARSTOCK_API"
    assert stock_details.due_count == 12
    assert stock_details.completed_count == 280
    assert stock_details.failed_count == 3
    assert stock_details.health.state == AdminDataHealthState.DELAYED


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("heartbeat_at", "expected_state"),
    [
        (NOW - timedelta(seconds=120), AdminSchedulerLivenessState.ONLINE),
        (NOW - timedelta(seconds=121), AdminSchedulerLivenessState.OFFLINE),
        (None, AdminSchedulerLivenessState.UNKNOWN),
    ],
)
async def test_scheduler_liveness_uses_persisted_two_minute_heartbeat(
    heartbeat_at: datetime | None,
    expected_state: AdminSchedulerLivenessState,
) -> None:
    service, _ = build_service(heartbeat_at=heartbeat_at)

    scheduler = (await service.get_overview()).scheduler

    assert scheduler.liveness.state == expected_state
    assert scheduler.configuration.queue_poll_seconds == 10


def test_admin_dashboard_does_not_own_market_publication_or_cache_rebuild() -> None:
    import inspect

    from app.modules.admin_dashboard import admin_dashboard_service

    source = inspect.getsource(admin_dashboard_service)
    assert "sync_market_snapshot" not in source
    assert "create_market_data_generation" not in source
    assert "rebuild_market_read_cache" not in source
    assert "spawn_rebuild_market_read_cache" not in source
