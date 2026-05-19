from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import Depends
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_repository import BaseRepository
from app.core.database_session import get_db_session
from app.core.enums import DataQualityFlag, ExchangeCode
from app.models import DailyMarketSummary, DailyPrice, Stock


class MarketDataRepository(BaseRepository[DailyPrice]):
    model = DailyPrice

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def list_daily_prices(self, *, stock_id: UUID, limit: int, offset: int) -> list[DailyPrice]:
        return await self.list_daily_prices_filtered(
            stock_id=stock_id,
            start_date=None,
            end_date=None,
            data_quality_flag=None,
            source=None,
            limit=limit,
            offset=offset,
        )

    async def list_daily_prices_filtered(
        self,
        *,
        stock_id: UUID,
        start_date: date | None,
        end_date: date | None,
        data_quality_flag: DataQualityFlag | None,
        source: str | None,
        limit: int,
        offset: int,
    ) -> list[DailyPrice]:
        statement = (
            select(DailyPrice)
            .where(DailyPrice.stock_id == stock_id)
            .order_by(DailyPrice.trade_date.desc(), DailyPrice.id.desc())
        )
        if start_date is not None:
            statement = statement.where(DailyPrice.trade_date >= start_date)
        if end_date is not None:
            statement = statement.where(DailyPrice.trade_date <= end_date)
        if data_quality_flag is not None:
            statement = statement.where(DailyPrice.data_quality_flag == data_quality_flag)
        if source is not None:
            statement = statement.where(func.upper(DailyPrice.source) == source.upper())

        statement = statement.limit(limit).offset(offset)
        result = await self.session.scalars(statement)
        return list(result.all())

    async def list_latest_daily_prices(
        self,
        *,
        exchange: ExchangeCode | None,
        limit: int,
        offset: int,
    ) -> list[tuple[Stock, DailyPrice]]:
        latest_price_dates = (
            select(
                DailyPrice.stock_id.label("stock_id"),
                func.max(DailyPrice.trade_date).label("latest_trade_date"),
            )
            .group_by(DailyPrice.stock_id)
            .subquery()
        )
        statement = (
            select(Stock, DailyPrice)
            .join(latest_price_dates, latest_price_dates.c.stock_id == Stock.id)
            .join(
                DailyPrice,
                (DailyPrice.stock_id == latest_price_dates.c.stock_id)
                & (DailyPrice.trade_date == latest_price_dates.c.latest_trade_date),
            )
            .where(Stock.is_active.is_(True))
            .order_by(Stock.exchange, Stock.symbol, Stock.id)
            .limit(limit)
            .offset(offset)
        )
        if exchange is not None:
            statement = statement.where(Stock.exchange == exchange)

        result = await self.session.execute(statement)
        return [(stock, price) for stock, price in result.all()]

    async def list_market_price_windows(
        self,
        *,
        exchange: ExchangeCode | None,
        limit: int,
        offset: int,
        price_window_limit: int,
    ) -> list[tuple[Stock, DailyPrice]]:
        limited_stocks = (
            select(Stock.id)
            .where(Stock.is_active.is_(True))
            .order_by(Stock.exchange, Stock.symbol, Stock.id)
            .limit(limit)
            .offset(offset)
            .subquery()
        )
        if exchange is not None:
            limited_stocks = (
                select(Stock.id)
                .where(Stock.is_active.is_(True), Stock.exchange == exchange)
                .order_by(Stock.exchange, Stock.symbol, Stock.id)
                .limit(limit)
                .offset(offset)
                .subquery()
            )

        ranked_prices = (
            select(
                DailyPrice.id.label("price_id"),
                DailyPrice.stock_id.label("stock_id"),
                func.row_number()
                .over(
                    partition_by=DailyPrice.stock_id,
                    order_by=(DailyPrice.trade_date.desc(), DailyPrice.id.desc()),
                )
                .label("row_number"),
            )
            .join(limited_stocks, limited_stocks.c.id == DailyPrice.stock_id)
            .subquery()
        )
        statement = (
            select(Stock, DailyPrice)
            .join(limited_stocks, limited_stocks.c.id == Stock.id)
            .join(ranked_prices, ranked_prices.c.stock_id == Stock.id)
            .join(DailyPrice, DailyPrice.id == ranked_prices.c.price_id)
            .where(ranked_prices.c.row_number <= price_window_limit)
            .order_by(Stock.exchange, Stock.symbol, Stock.id, DailyPrice.trade_date.desc(), DailyPrice.id.desc())
        )

        result = await self.session.execute(statement)
        return [(stock, price) for stock, price in result.all()]

    async def get_daily_price_by_stock_date(
        self,
        *,
        stock_id: UUID,
        trade_date: date,
    ) -> DailyPrice | None:
        statement = select(DailyPrice).where(
            DailyPrice.stock_id == stock_id,
            DailyPrice.trade_date == trade_date,
        )
        return await self.session.scalar(statement)

    async def get_stock_by_id(self, stock_id: UUID) -> Stock | None:
        return await self.session.get(Stock, stock_id)

    async def get_latest_daily_price_before(
        self,
        *,
        stock_id: UUID,
        trade_date: date,
    ) -> DailyPrice | None:
        statement = (
            select(DailyPrice)
            .where(DailyPrice.stock_id == stock_id, DailyPrice.trade_date < trade_date)
            .order_by(DailyPrice.trade_date.desc(), DailyPrice.id.desc())
            .limit(1)
        )
        return await self.session.scalar(statement)

    async def upsert_daily_price(self, values: dict[str, object]) -> DailyPrice:
        statement = insert(DailyPrice).values(**values)
        update_values = {
            column.name: statement.excluded[column.name]
            for column in DailyPrice.__table__.columns
            if column.name not in {"id", "created_at"}
        }
        update_values["updated_at"] = func.now()

        statement = statement.on_conflict_do_update(
            index_elements=[DailyPrice.stock_id, DailyPrice.trade_date],
            set_=update_values,
            where=~(
                (DailyPrice.source == "AMARSTOCK_API")
                & (statement.excluded.source != "AMARSTOCK_API")
            ),
        ).returning(DailyPrice)
        daily_price = await self.session.scalar(statement)
        if daily_price is None:
            daily_price = await self.get_daily_price_by_stock_date(
                stock_id=values["stock_id"],
                trade_date=values["trade_date"],
            )
        if daily_price is None:
            raise RuntimeError("Daily price upsert did not return a row")
        return daily_price

    async def patch_daily_price_trade_stats(
        self,
        *,
        stock_id: UUID,
        trade_date: date,
        trade_count: int | None = None,
        turnover: Decimal | None = None,
        data_quality_flag: DataQualityFlag | None = None,
    ) -> int:
        """Update only turnover/trade_count/optional flag; leaves OHLCV and source unchanged."""
        values: dict[str, object] = {}
        if trade_count is not None:
            values["trade_count"] = trade_count
        if turnover is not None:
            values["turnover"] = turnover
        if data_quality_flag is not None:
            values["data_quality_flag"] = data_quality_flag
        if not values:
            return 0
        values["updated_at"] = func.now()
        result = await self.session.execute(
            update(DailyPrice)
            .where(DailyPrice.stock_id == stock_id, DailyPrice.trade_date == trade_date)
            .values(**values)
        )
        await self.session.flush()
        return int(result.rowcount or 0)

    async def get_stocks_by_symbols(
        self,
        *,
        exchange: ExchangeCode,
        symbols: set[str],
    ) -> dict[str, Stock]:
        if not symbols:
            return {}

        statement = select(Stock).where(
            Stock.exchange == exchange,
            func.upper(Stock.symbol).in_({symbol.upper() for symbol in symbols}),
        )
        result = await self.session.scalars(statement)
        return {stock.symbol.upper(): stock for stock in result.all()}

    async def create_stock(
        self,
        *,
        symbol: str,
        name: str,
        exchange: ExchangeCode,
        is_active: bool = True,
    ) -> Stock:
        """Insert one stock row (seed/ingestion); bulk paths may replace per-row inserts later."""
        return await self.create_model(
            Stock,
            {
                "symbol": symbol,
                "name": name,
                "exchange": exchange,
                "is_active": is_active,
            },
        )

    async def list_daily_market_summaries(
        self,
        *,
        exchange: ExchangeCode | None,
        limit: int,
        offset: int,
    ) -> list[DailyMarketSummary]:
        statement = select(DailyMarketSummary)
        if exchange is not None:
            statement = statement.where(DailyMarketSummary.exchange == exchange)
        statement = statement.order_by(
            DailyMarketSummary.trade_date.desc(),
            DailyMarketSummary.exchange,
            DailyMarketSummary.index_name,
            DailyMarketSummary.id.desc(),
        )
        result = await self.session.scalars(statement.limit(limit).offset(offset))
        return list(result.all())

    async def get_daily_market_summary(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date,
        index_name: str,
    ) -> DailyMarketSummary | None:
        statement = select(DailyMarketSummary).where(
            DailyMarketSummary.exchange == exchange,
            DailyMarketSummary.trade_date == trade_date,
            DailyMarketSummary.index_name == index_name,
        )
        return await self.session.scalar(statement)

    async def upsert_daily_market_summary(self, values: dict[str, object]) -> DailyMarketSummary:
        statement = insert(DailyMarketSummary).values(**values)
        update_values = {
            column.name: statement.excluded[column.name]
            for column in DailyMarketSummary.__table__.columns
            if column.name not in {"id", "created_at"}
        }
        update_values["updated_at"] = func.now()

        statement = statement.on_conflict_do_update(
            index_elements=[
                DailyMarketSummary.exchange,
                DailyMarketSummary.trade_date,
                DailyMarketSummary.index_name,
            ],
            set_=update_values,
        ).returning(DailyMarketSummary)
        summary = await self.session.scalar(statement)
        if summary is None:
            raise RuntimeError("Daily market summary upsert did not return a row")
        return summary

def get_market_data_repository(session: AsyncSession = Depends(get_db_session)) -> MarketDataRepository:
    return MarketDataRepository(session)

