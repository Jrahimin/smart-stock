from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.enums import DataQualityFlag, ExchangeCode
from app.core.pagination import PaginationParams, get_pagination_params
from app.core.response_handler import ApiResponse, success_response
from app.jobs.ingestion.dse_market_data_source import DseMarketDataSource
from app.jobs.ingestion.ingestion_source_base import MarketDataSource
from app.modules.market_data.market_data_schemas import (
    DailyMarketSummaryCreate,
    DailyMarketSummaryRead,
    DailyPriceCreate,
    DailyPriceIngestionResult,
    DailyPriceRead,
    DsexIndexSnapshotRead,
    LatestMarketPriceRead,
    MarketPriceWindowRead,
)
from app.modules.stock_details.decision.summary import compute_trader_decision_summary_for_stock
from app.modules.stocks.stocks_schemas import StockRead
from app.modules.market_data.market_data_service import MarketDataService, get_market_data_service

router = APIRouter(tags=["market data"])


def get_default_market_data_source() -> MarketDataSource:
    return DseMarketDataSource()


@router.get("/stocks/{stock_id}/prices", response_model=ApiResponse[list[DailyPriceRead]])
async def list_daily_prices(
    stock_id: UUID,
    pagination: Annotated[PaginationParams, Depends(get_pagination_params)],
    service: Annotated[MarketDataService, Depends(get_market_data_service)],
    start_date: date | None = None,
    end_date: date | None = None,
    data_quality_flag: DataQualityFlag | None = None,
    source: Annotated[str | None, Query(min_length=1, max_length=80)] = None,
) -> ApiResponse[list[DailyPriceRead]]:
    prices = await service.list_daily_prices(
        stock_id=stock_id,
        start_date=start_date,
        end_date=end_date,
        data_quality_flag=data_quality_flag,
        source=source,
        limit=pagination.limit,
        offset=pagination.offset,
    )
    price_items = [DailyPriceRead.model_validate(price) for price in prices]
    return success_response(data=price_items, message="Daily prices retrieved")


@router.get("/market/latest-prices", response_model=ApiResponse[list[LatestMarketPriceRead]])
async def list_latest_market_prices(
    pagination: Annotated[PaginationParams, Depends(get_pagination_params)],
    service: Annotated[MarketDataService, Depends(get_market_data_service)],
    exchange: ExchangeCode | None = None,
) -> ApiResponse[list[LatestMarketPriceRead]]:
    latest_prices = await service.list_latest_daily_prices(
        exchange=exchange,
        limit=pagination.limit,
        offset=pagination.offset,
    )
    items = [
        LatestMarketPriceRead(
            stock=StockRead.model_validate(stock),
            price=DailyPriceRead.model_validate(price),
        )
        for stock, price in latest_prices
    ]
    return success_response(data=items, message="Latest market prices retrieved")


@router.get("/market/price-windows", response_model=ApiResponse[list[MarketPriceWindowRead]])
async def list_market_price_windows(
    pagination: Annotated[PaginationParams, Depends(get_pagination_params)],
    service: Annotated[MarketDataService, Depends(get_market_data_service)],
    exchange: ExchangeCode | None = None,
    price_window_limit: Annotated[int, Query(ge=1, le=260)] = 90,
) -> ApiResponse[list[MarketPriceWindowRead]]:
    rows = await service.list_market_price_windows(
        exchange=exchange,
        limit=pagination.limit,
        offset=pagination.offset,
        price_window_limit=price_window_limit,
    )
    stock_windows: dict[str, dict[str, object]] = {}
    for stock, price in rows:
        stock_id = str(stock.id)
        if stock_id not in stock_windows:
            stock_windows[stock_id] = {"stock": stock, "prices": []}
        stock_windows[stock_id]["prices"].append(price)

    items: list[MarketPriceWindowRead] = []
    for entry in stock_windows.values():
        stock = entry["stock"]
        prices = entry["prices"]
        decision = compute_trader_decision_summary_for_stock(stock, prices)
        items.append(
            MarketPriceWindowRead(
                stock=StockRead.model_validate(stock),
                prices=[DailyPriceRead.model_validate(price) for price in prices],
                trader_decision=decision,
            )
        )

    return success_response(data=items, message="Market price windows retrieved")


@router.post("/stocks/{stock_id}/prices", response_model=ApiResponse[DailyPriceRead])
async def create_daily_price(
    stock_id: UUID,
    price_data: DailyPriceCreate,
    service: Annotated[MarketDataService, Depends(get_market_data_service)],
) -> ApiResponse[DailyPriceRead]:
    prepared_price_data = price_data.model_copy(update={"stock_id": stock_id})
    existing_price = await service.find_daily_price(prepared_price_data)
    if existing_price is not None:
        return success_response(
            data=DailyPriceRead.model_validate(existing_price),
            message="Daily price already exists",
        )

    daily_price = await service.create_daily_price(prepared_price_data)
    return success_response(data=DailyPriceRead.model_validate(daily_price), message="Daily price created")


@router.post("/market-data/ingestion/daily-prices", response_model=ApiResponse[DailyPriceIngestionResult])
async def ingest_daily_prices(
    trade_date: date,
    service: Annotated[MarketDataService, Depends(get_market_data_service)],
    source: Annotated[MarketDataSource, Depends(get_default_market_data_source)],
    exchange: ExchangeCode = ExchangeCode.DSE,
) -> ApiResponse[DailyPriceIngestionResult]:
    result = await service.ingest_daily_prices(
        exchange=exchange,
        trade_date=trade_date,
        source=source,
    )
    return success_response(data=result, message="Daily prices ingested")


@router.get("/market/index/dsex", response_model=ApiResponse[DsexIndexSnapshotRead])
async def get_dsex_index_snapshot(
    service: Annotated[MarketDataService, Depends(get_market_data_service)],
    exchange: ExchangeCode = ExchangeCode.DSE,
) -> ApiResponse[DsexIndexSnapshotRead]:
    snapshot = await service.get_dsex_index_snapshot(exchange=exchange)
    return success_response(data=snapshot, message="DSEX index snapshot retrieved")


@router.get("/market/summaries", response_model=ApiResponse[list[DailyMarketSummaryRead]])
async def list_daily_market_summaries(
    pagination: Annotated[PaginationParams, Depends(get_pagination_params)],
    service: Annotated[MarketDataService, Depends(get_market_data_service)],
    exchange: ExchangeCode | None = None,
) -> ApiResponse[list[DailyMarketSummaryRead]]:
    summaries = await service.list_daily_market_summaries(
        exchange=exchange,
        limit=pagination.limit,
        offset=pagination.offset,
    )
    summary_items = [DailyMarketSummaryRead.model_validate(summary) for summary in summaries]
    return success_response(data=summary_items, message="Daily market summaries retrieved")


@router.post("/market/summaries", response_model=ApiResponse[DailyMarketSummaryRead])
async def create_daily_market_summary(
    summary_data: DailyMarketSummaryCreate,
    service: Annotated[MarketDataService, Depends(get_market_data_service)],
) -> ApiResponse[DailyMarketSummaryRead]:
    existing_summary = await service.find_daily_market_summary(summary_data)
    if existing_summary is not None:
        return success_response(
            data=DailyMarketSummaryRead.model_validate(existing_summary),
            message="Daily market summary already exists",
        )

    summary = await service.create_daily_market_summary(summary_data)
    return success_response(
        data=DailyMarketSummaryRead.model_validate(summary),
        message="Daily market summary created",
    )

