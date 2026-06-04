from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.pagination import PaginationParams, get_pagination_params
from app.core.response_handler import ApiResponse, success_response
from app.modules.indicators.indicators_schemas import TechnicalIndicatorCreate, TechnicalIndicatorRead
from app.modules.indicators.indicators_service import IndicatorsService, get_indicators_service

router = APIRouter(tags=["indicators"])


@router.get("/stocks/{stock_id}/indicators", response_model=ApiResponse[list[TechnicalIndicatorRead]])
async def list_indicators(
    stock_id: UUID,
    pagination: Annotated[PaginationParams, Depends(get_pagination_params)],
    service: Annotated[IndicatorsService, Depends(get_indicators_service)],
) -> ApiResponse[list[TechnicalIndicatorRead]]:
    indicators = await service.list_indicators(
        stock_id=stock_id,
        limit=pagination.limit,
        offset=pagination.offset,
    )
    indicator_items = [TechnicalIndicatorRead.model_validate(indicator) for indicator in indicators]
    return success_response(data=indicator_items, message="Indicators retrieved")


@router.post("/stocks/{stock_id}/indicators", response_model=ApiResponse[TechnicalIndicatorRead])
async def create_indicator(
    stock_id: UUID,
    indicator_data: TechnicalIndicatorCreate,
    service: Annotated[IndicatorsService, Depends(get_indicators_service)],
) -> ApiResponse[TechnicalIndicatorRead]:
    prepared_indicator_data = indicator_data.model_copy(update={"stock_id": stock_id})
    existing_indicator = await service.find_indicator(prepared_indicator_data)
    if existing_indicator is not None:
        return success_response(
            data=TechnicalIndicatorRead.model_validate(existing_indicator),
            message="Technical indicator already exists",
        )

    indicator = await service.create_indicator(prepared_indicator_data)
    return success_response(
        data=TechnicalIndicatorRead.model_validate(indicator),
        message="Technical indicator created",
    )

