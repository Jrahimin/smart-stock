from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.enums import ExchangeCode
from app.core.response_handler import ApiResponse, success_response
from app.modules.market_dashboard.market_dashboard_schemas import DashboardMoversRead, DashboardOverviewRead
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
