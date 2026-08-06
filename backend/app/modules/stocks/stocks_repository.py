from datetime import date
from uuid import UUID

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_repository import BaseRepository
from app.core.database_session import get_db_session
from app.core.enums import ExchangeCode
from app.core.pagination import ListQueryParams
from app.models import DailyPrice, Stock


class StocksRepository(BaseRepository[Stock]):
    model = Stock

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def list_stocks(
        self,
        *,
        exchange: ExchangeCode | None,
        params: ListQueryParams,
    ) -> list[Stock]:
        return await self.list_filtered(
            params=params,
            exact_filters={"exchange": exchange},
            search_columns=(Stock.symbol, Stock.name),
            order_by=(Stock.exchange, Stock.symbol, Stock.id),
        )

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
        return {price.stock_id: price for price in result.all()}

    async def get_by_exchange_symbol(self, *, exchange: ExchangeCode, symbol: str) -> Stock | None:
        statement = select(Stock).where(
            Stock.exchange == exchange,
            func.upper(Stock.symbol) == symbol.upper(),
        )
        return await self.session.scalar(statement)

    async def count_stocks(
        self,
        *,
        exchange: ExchangeCode | None,
        is_active: bool | None = True,
    ) -> int:
        statement = select(func.count()).select_from(Stock)
        if exchange is not None:
            statement = statement.where(Stock.exchange == exchange)
        if is_active is not None:
            statement = statement.where(Stock.is_active.is_(is_active))
        result = await self.session.scalar(statement)
        return int(result or 0)

    async def get_stocks_by_ids(self, stock_ids: list[UUID]) -> list[Stock]:
        if not stock_ids:
            return []
        statement = select(Stock).where(Stock.id.in_(stock_ids))
        result = await self.session.scalars(statement)
        return list(result.all())

    async def list_active_symbols(self, *, exchange: ExchangeCode | None = None) -> list[tuple[ExchangeCode, str]]:
        statement = (
            select(Stock.exchange, Stock.symbol)
            .where(Stock.is_active.is_(True))
            .order_by(Stock.exchange, Stock.symbol, Stock.id)
        )
        if exchange is not None:
            statement = statement.where(Stock.exchange == exchange)
        result = await self.session.execute(statement)
        return [(row[0], row[1]) for row in result.all()]


def get_stocks_repository(session: AsyncSession = Depends(get_db_session)) -> StocksRepository:
    return StocksRepository(session)

