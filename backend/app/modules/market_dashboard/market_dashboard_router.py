from typing import Annotated

from fastapi import APIRouter, Depends, Response

from app.core.core_config import Settings, get_settings
from app.core.enums import AppEnvironment, ExchangeCode
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


def _attach_compute_header(response: Response, service: MarketDashboardService, settings: Settings) -> None:
    if settings.app_env not in {AppEnvironment.LOCAL, AppEnvironment.DEVELOPMENT}:
        return
    if service.last_compute_ms is not None:
        response.headers["X-Market-Compute-Ms"] = f"{service.last_compute_ms:.1f}"


@router.get("/dashboard/overview", response_model=ApiResponse[DashboardOverviewRead])
async def get_dashboard_overview(
    response: Response,
    service: Annotated[MarketDashboardService, Depends(get_market_dashboard_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    exchange: ExchangeCode = ExchangeCode.DSE,
) -> ApiResponse[DashboardOverviewRead]:
    overview = await service.get_overview(exchange=exchange)
    _attach_compute_header(response, service, settings)
    return success_response(data=overview, message="Dashboard overview retrieved")


@router.get("/dashboard/movers", response_model=ApiResponse[DashboardMoversRead])
async def get_dashboard_movers(
    response: Response,
    service: Annotated[MarketDashboardService, Depends(get_market_dashboard_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    exchange: ExchangeCode = ExchangeCode.DSE,
) -> ApiResponse[DashboardMoversRead]:
    movers = await service.get_movers(exchange=exchange)
    _attach_compute_header(response, service, settings)
    return success_response(data=movers, message="Dashboard movers retrieved")


@router.get("/dashboard/sectors", response_model=ApiResponse[DashboardSectorsRead])
async def get_dashboard_sectors(
    response: Response,
    service: Annotated[MarketDashboardService, Depends(get_market_dashboard_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    exchange: ExchangeCode = ExchangeCode.DSE,
) -> ApiResponse[DashboardSectorsRead]:
    sectors = await service.get_sectors(exchange=exchange)
    _attach_compute_header(response, service, settings)
    return success_response(data=sectors, message="Dashboard sectors retrieved")


@router.get("/dashboard/market-alerts", response_model=ApiResponse[DashboardMarketAlertsRead])
async def get_dashboard_market_alerts(
    response: Response,
    service: Annotated[MarketDashboardService, Depends(get_market_dashboard_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    exchange: ExchangeCode = ExchangeCode.DSE,
) -> ApiResponse[DashboardMarketAlertsRead]:
    alerts = await service.get_market_alerts(exchange=exchange)
    _attach_compute_header(response, service, settings)
    return success_response(data=alerts, message="Dashboard market alerts retrieved")


@router.get("/dashboard/stocks-in-focus", response_model=ApiResponse[DashboardStocksInFocusRead])
async def get_dashboard_stocks_in_focus(
    response: Response,
    service: Annotated[MarketDashboardService, Depends(get_market_dashboard_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    exchange: ExchangeCode = ExchangeCode.DSE,
) -> ApiResponse[DashboardStocksInFocusRead]:
    focus = await service.get_stocks_in_focus(exchange=exchange)
    _attach_compute_header(response, service, settings)
    return success_response(data=focus, message="Dashboard stocks in focus retrieved")


@router.get("/dashboard/heatmap", response_model=ApiResponse[DashboardHeatmapRead])
async def get_dashboard_heatmap(
    response: Response,
    service: Annotated[MarketDashboardService, Depends(get_market_dashboard_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    exchange: ExchangeCode = ExchangeCode.DSE,
) -> ApiResponse[DashboardHeatmapRead]:
    heatmap = await service.get_heatmap(exchange=exchange)
    _attach_compute_header(response, service, settings)
    return success_response(data=heatmap, message="Dashboard heatmap retrieved")


@router.get("/dashboard/market-sentiment", response_model=ApiResponse[DashboardMarketSentimentRead])
async def get_dashboard_market_sentiment(
    response: Response,
    service: Annotated[MarketDashboardService, Depends(get_market_dashboard_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    exchange: ExchangeCode = ExchangeCode.DSE,
) -> ApiResponse[DashboardMarketSentimentRead]:
    sentiment = await service.get_market_sentiment(exchange=exchange)
    _attach_compute_header(response, service, settings)
    return success_response(data=sentiment, message="Dashboard market sentiment retrieved")
