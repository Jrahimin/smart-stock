from uuid import UUID

from fastapi import Depends

from app.api.dependencies.auth_dependencies import get_current_user_context
from app.core.enums import ExchangeCode
from app.core.exception_handlers import NotFoundError
from app.core.pagination import ListQueryParams
from app.core.security_config import UserContext
from app.models import Stock
from app.modules.stocks.stocks_repository import StocksRepository, get_stocks_repository
from app.modules.stocks.stocks_schemas import ActiveStockSymbolRead, StockCreate


class StocksService:
    def __init__(self, repository: StocksRepository, user_context: UserContext) -> None:
        self.repository = repository
        self.user_context = user_context

    async def list_stocks(
        self,
        *,
        exchange: ExchangeCode | None,
        params: ListQueryParams,
    ) -> list[Stock]:
        return await self.repository.list_stocks(
            exchange=exchange,
            params=params,
        )

    async def list_active_symbols(self, *, exchange: ExchangeCode | None = None) -> list[ActiveStockSymbolRead]:
        rows = await self.repository.list_active_symbols(exchange=exchange)
        return [ActiveStockSymbolRead(exchange=row_exchange, symbol=symbol) for row_exchange, symbol in rows]

    async def get_stock(self, stock_id: UUID) -> Stock:
        stock = await self.repository.get_by_id(stock_id)
        if stock is None:
            raise NotFoundError("Stock was not found")
        return stock

    async def get_stock_by_symbol(self, *, exchange: ExchangeCode, symbol: str) -> Stock:
        stock = await self.repository.get_by_exchange_symbol(exchange=exchange, symbol=symbol)
        if stock is None:
            raise NotFoundError("Stock was not found")
        return stock

    async def find_stock_by_exchange_symbol(self, stock_data: StockCreate) -> Stock | None:
        return await self.repository.get_by_exchange_symbol(
            exchange=stock_data.exchange,
            symbol=stock_data.symbol,
        )

    async def create_stock_if_missing(self, stock_data: StockCreate) -> tuple[Stock, bool]:
        existing_stock = await self.find_stock_by_exchange_symbol(stock_data)
        if existing_stock is not None:
            return existing_stock, False

        stock = await self.repository.create(stock_data.model_dump())
        await self.repository.commit()
        await self.repository.refresh(stock)
        return stock, True

    async def toggle_stock_active_status(self, stock_id: UUID) -> Stock:
        stock = await self.repository.toggle_boolean_by_id(stock_id, "is_active")
        if stock is None:
            raise NotFoundError("Stock was not found")

        await self.repository.commit()
        return stock

    async def toggle_stock_details_fetch_status(self, stock_id: UUID) -> Stock:
        stock = await self.repository.toggle_boolean_by_id(stock_id, "should_fetch_details")
        if stock is None:
            raise NotFoundError("Stock was not found")

        await self.repository.commit()
        return stock


def get_stocks_service(
    repository: StocksRepository = Depends(get_stocks_repository),
    user_context: UserContext = Depends(get_current_user_context),
) -> StocksService:
    return StocksService(repository, user_context)

