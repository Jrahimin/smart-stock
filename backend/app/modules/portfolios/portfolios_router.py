from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.core.enums import ExchangeCode
from app.core.response_handler import ApiResponse, success_response
from app.modules.portfolios.portfolios_schemas import PortfolioWorkspaceRead
from app.modules.portfolios.portfolios_service import PortfoliosService, get_portfolios_service

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("/workspace", response_model=ApiResponse[PortfolioWorkspaceRead])
async def get_portfolio_workspace(
    response: Response,
    service: Annotated[PortfoliosService, Depends(get_portfolios_service)],
    exchange: Annotated[ExchangeCode, Query()] = ExchangeCode.DSE,
) -> ApiResponse[PortfolioWorkspaceRead]:
    response.headers["Cache-Control"] = "private, no-store"
    workspace = await service.get_workspace(exchange=exchange)
    return success_response(data=workspace, message="Portfolio workspace retrieved")
