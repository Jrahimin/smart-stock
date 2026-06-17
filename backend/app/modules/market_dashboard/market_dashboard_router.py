from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.enums import ExchangeCode
from app.core.response_handler import ApiResponse, success_response
from app.modules.market_dashboard.market_dashboard_schemas import (
    DashboardHeatmapRead,
    DashboardMarketAlertsRead,
    DashboardMarketSentimentRead,
    DashboardMoversRead,
    DashboardOverviewRead,
    DashboardSectorsRead,
    DashboardStocksInFocusRead,
)
from app.modules.market_dashboard.market_dashboard_service import MarketDashboardService, get_market_dashboard_service

router = APIRouter(tags=["market dashboard"])


@router.get("/dashboard/overview", response_model=ApiResponse[DashboardOverviewRead])
async def get_dashboard_overview(
    service: Annotated[MarketDashboardService, Depends(get_market_dashboard_service)],
    exchange: ExchangeCode = ExchangeCode.DSE,
) -> ApiResponse[DashboardOverviewRead]:
    overview = await service.get_overview(exchange=exchange)
    return success_response(data=overview, message="Dashboard overview retrieved")


@router.get("/dashboard/movers", response_model=ApiResponse[DashboardMoversRead])
async def get_dashboard_movers(
    service: Annotated[MarketDashboardService, Depends(get_market_dashboard_service)],
    exchange: ExchangeCode = ExchangeCode.DSE,
) -> ApiResponse[DashboardMoversRead]:
    movers = await service.get_movers(exchange=exchange)
    return success_response(data=movers, message="Dashboard movers retrieved")


@router.get("/dashboard/sectors", response_model=ApiResponse[DashboardSectorsRead])
async def get_dashboard_sectors(
    service: Annotated[MarketDashboardService, Depends(get_market_dashboard_service)],
    exchange: ExchangeCode = ExchangeCode.DSE,
) -> ApiResponse[DashboardSectorsRead]:
    sectors = await service.get_sectors(exchange=exchange)
    return success_response(data=sectors, message="Dashboard sectors retrieved")


@router.get("/dashboard/market-alerts", response_model=ApiResponse[DashboardMarketAlertsRead])
async def get_dashboard_market_alerts(
    service: Annotated[MarketDashboardService, Depends(get_market_dashboard_service)],
    exchange: ExchangeCode = ExchangeCode.DSE,
) -> ApiResponse[DashboardMarketAlertsRead]:
    alerts = await service.get_market_alerts(exchange=exchange)
    return success_response(data=alerts, message="Dashboard market alerts retrieved")


@router.get("/dashboard/stocks-in-focus", response_model=ApiResponse[DashboardStocksInFocusRead])
async def get_dashboard_stocks_in_focus(
    service: Annotated[MarketDashboardService, Depends(get_market_dashboard_service)],
    exchange: ExchangeCode = ExchangeCode.DSE,
) -> ApiResponse[DashboardStocksInFocusRead]:
    focus = await service.get_stocks_in_focus(exchange=exchange)
    return success_response(data=focus, message="Dashboard stocks in focus retrieved")


@router.get("/dashboard/heatmap", response_model=ApiResponse[DashboardHeatmapRead])
async def get_dashboard_heatmap(
    service: Annotated[MarketDashboardService, Depends(get_market_dashboard_service)],
    exchange: ExchangeCode = ExchangeCode.DSE,
) -> ApiResponse[DashboardHeatmapRead]:
    heatmap = await service.get_heatmap(exchange=exchange)
    return success_response(data=heatmap, message="Dashboard heatmap retrieved")


@router.get("/dashboard/market-sentiment", response_model=ApiResponse[DashboardMarketSentimentRead])
async def get_dashboard_market_sentiment(
    service: Annotated[MarketDashboardService, Depends(get_market_dashboard_service)],
    exchange: ExchangeCode = ExchangeCode.DSE,
) -> ApiResponse[DashboardMarketSentimentRead]:
    sentiment = await service.get_market_sentiment(exchange=exchange)
    return success_response(data=sentiment, message="Dashboard market sentiment retrieved")
