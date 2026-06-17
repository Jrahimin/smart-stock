from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.enums import ExchangeCode
from app.core.response_handler import ApiResponse, success_response
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
from app.modules.stock_details.stock_details_workspace_schemas import (
    StockWorkspaceEventsRead,
    StockWorkspacePatternsRead,
    StockWorkspaceRead,
)
from app.modules.stock_details.stock_details_service import (
    StockDetailsService,
    get_stock_details_service,
)
from app.modules.stock_details.stock_details_workspace_service import (
    StockDetailsWorkspaceService,
    get_stock_details_workspace_service,
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


@router.get("/{exchange}/{symbol}/workspace", response_model=ApiResponse[StockWorkspaceRead])
async def get_stock_workspace(
    exchange: ExchangeCode,
    symbol: str,
    service: Annotated[StockDetailsWorkspaceService, Depends(get_stock_details_workspace_service)],
) -> ApiResponse[StockWorkspaceRead]:
    result = await service.get_workspace(exchange=exchange, symbol=symbol.upper())
    return success_response(data=result, message="Stock workspace retrieved")


@router.get("/{exchange}/{symbol}/workspace/patterns", response_model=ApiResponse[StockWorkspacePatternsRead])
async def get_stock_workspace_patterns(
    exchange: ExchangeCode,
    symbol: str,
    service: Annotated[StockDetailsWorkspaceService, Depends(get_stock_details_workspace_service)],
) -> ApiResponse[StockWorkspacePatternsRead]:
    result = await service.get_workspace_patterns(exchange=exchange, symbol=symbol.upper())
    return success_response(data=result, message="Stock workspace patterns retrieved")


@router.get("/{exchange}/{symbol}/workspace/events", response_model=ApiResponse[StockWorkspaceEventsRead])
async def get_stock_workspace_events(
    exchange: ExchangeCode,
    symbol: str,
    service: Annotated[StockDetailsWorkspaceService, Depends(get_stock_details_workspace_service)],
) -> ApiResponse[StockWorkspaceEventsRead]:
    result = await service.get_workspace_events(exchange=exchange, symbol=symbol.upper())
    return success_response(data=result, message="Stock workspace events retrieved")


@router.post("/sync", response_model=ApiResponse[StockDetailsSyncResult])
async def sync_stock_details(
    request: StockDetailsSyncRequest,
    service: Annotated[StockDetailsService, Depends(get_stock_details_service)],
) -> ApiResponse[StockDetailsSyncResult]:
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
