from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.dependencies.auth_dependencies import require_authenticated_user
from app.core.pagination import PaginationParams, get_pagination_params
from app.core.response_handler import ApiResponse, success_response
from app.core.security_config import UserContext
from app.modules.signals.signals_schemas import TradingSignalCreate, TradingSignalRead
from app.modules.signals.signals_service import SignalsService, get_signals_service

router = APIRouter(tags=["signals"])


@router.get("/stocks/{stock_id}/signals", response_model=ApiResponse[list[TradingSignalRead]])
async def list_signals(
    stock_id: UUID,
    pagination: Annotated[PaginationParams, Depends(get_pagination_params)],
    service: Annotated[SignalsService, Depends(get_signals_service)],
) -> ApiResponse[list[TradingSignalRead]]:
    signals = await service.list_signals(
        stock_id=stock_id,
        limit=pagination.limit,
        offset=pagination.offset,
    )
    signal_items = [TradingSignalRead.model_validate(signal) for signal in signals]
    return success_response(data=signal_items, message="Signals retrieved")


@router.post("/stocks/{stock_id}/signals", response_model=ApiResponse[TradingSignalRead])
async def create_signal(
    stock_id: UUID,
    signal_data: TradingSignalCreate,
    service: Annotated[SignalsService, Depends(get_signals_service)],
    user_context: Annotated[UserContext, Depends(require_authenticated_user)],
) -> ApiResponse[TradingSignalRead]:
    _ = user_context
    prepared_signal_data = signal_data.model_copy(update={"stock_id": stock_id})
    existing_signal = await service.find_signal(prepared_signal_data)
    if existing_signal is not None:
        return success_response(
            data=TradingSignalRead.model_validate(existing_signal),
            message="Trading signal already exists",
        )

    signal = await service.create_signal(prepared_signal_data)
    return success_response(data=TradingSignalRead.model_validate(signal), message="Trading signal created")

