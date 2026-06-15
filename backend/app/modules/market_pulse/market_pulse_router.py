from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.enums import ExchangeCode
from app.core.response_handler import ApiResponse, success_response
from app.modules.market_pulse.market_pulse_schemas import MarketPulseRead
from app.modules.market_pulse.market_pulse_service import (
    MarketPulseService,
    get_market_pulse_service,
    parse_previous_snapshot,
)

router = APIRouter(tags=["market pulse"])


@router.get("/market/pulse", response_model=ApiResponse[MarketPulseRead])
async def get_market_pulse(
    service: Annotated[MarketPulseService, Depends(get_market_pulse_service)],
    exchange: ExchangeCode = ExchangeCode.DSE,
    previous_snapshot: Annotated[str | None, Query(description="URL-encoded JSON previous snapshot for change detection")] = None,
    display_name: Annotated[str | None, Query(max_length=160)] = None,
) -> ApiResponse[MarketPulseRead]:
    previous = parse_previous_snapshot(previous_snapshot)
    pulse = await service.get_market_pulse(
        exchange=exchange,
        previous=previous,
        display_name=display_name,
    )
    return success_response(data=pulse, message="Market pulse retrieved")
