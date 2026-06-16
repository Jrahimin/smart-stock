from datetime import datetime

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.core_config import Settings, get_settings
from app.core.database_session import get_db_session
from app.core.enums import (
    DataQualityFlag,
    EmailCampaignStatus,
    ExchangeCode,
    SystemJobExecutionStatus,
    SystemJobType,
    UserRole,
)
from app.models import DailyPrice, EmailCampaign, Stock, SystemJobExecution, User
from app.modules.admin_dashboard.admin_dashboard_schemas import (
    AdminDashboardOverviewRead,
    AdminDataHealthRead,
    AdminEmailCampaignHealthRead,
    AdminSchedulerStatusRead,
    AdminUserSummaryRead,
)
from app.modules.admin_jobs.admin_jobs_schemas import SystemJobExecutionRead
from app.modules.market_data.market_data_repository import MarketDataRepository


class AdminDashboardService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.settings = settings
        self.market_data_repository = MarketDataRepository(session)

    async def get_overview(self) -> AdminDashboardOverviewRead:
        users = await self._build_user_summary()
        scheduler = AdminSchedulerStatusRead(
            market_snapshot_scheduler_enabled=self.settings.market_snapshot_scheduler_enabled,
            daily_market_sync_scheduler_enabled=self.settings.daily_market_sync_scheduler_enabled,
        )
        data_health = await self._build_data_health()
        email_campaign_health = await self._build_email_campaign_health()
        recent_jobs = await self._list_recent_jobs()
        return AdminDashboardOverviewRead(
            users=users,
            scheduler=scheduler,
            data_health=data_health,
            email_campaign_health=email_campaign_health,
            recent_job_executions=recent_jobs,
        )

    async def _build_user_summary(self) -> AdminUserSummaryRead:
        total_users = await self._count_users(include_deleted=False)
        deleted_users = await self._count_deleted_users()
        active_users = await self._count_users(include_deleted=False, is_active=True)
        inactive_users = total_users - active_users
        admin_users = await self._count_users(include_deleted=False, role=UserRole.ADMIN)
        super_admin_users = await self._count_users(include_deleted=False, role=UserRole.SUPER_ADMIN)
        return AdminUserSummaryRead(
            total_users=total_users,
            active_users=active_users,
            inactive_users=inactive_users,
            deleted_users=deleted_users,
            admin_users=admin_users,
            super_admin_users=super_admin_users,
        )

    async def _count_deleted_users(self) -> int:
        statement = select(func.count()).select_from(User).where(User.deleted_at.is_not(None))
        return int(await self.session.scalar(statement) or 0)

    async def _count_users(
        self,
        *,
        include_deleted: bool,
        is_active: bool | None = None,
        role: UserRole | None = None,
    ) -> int:
        statement = select(func.count()).select_from(User)
        if not include_deleted:
            statement = statement.where(User.deleted_at.is_(None))
        if is_active is not None:
            statement = statement.where(User.is_active == is_active)
        if role is not None:
            statement = statement.where(User.role == role)
        return int(await self.session.scalar(statement) or 0)

    async def _build_data_health(self) -> AdminDataHealthRead:
        latest_market_sync = await self._latest_job_completed_at(SystemJobType.MARKET_SYNC)
        latest_market_snapshot = await self._latest_job_completed_at(SystemJobType.MARKET_SNAPSHOT)
        latest_stock_details_sync = await self._latest_job_completed_at(SystemJobType.STOCK_DETAILS_SYNC)
        failed_jobs_count = await self._count_jobs_by_status(SystemJobExecutionStatus.FAILED)
        suspicious_prices_count = await self._count_prices_by_quality(DataQualityFlag.SUSPICIOUS)
        partial_prices_count = await self._count_prices_by_quality(DataQualityFlag.PARTIAL)
        active_stocks_without_latest_price = await self._count_active_stocks_without_latest_price()
        _, last_synced_at = await self.market_data_repository.get_market_price_freshness(
            exchange=ExchangeCode.DSE
        )
        freshness_label = "Fresh" if last_synced_at else "No recent market data"
        return AdminDataHealthRead(
            latest_market_sync_at=latest_market_sync,
            latest_market_snapshot_at=latest_market_snapshot,
            latest_stock_details_sync_at=latest_stock_details_sync,
            failed_jobs_count=failed_jobs_count,
            suspicious_prices_count=suspicious_prices_count,
            partial_prices_count=partial_prices_count,
            active_stocks_without_latest_price=active_stocks_without_latest_price,
            overall_freshness_label=freshness_label,
        )

    async def _build_email_campaign_health(self) -> AdminEmailCampaignHealthRead:
        queued_count = await self._count_campaigns_by_status(EmailCampaignStatus.QUEUED)
        running_count = await self._count_campaigns_by_status(EmailCampaignStatus.RUNNING)
        failed_count = await self._count_campaigns_by_status(EmailCampaignStatus.FAILED)
        last_sent_stmt = (
            select(func.max(EmailCampaign.completed_at))
            .where(EmailCampaign.status.in_([EmailCampaignStatus.SUCCEEDED, EmailCampaignStatus.PARTIAL]))
        )
        last_sent_at = await self.session.scalar(last_sent_stmt)
        return AdminEmailCampaignHealthRead(
            queued_count=queued_count,
            running_count=running_count,
            failed_count=failed_count,
            last_sent_at=last_sent_at,
        )

    async def _latest_job_completed_at(self, job_type: SystemJobType) -> datetime | None:
        statement = (
            select(SystemJobExecution.completed_at)
            .where(
                SystemJobExecution.job_type == job_type,
                SystemJobExecution.completed_at.is_not(None),
            )
            .order_by(SystemJobExecution.completed_at.desc())
            .limit(1)
        )
        return await self.session.scalar(statement)

    async def _count_jobs_by_status(self, status: SystemJobExecutionStatus) -> int:
        statement = select(func.count()).select_from(SystemJobExecution).where(SystemJobExecution.status == status)
        return int(await self.session.scalar(statement) or 0)

    async def _count_prices_by_quality(self, quality: DataQualityFlag) -> int:
        statement = (
            select(func.count())
            .select_from(DailyPrice)
            .where(DailyPrice.data_quality_flag == quality)
        )
        return int(await self.session.scalar(statement) or 0)

    async def _count_active_stocks_without_latest_price(self) -> int:
        latest_trade_date = await self.session.scalar(select(func.max(DailyPrice.trade_date)))
        if latest_trade_date is None:
            return int(
                await self.session.scalar(
                    select(func.count()).select_from(Stock).where(Stock.is_active.is_(True))
                )
                or 0
            )
        priced_stock_ids_stmt = select(DailyPrice.stock_id).where(DailyPrice.trade_date == latest_trade_date)
        statement = (
            select(func.count())
            .select_from(Stock)
            .where(Stock.is_active.is_(True), Stock.id.not_in(priced_stock_ids_stmt))
        )
        return int(await self.session.scalar(statement) or 0)

    async def _list_recent_jobs(self) -> list[SystemJobExecutionRead]:
        statement = (
            select(SystemJobExecution)
            .order_by(SystemJobExecution.started_at.desc().nullslast(), SystemJobExecution.id.desc())
            .limit(10)
        )
        result = await self.session.scalars(statement)
        return [SystemJobExecutionRead.model_validate(item) for item in result.all()]

    async def _count_campaigns_by_status(self, status: EmailCampaignStatus) -> int:
        statement = select(func.count()).select_from(EmailCampaign).where(EmailCampaign.status == status)
        return int(await self.session.scalar(statement) or 0)


def get_admin_dashboard_service(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AdminDashboardService:
    return AdminDashboardService(session, settings)
