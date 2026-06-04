from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query

from app.core.enums import ExchangeCode
from app.core.pagination import ListQueryParams, get_list_query_params
from app.core.response_handler import ApiResponse, success_response
from app.modules.stocks.stocks_schemas import StockCreate, StockRead
from app.modules.stocks.stocks_service import StocksService, get_stocks_service

router = APIRouter(prefix="/stocks", tags=["stocks"])


@router.get("", response_model=ApiResponse[list[StockRead]])
async def list_stocks(
    params: Annotated[ListQueryParams, Depends(get_list_query_params)],
    service: Annotated[StocksService, Depends(get_stocks_service)],
    exchange: ExchangeCode | None = None,
) -> ApiResponse[list[StockRead]]:
    stocks = await service.list_stocks(
        exchange=exchange,
        params=params,
    )
    stock_items = [StockRead.model_validate(stock) for stock in stocks]
    return success_response(data=stock_items, message="Stocks retrieved")


@router.get("/search", response_model=ApiResponse[list[StockRead]])
async def search_stocks(
    params: Annotated[ListQueryParams, Depends(get_list_query_params)],
    service: Annotated[StocksService, Depends(get_stocks_service)],
    q: Annotated[str, Query(min_length=1, max_length=120)],
    exchange: ExchangeCode | None = None,
) -> ApiResponse[list[StockRead]]:
    search_params = params.model_copy(update={"search": q})
    stocks = await service.list_stocks(
        exchange=exchange,
        params=search_params,
    )
    stock_items = [StockRead.model_validate(stock) for stock in stocks]
    return success_response(data=stock_items, message="Stocks matched")


@router.get("/lookup/{exchange}/{symbol}", response_model=ApiResponse[StockRead])
async def get_stock_by_symbol(
    exchange: ExchangeCode,
    symbol: Annotated[str, Path(min_length=1, max_length=32)],
    service: Annotated[StocksService, Depends(get_stocks_service)],
) -> ApiResponse[StockRead]:
    stock = await service.get_stock_by_symbol(exchange=exchange, symbol=symbol)
    return success_response(data=StockRead.model_validate(stock), message="Stock retrieved")


@router.get("/{stock_id}", response_model=ApiResponse[StockRead])
async def get_stock(
    stock_id: UUID,
    service: Annotated[StocksService, Depends(get_stocks_service)],
) -> ApiResponse[StockRead]:
    stock = await service.get_stock(stock_id)
    return success_response(data=StockRead.model_validate(stock), message="Stock retrieved")


@router.post("", response_model=ApiResponse[StockRead])
async def create_stock(
    stock_data: StockCreate,
    service: Annotated[StocksService, Depends(get_stocks_service)],
) -> ApiResponse[StockRead]:
    stock, was_created = await service.create_stock_if_missing(stock_data)
    message = "Stock created" if was_created else "Stock already exists"
    return success_response(data=StockRead.model_validate(stock), message=message)


@router.patch("/{stock_id}/active/toggle", response_model=ApiResponse[StockRead])
async def toggle_stock_active_status(
    stock_id: UUID,
    service: Annotated[StocksService, Depends(get_stocks_service)],
) -> ApiResponse[StockRead]:
    stock = await service.toggle_stock_active_status(stock_id)
    message = "Stock activated" if stock.is_active else "Stock deactivated"
    return success_response(data=StockRead.model_validate(stock), message=message)


@router.patch("/{stock_id}/details-fetch/toggle", response_model=ApiResponse[StockRead])
async def toggle_stock_details_fetch_status(
    stock_id: UUID,
    service: Annotated[StocksService, Depends(get_stocks_service)],
) -> ApiResponse[StockRead]:
    stock = await service.toggle_stock_details_fetch_status(stock_id)
    message = "Stock details sync enabled" if stock.should_fetch_details else "Stock details sync disabled"
    return success_response(data=StockRead.model_validate(stock), message=message)

