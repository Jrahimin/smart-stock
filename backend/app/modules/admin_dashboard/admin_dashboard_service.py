from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import Depends

from app.core.core_config import Settings, get_settings
from app.core.enums import (
    EmailCampaignStatus,
    ExchangeCode,
    MarketDataState,
    MarketSessionStatus,
    StockDetailsSyncJobStatus,
    SystemJobExecutionStatus,
    UserRole,
)
from app.jobs.market_session_schedule import (
    next_daily_sync_at,
    next_snapshot_sync_at,
    next_stock_details_sync_at,
    resolve_market_status,
)
from app.jobs.system_job_queue import (
    SCHEDULER_COMPONENT_NAME,
    SCHEDULER_HEARTBEAT_FRESH_SECONDS,
)
from app.models import DailyMarketSummary, MarketDataGeneration, StockDetailsSyncJob
from app.modules.admin_dashboard.admin_dashboard_repository import (
    AdminDashboardRepository,
    get_admin_dashboard_repository,
)
from app.modules.admin_dashboard.admin_dashboard_schemas import (
    AdminDashboardOverviewRead,
    AdminDataHealthRead,
    AdminDataHealthState,
    AdminEmailCampaignHealthRead,
    AdminMarketGenerationRead,
    AdminMarketSessionRead,
    AdminMeasuredHealthRead,
    AdminSchedulerConfigurationRead,
    AdminSchedulerLivenessRead,
    AdminSchedulerLivenessState,
    AdminSchedulerNextRunsRead,
    AdminSchedulerStatusRead,
    AdminStockDetailsHealthRead,
    AdminUserSummaryRead,
)
from app.modules.admin_jobs.admin_jobs_schemas import SystemJobExecutionRead
from app.modules.market_data.market_data_repository import (
    MarketDataRepository,
    get_market_data_repository,
)
from app.modules.stock_details.stock_details_repository import (
    StockDetailsRepository,
    get_stock_details_repository,
)

DHAKA_TIMEZONE = ZoneInfo("Asia/Dhaka")
_HEALTH_SEVERITY = {
    AdminDataHealthState.CURRENT: 0,
    AdminDataHealthState.DELAYED: 1,
    AdminDataHealthState.STALE: 2,
    AdminDataHealthState.MISSING: 3,
}


def _as_aware(value: datetime, fallback_timezone=UTC) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=fallback_timezone)


def _sync_cutoff(now: datetime, frequency_months: int) -> datetime:
    month = now.month - frequency_months
    year = now.year
    while month <= 0:
        month += 12
        year -= 1
    return now.replace(year=year, month=month, day=min(now.day, 28))


