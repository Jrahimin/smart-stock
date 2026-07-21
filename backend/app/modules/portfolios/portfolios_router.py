from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.core.enums import ExchangeCode
from app.core.response_handler import ApiResponse, success_response
from app.modules.portfolios.portfolios_schemas import PortfolioEmailPreferenceRead, PortfolioEmailPreferenceWrite, PortfolioWorkspaceRead
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


@router.get("/email-preference", response_model=ApiResponse[PortfolioEmailPreferenceRead])
async def get_portfolio_email_preference(
    service: Annotated[PortfoliosService, Depends(get_portfolios_service)],
) -> ApiResponse[PortfolioEmailPreferenceRead]:
    preference = await service.get_email_preference()
    return success_response(data=preference, message="Portfolio email preference retrieved")


@router.put("/email-preference", response_model=ApiResponse[PortfolioEmailPreferenceRead])
async def save_portfolio_email_preference(
    payload: PortfolioEmailPreferenceWrite,
    service: Annotated[PortfoliosService, Depends(get_portfolios_service)],
) -> ApiResponse[PortfolioEmailPreferenceRead]:
    preference = await service.save_email_preference(payload)
    return success_response(data=preference, message="Portfolio email preference saved")
