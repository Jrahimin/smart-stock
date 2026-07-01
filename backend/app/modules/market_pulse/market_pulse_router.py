from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.enums import ExchangeCode
from app.core.response_handler import ApiResponse, success_response
from app.modules.market_pulse.market_pulse_schemas import MarketBriefingRead, MarketPulseRead, MarketPulseSummaryRead
from app.modules.market_pulse.market_pulse_service import (
    MarketPulseService,
    get_market_pulse_service,
    parse_previous_snapshot,
)
from app.modules.market_universe.market_universe_service import UniverseCacheUnavailableError

router = APIRouter(tags=["market pulse"])


async def _run_pulse_request(handler):
    try:
        return await handler()
    except UniverseCacheUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.get("/market/pulse", response_model=ApiResponse[MarketPulseRead])
async def get_market_pulse(
    service: Annotated[MarketPulseService, Depends(get_market_pulse_service)],
    exchange: ExchangeCode = ExchangeCode.DSE,
    previous_snapshot: Annotated[str | None, Query(description="URL-encoded JSON previous snapshot for change detection")] = None,
    display_name: Annotated[str | None, Query(max_length=160)] = None,
) -> ApiResponse[MarketPulseRead]:
    previous = parse_previous_snapshot(previous_snapshot)

    async def _load():
        return await service.get_market_pulse(
            exchange=exchange,
            previous=previous,
            display_name=display_name,
        )

    pulse = await _run_pulse_request(_load)
    return success_response(data=pulse, message="Market pulse retrieved")


@router.get("/market/pulse/summary", response_model=ApiResponse[MarketPulseSummaryRead])
async def get_market_pulse_summary(
    service: Annotated[MarketPulseService, Depends(get_market_pulse_service)],
    exchange: ExchangeCode = ExchangeCode.DSE,
    previous_snapshot: Annotated[str | None, Query(description="URL-encoded JSON previous snapshot for change detection")] = None,
    display_name: Annotated[str | None, Query(max_length=160)] = None,
) -> ApiResponse[MarketPulseSummaryRead]:
    previous = parse_previous_snapshot(previous_snapshot)

    async def _load():
        return await service.get_market_pulse_summary(
            exchange=exchange,
            previous=previous,
            display_name=display_name,
        )

    summary = await _run_pulse_request(_load)
    return success_response(data=summary, message="Market pulse summary retrieved")


@router.get("/market/pulse/briefing", response_model=ApiResponse[MarketBriefingRead])
async def get_market_pulse_briefing(
    service: Annotated[MarketPulseService, Depends(get_market_pulse_service)],
    exchange: ExchangeCode = ExchangeCode.DSE,
    display_name: Annotated[str | None, Query(max_length=160)] = None,
) -> ApiResponse[MarketBriefingRead]:
    async def _load():
        return await service.get_market_pulse_briefing(exchange=exchange, display_name=display_name)

    briefing = await _run_pulse_request(_load)
    return success_response(data=briefing, message="Market pulse briefing retrieved")