class AdminDashboardService:
    def __init__(
        self,
        repository: AdminDashboardRepository,
        market_data_repository: MarketDataRepository,
        stock_details_repository: StockDetailsRepository,
        settings: Settings,
        *,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self.repository = repository
        self.market_data_repository = market_data_repository
        self.stock_details_repository = stock_details_repository
        self.settings = settings
        self._now = now or (lambda: datetime.now(DHAKA_TIMEZONE))

    async def get_overview(self) -> AdminDashboardOverviewRead:
        users = await self._build_user_summary()
        scheduler = await self._build_scheduler_status()
        data_health = await self._build_data_health()
        email_campaign_health = await self._build_email_campaign_health()
        recent_jobs = await self.repository.list_recent_jobs(limit=10)
        return AdminDashboardOverviewRead(
            users=users,
            scheduler=scheduler,
            data_health=data_health,
            email_campaign_health=email_campaign_health,
            recent_job_executions=[
                SystemJobExecutionRead.model_validate(item) for item in recent_jobs
            ],
        )

    async def _build_scheduler_status(self) -> AdminSchedulerStatusRead:
        now = self._now()
        if now.tzinfo is None:
            now = now.replace(tzinfo=DHAKA_TIMEZONE)
        else:
            now = now.astimezone(DHAKA_TIMEZONE)
        heartbeat = await self.repository.get_scheduler_heartbeat(
            SCHEDULER_COMPONENT_NAME
        )
        if heartbeat is None:
            liveness = AdminSchedulerLivenessRead(
                component_name=SCHEDULER_COMPONENT_NAME,
                state=AdminSchedulerLivenessState.UNKNOWN,
                reason="No persisted scheduler heartbeat has been recorded.",
                last_heartbeat_at=None,
                heartbeat_age_seconds=None,
            )
        else:
            heartbeat_at = _as_aware(heartbeat.heartbeat_at).astimezone(
                DHAKA_TIMEZONE
            )
            age_seconds = max(0, int((now - heartbeat_at).total_seconds()))
            is_online = age_seconds <= SCHEDULER_HEARTBEAT_FRESH_SECONDS
            liveness = AdminSchedulerLivenessRead(
                component_name=SCHEDULER_COMPONENT_NAME,
                state=(
                    AdminSchedulerLivenessState.ONLINE
                    if is_online
                    else AdminSchedulerLivenessState.OFFLINE
                ),
                reason=(
                    "The persisted heartbeat is within the two-minute liveness window."
                    if is_online
                    else "The persisted heartbeat is older than the two-minute liveness window."
                ),
                last_heartbeat_at=heartbeat_at,
                heartbeat_age_seconds=age_seconds,
            )

        return AdminSchedulerStatusRead(
            liveness=liveness,
            configuration=AdminSchedulerConfigurationRead(
                market_snapshot_scheduler_enabled=(
                    self.settings.market_snapshot_scheduler_enabled
                ),
                daily_market_sync_scheduler_enabled=(
                    self.settings.daily_market_sync_scheduler_enabled
                ),
                stock_details_sync_scheduler_enabled=(
                    self.settings.stock_details_sync_scheduler_enabled
                ),
                queue_poll_seconds=self.settings.system_job_queue_poll_seconds,
                stock_details_sync_time=self.settings.stock_details_sync_time,
                stock_details_sync_batch_size=(
                    self.settings.stock_details_sync_batch_size
                ),
            ),
            next_runs=AdminSchedulerNextRunsRead(
                market_snapshot_at=(
                    next_snapshot_sync_at(now, self.settings)
                    if self.settings.market_snapshot_scheduler_enabled
                    else None
                ),
                daily_market_sync_at=(
                    next_daily_sync_at(now, self.settings)
                    if self.settings.daily_market_sync_scheduler_enabled
                    else None
                ),
                stock_details_sync_at=(
                    next_stock_details_sync_at(now, self.settings)
                    if self.settings.stock_details_sync_scheduler_enabled
                    else None
                ),
            ),
        )

    async def _build_user_summary(self) -> AdminUserSummaryRead:
        total_users = await self.repository.count_users(include_deleted=False)
        deleted_users = await self.repository.count_deleted_users()
        active_users = await self.repository.count_users(
            include_deleted=False,
            is_active=True,
        )
        admin_users = await self.repository.count_users(
            include_deleted=False,
            role=UserRole.ADMIN,
        )
        super_admin_users = await self.repository.count_users(
            include_deleted=False,
            role=UserRole.SUPER_ADMIN,
        )
        return AdminUserSummaryRead(
            total_users=total_users,
            active_users=active_users,
            inactive_users=total_users - active_users,
            deleted_users=deleted_users,
            admin_users=admin_users,
            super_admin_users=super_admin_users,
        )

    async def _build_data_health(self) -> AdminDataHealthRead:
        now = self._now()
        if now.tzinfo is None:
            now = now.replace(tzinfo=DHAKA_TIMEZONE)
        else:
            now = now.astimezone(DHAKA_TIMEZONE)

        generation = await self.market_data_repository.get_latest_market_data_generation(
            exchange=ExchangeCode.DSE,
            state=MarketDataState.LIVE,
        )
        market_session = (
            await self.market_data_repository.get_latest_finalized_market_summary(
                exchange=ExchangeCode.DSE
            )
        )
        market_status = resolve_market_status(now, self.settings)
        snapshot_health = self._measure_snapshot_health(
            generation=generation,
            market_session=market_session,
            market_status=market_status,
            now=now,
        )
        session_health = self._measure_session_health(
            generation=generation,
            market_session=market_session,
            now=now,
        )
        market_data_health = self._combine_market_health(snapshot_health, session_health)
        stock_details = await self._build_stock_details_health(now)

        latest_trade_date = generation.trade_date if generation is not None else None
        suspicious_prices_count = 0
        expected_no_trade_count = 0
        if latest_trade_date is not None:
            suspicious_prices_count = (
                await self.repository.count_latest_session_suspicious_prices(
                    exchange=ExchangeCode.DSE,
                    trade_date=latest_trade_date,
                )
            )
            expected_no_trade_count = (
                await self.repository.count_latest_session_no_trade_prices(
                    exchange=ExchangeCode.DSE,
                    trade_date=latest_trade_date,
                )
            )

        return AdminDataHealthRead(
            market_data_health=market_data_health,
            market_snapshot_health=snapshot_health,
            market_session_health=session_health,
            latest_market_generation=(
                AdminMarketGenerationRead.model_validate(generation, from_attributes=True)
                if generation is not None
                else None
            ),
            latest_market_session=(
                AdminMarketSessionRead.model_validate(market_session, from_attributes=True)
                if market_session is not None
                else None
            ),
            stock_details=stock_details,
            failed_jobs_count=await self.repository.count_jobs_by_status(
                SystemJobExecutionStatus.FAILED
            ),
            suspicious_prices_count=suspicious_prices_count,
            expected_no_trade_count=expected_no_trade_count,
            active_stocks_without_latest_price=(
                await self.repository.count_active_stocks_without_price(
                    exchange=ExchangeCode.DSE,
                    trade_date=latest_trade_date,
                )
            ),
            latest_price_trade_date=latest_trade_date,
        )

    async def _build_stock_details_health(
        self,
        now: datetime,
    ) -> AdminStockDetailsHealthRead:
        now_utc = now.astimezone(UTC)
        cutoff = _sync_cutoff(
            now_utc,
            self.settings.stock_details_sync_frequency_months,
        )
        latest = await self.stock_details_repository.get_latest_completed_sync_job(
            exchange=ExchangeCode.DSE
        )
        due_count = await self.stock_details_repository.count_due_stocks(
            exchange=ExchangeCode.DSE,
            cutoff=cutoff,
        )
        completed_count = await self.stock_details_repository.count_sync_jobs_by_statuses(
            [StockDetailsSyncJobStatus.SUCCEEDED, StockDetailsSyncJobStatus.PARTIAL],
            exchange=ExchangeCode.DSE,
        )
        failed_count = await self.stock_details_repository.count_sync_jobs_by_statuses(
            [StockDetailsSyncJobStatus.FAILED],
            exchange=ExchangeCode.DSE,
        )
        health = self._measure_stock_details_health(
            latest=latest,
            due_count=due_count,
            cutoff=cutoff,
        )
        return AdminStockDetailsHealthRead(
            health=health,
            latest_status=latest.status if latest is not None else None,
            latest_source=latest.source if latest is not None else None,
            due_count=due_count,
            completed_count=completed_count,
            failed_count=failed_count,
        )

    def _measure_snapshot_health(
        self,
        *,
        generation: MarketDataGeneration | None,
        market_session: DailyMarketSummary | None,
        market_status: MarketSessionStatus,
        now: datetime,
    ) -> AdminMeasuredHealthRead:
        if generation is None:
            return AdminMeasuredHealthRead(
                state=AdminDataHealthState.MISSING,
                reason="No published LIVE market generation exists.",
                last_successful_at=None,
            )

        synced_at = _as_aware(generation.source_last_synced_at, now.tzinfo)
        if market_status == MarketSessionStatus.OPEN:
            if generation.trade_date != now.date():
                return AdminMeasuredHealthRead(
                    state=AdminDataHealthState.STALE,
                    reason="The newest LIVE generation is not for the open market session.",
                    last_successful_at=synced_at,
                )
            age_seconds = max(0, (now - synced_at.astimezone(now.tzinfo)).total_seconds())
            interval_seconds = self.settings.market_sync_interval_seconds
            if age_seconds <= interval_seconds * 2:
                state = AdminDataHealthState.CURRENT
                reason = "The latest LIVE generation is within two snapshot intervals."
            elif age_seconds <= interval_seconds * 4:
                state = AdminDataHealthState.DELAYED
                reason = "The latest LIVE generation is more than two snapshot intervals old."
            else:
                state = AdminDataHealthState.STALE
                reason = "The latest LIVE generation is more than four snapshot intervals old."
            return AdminMeasuredHealthRead(
                state=state,
                reason=reason,
                last_successful_at=synced_at,
            )

        if market_status == MarketSessionStatus.POST_CLOSE:
            is_current = generation.trade_date == now.date()
        else:
            is_current = (
                market_session is not None
                and generation.trade_date >= market_session.trade_date
            )
        return AdminMeasuredHealthRead(
            state=(
                AdminDataHealthState.CURRENT if is_current else AdminDataHealthState.STALE
            ),
            reason=(
                "The newest LIVE generation covers the latest known market session."
                if is_current
                else "The newest LIVE generation predates the latest expected market session."
            ),
            last_successful_at=synced_at,
        )

    def _measure_session_health(
        self,
        *,
        generation: MarketDataGeneration | None,
        market_session: DailyMarketSummary | None,
        now: datetime,
    ) -> AdminMeasuredHealthRead:
        if market_session is None:
            return AdminMeasuredHealthRead(
                state=AdminDataHealthState.MISSING,
                reason="No finalized DSEX market session exists.",
                last_successful_at=None,
            )

        updated_at = _as_aware(market_session.updated_at, now.tzinfo)
        if generation is not None:
            session_gap_days = (generation.trade_date - market_session.trade_date).days
            if session_gap_days <= 0:
                state = AdminDataHealthState.CURRENT
                reason = "The latest DSEX session is finalized for the published market date."
            elif session_gap_days <= 4:
                state = AdminDataHealthState.DELAYED
                reason = (
                    "The published market session is newer than the latest finalized "
                    "DSEX session."
                )
            else:
                state = AdminDataHealthState.STALE
                reason = "The finalized DSEX session is multiple market dates behind."
        else:
            age_days = max(0, (now.date() - market_session.trade_date).days)
            if age_days <= 4:
                state = AdminDataHealthState.CURRENT
                reason = (
                    "The finalized DSEX session is recent, but no LIVE generation is "
                    "published."
                )
            elif age_days <= 7:
                state = AdminDataHealthState.DELAYED
                reason = "The latest finalized DSEX session is more than four days old."
            else:
                state = AdminDataHealthState.STALE
                reason = "The latest finalized DSEX session is more than seven days old."
        return AdminMeasuredHealthRead(
            state=state,
            reason=reason,
            last_successful_at=updated_at,
        )

    def _measure_stock_details_health(
        self,
        *,
        latest: StockDetailsSyncJob | None,
        due_count: int,
        cutoff: datetime,
    ) -> AdminMeasuredHealthRead:
        if latest is None or latest.completed_at is None:
            return AdminMeasuredHealthRead(
                state=AdminDataHealthState.MISSING,
                reason="No successful or partial stock-details sync exists.",
                last_successful_at=None,
            )

        completed_at = _as_aware(latest.completed_at)
        if completed_at < cutoff:
            state = AdminDataHealthState.STALE
            reason = "The newest completed stock-details sync is older than the configured cadence."
        elif due_count > 0:
            state = AdminDataHealthState.DELAYED
            reason = f"{due_count} eligible stocks are due for stock-details sync."
        else:
            state = AdminDataHealthState.CURRENT
            reason = "No eligible stocks are currently due for stock-details sync."
        return AdminMeasuredHealthRead(
            state=state,
            reason=reason,
            last_successful_at=completed_at,
        )

    def _combine_market_health(
        self,
        snapshot: AdminMeasuredHealthRead,
        session: AdminMeasuredHealthRead,
    ) -> AdminMeasuredHealthRead:
        worst = max(
            (snapshot, session),
            key=lambda item: _HEALTH_SEVERITY[item.state],
        )
        return AdminMeasuredHealthRead(
            state=worst.state,
            reason=(
                f"Snapshot: {snapshot.reason} "
                f"Finalized DSEX: {session.reason}"
            ),
            last_successful_at=worst.last_successful_at,
        )

    async def _build_email_campaign_health(self) -> AdminEmailCampaignHealthRead:
        return AdminEmailCampaignHealthRead(
            queued_count=await self.repository.count_campaigns_by_status(
                EmailCampaignStatus.QUEUED
            ),
            running_count=await self.repository.count_campaigns_by_status(
                EmailCampaignStatus.RUNNING
            ),
            failed_count=await self.repository.count_campaigns_by_status(
                EmailCampaignStatus.FAILED
            ),
            last_sent_at=await self.repository.get_last_sent_campaign_at(),
        )


def get_admin_dashboard_service(
    repository: Annotated[
        AdminDashboardRepository,
        Depends(get_admin_dashboard_repository),
    ],
    market_data_repository: Annotated[
        MarketDataRepository,
        Depends(get_market_data_repository),
    ],
    stock_details_repository: Annotated[
        StockDetailsRepository,
        Depends(get_stock_details_repository),
    ],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AdminDashboardService:
    return AdminDashboardService(
        repository=repository,
        market_data_repository=market_data_repository,
        stock_details_repository=stock_details_repository,
        settings=settings,
    )
