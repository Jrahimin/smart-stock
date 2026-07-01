from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.enums import ExchangeCode
from app.core.response_handler import ApiResponse, success_response
from app.modules.market_universe.market_universe_schemas import UniverseRowsRead
from app.modules.market_universe.market_universe_service import (
    MarketUniverseService,
    UniverseCacheUnavailableError,
    get_market_universe_service,
)

router = APIRouter(tags=["market-universe"])


@router.get("/market/universe-rows", response_model=ApiResponse[UniverseRowsRead])
async def list_universe_rows(
    service: Annotated[MarketUniverseService, Depends(get_market_universe_service)],
    exchange: ExchangeCode = Query(default=ExchangeCode.DSE),
) -> ApiResponse[UniverseRowsRead]:
    try:
        payload = await service.get_universe_rows(exchange=exchange)
    except UniverseCacheUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return success_response(data=payload, message="Market universe rows retrieved")
