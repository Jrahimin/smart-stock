from datetime import date, datetime
from typing import Annotated

from fastapi import Depends
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_repository import BaseRepository
from app.core.database_session import get_db_session
from app.core.enums import (
    DataQualityFlag,
    EmailCampaignStatus,
    ExchangeCode,
    SystemJobExecutionStatus,
    UserRole,
)
from app.models import (
    DailyPrice,
    EmailCampaign,
    SchedulerHeartbeat,
    Stock,
    SystemJobExecution,
    User,
)


class AdminDashboardRepository(BaseRepository[SystemJobExecution]):
    model = SystemJobExecution

    async def count_deleted_users(self) -> int:
        statement = select(func.count()).select_from(User).where(User.deleted_at.is_not(None))
        return int(await self.session.scalar(statement) or 0)

    async def count_users(
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

    async def count_jobs_by_status(self, status: SystemJobExecutionStatus) -> int:
        statement = select(func.count()).select_from(SystemJobExecution).where(
            SystemJobExecution.status == status
        )
        return int(await self.session.scalar(statement) or 0)

    async def get_scheduler_heartbeat(
        self,
        component_name: str,
    ) -> SchedulerHeartbeat | None:
        statement = select(SchedulerHeartbeat).where(
            SchedulerHeartbeat.component_name == component_name
        )
        return await self.session.scalar(statement)

    async def count_latest_session_suspicious_prices(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date,
    ) -> int:
        statement = (
            select(func.count())
            .select_from(DailyPrice)
            .join(Stock, Stock.id == DailyPrice.stock_id)
            .where(
                Stock.exchange == exchange,
                Stock.is_active.is_(True),
                DailyPrice.trade_date == trade_date,
                DailyPrice.data_quality_flag == DataQualityFlag.SUSPICIOUS,
            )
        )
        return int(await self.session.scalar(statement) or 0)

    async def count_latest_session_no_trade_prices(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date,
    ) -> int:
        statement = (
            select(func.count())
            .select_from(DailyPrice)
            .join(Stock, Stock.id == DailyPrice.stock_id)
            .where(
                Stock.exchange == exchange,
                Stock.is_active.is_(True),
                DailyPrice.trade_date == trade_date,
                or_(
                    DailyPrice.open_price == 0,
                    DailyPrice.high_price == 0,
                    DailyPrice.low_price == 0,
                    DailyPrice.close_price == 0,
                ),
            )
        )
        return int(await self.session.scalar(statement) or 0)

    async def count_active_stocks_without_price(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date | None,
    ) -> int:
        statement = (
            select(func.count())
            .select_from(Stock)
            .where(Stock.exchange == exchange, Stock.is_active.is_(True))
        )
        if trade_date is not None:
            priced_stock_ids = select(DailyPrice.stock_id).where(
                DailyPrice.trade_date == trade_date
            )
            statement = statement.where(Stock.id.not_in(priced_stock_ids))
        return int(await self.session.scalar(statement) or 0)

    async def list_recent_jobs(self, *, limit: int) -> list[SystemJobExecution]:
        statement = (
            select(SystemJobExecution)
            .order_by(
                SystemJobExecution.started_at.desc().nullslast(),
                SystemJobExecution.created_at.desc(),
                SystemJobExecution.id.desc(),
            )
            .limit(limit)
        )
        result = await self.session.scalars(statement)
        return list(result.all())

    async def count_campaigns_by_status(self, status: EmailCampaignStatus) -> int:
        statement = select(func.count()).select_from(EmailCampaign).where(
            EmailCampaign.status == status
        )
        return int(await self.session.scalar(statement) or 0)

    async def get_last_sent_campaign_at(self) -> datetime | None:
        statement = select(func.max(EmailCampaign.completed_at)).where(
            EmailCampaign.status.in_(
                [EmailCampaignStatus.SUCCEEDED, EmailCampaignStatus.PARTIAL]
            )
        )
        return await self.session.scalar(statement)


def get_admin_dashboard_repository(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminDashboardRepository:
    return AdminDashboardRepository(session)
