from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.dependencies.auth_dependencies import require_authenticated_user
from app.core.enums import ExchangeCode
from app.core.response_handler import ApiResponse, success_response
from app.core.security_config import UserContext
from app.modules.stock_details.stock_details_decision_service import (
    StockDetailsDecisionService,
    get_stock_details_decision_service,
)
from app.modules.stock_details.stock_details_schemas import (
    StockDecisionSupportRead,
    StockDetailsSyncJobRead,
    StockDetailsSyncRequest,
    StockDetailsSyncResult,
)
from app.modules.stock_details.stock_details_service import (
    StockDetailsService,
    get_stock_details_service,
)

router = APIRouter(prefix="/stock-details", tags=["stock details"])


@router.get("/{exchange}/{symbol}/decision-support", response_model=ApiResponse[StockDecisionSupportRead])
async def get_stock_decision_support(
    exchange: ExchangeCode,
    symbol: str,
    service: Annotated[StockDetailsDecisionService, Depends(get_stock_details_decision_service)],
) -> ApiResponse[StockDecisionSupportRead]:
    result = await service.get_decision_support(exchange=exchange, symbol=symbol.upper())
    return success_response(data=result, message="Stock decision support retrieved")


@router.post("/sync", response_model=ApiResponse[StockDetailsSyncResult])
async def sync_stock_details(
    request: StockDetailsSyncRequest,
    service: Annotated[StockDetailsService, Depends(get_stock_details_service)],
    user_context: Annotated[UserContext, Depends(require_authenticated_user)],
) -> ApiResponse[StockDetailsSyncResult]:
    _ = user_context
    result = await service.sync_stock_details(request)
    return success_response(data=result, message="Stock details synced")


@router.get("/sync-jobs/{job_id}", response_model=ApiResponse[StockDetailsSyncJobRead])
async def get_stock_details_sync_job(
    job_id: UUID,
    service: Annotated[StockDetailsService, Depends(get_stock_details_service)],
) -> ApiResponse[StockDetailsSyncJobRead]:
    job = await service.get_stock_details_sync_job(job_id)
    return success_response(
        data=StockDetailsSyncJobRead.model_validate(job),
        message="Stock details sync job retrieved",
    )
