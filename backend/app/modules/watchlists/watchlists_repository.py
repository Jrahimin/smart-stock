from datetime import date
from uuid import UUID

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_repository import BaseRepository
from app.core.database_session import get_db_session
from app.models import DailyPrice, Stock, UserWatchlist


class WatchlistsRepository(BaseRepository[UserWatchlist]):
    model = UserWatchlist

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_by_user_and_stock(self, *, user_id: UUID, stock_id: UUID) -> UserWatchlist | None:
        statement = select(UserWatchlist).where(
            UserWatchlist.user_id == user_id,
            UserWatchlist.stock_id == stock_id,
        )
        return await self.session.scalar(statement)

    async def list_for_user(
        self,
        *,
        user_id: UUID,
        holding_only: bool,
        limit: int,
        offset: int,
    ) -> list[UserWatchlist]:
        statement = select(UserWatchlist).where(UserWatchlist.user_id == user_id)
        if holding_only:
            statement = statement.where(UserWatchlist.is_holding.is_(True))
        statement = (
            statement.order_by(
                UserWatchlist.is_holding.desc(),
                UserWatchlist.created_at.desc(),
                UserWatchlist.id.desc(),
            )
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.scalars(statement)
        return list(result.all())

    async def count_for_user(self, *, user_id: UUID) -> tuple[int, int]:
        total_statement = (
            select(func.count()).select_from(UserWatchlist).where(UserWatchlist.user_id == user_id)
        )
        holdings_statement = (
            select(func.count())
            .select_from(UserWatchlist)
            .where(UserWatchlist.user_id == user_id, UserWatchlist.is_holding.is_(True))
        )
        total = int(await self.session.scalar(total_statement) or 0)
        holdings = int(await self.session.scalar(holdings_statement) or 0)
        return total, holdings

    async def delete_by_user_and_stock(self, *, user_id: UUID, stock_id: UUID) -> bool:
        entry = await self.get_by_user_and_stock(user_id=user_id, stock_id=stock_id)
        if entry is None:
            return False
        await self.delete(entry)
        return True

    async def list_latest_prices_for_stocks(
        self,
        stock_ids: list[UUID],
        *,
        end_date: date | None = None,
    ) -> dict[UUID, DailyPrice]:
        if not stock_ids:
            return {}

        latest_price_dates_statement = (
            select(
                DailyPrice.stock_id.label("stock_id"),
                func.max(DailyPrice.trade_date).label("latest_trade_date"),
            )
            .where(DailyPrice.stock_id.in_(stock_ids))
            .group_by(DailyPrice.stock_id)
        )
        if end_date is not None:
            latest_price_dates_statement = latest_price_dates_statement.where(
                DailyPrice.trade_date <= end_date
            )
        latest_price_dates = latest_price_dates_statement.subquery()
        statement = select(DailyPrice).join(
            latest_price_dates,
            (DailyPrice.stock_id == latest_price_dates.c.stock_id)
            & (DailyPrice.trade_date == latest_price_dates.c.latest_trade_date),
        )
        result = await self.session.scalars(statement)
        prices = list(result.all())
        return {price.stock_id: price for price in prices}

    async def get_stock(self, stock_id: UUID) -> Stock | None:
        return await self.session.get(Stock, stock_id)


def get_watchlists_repository(
    session: AsyncSession = Depends(get_db_session),
) -> WatchlistsRepository:
    return WatchlistsRepository(session)
