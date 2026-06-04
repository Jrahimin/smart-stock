from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.enums import ExchangeCode
from app.core.pagination import PaginationParams, get_pagination_params
from app.core.response_handler import ApiResponse, success_response
from app.modules.signals.signals_schemas import StockTraderDecisionRead, TradingSignalCreate, TradingSignalRead
from app.modules.signals.signals_service import SignalsService, get_signals_service
from app.modules.signals.trader_decisions_service import TraderDecisionsService, get_trader_decisions_service
from app.modules.stocks.stocks_schemas import StockRead

router = APIRouter(tags=["signals"])


@router.get("/signals/decisions/latest", response_model=ApiResponse[list[StockTraderDecisionRead]])
async def list_latest_trader_decisions(
    pagination: Annotated[PaginationParams, Depends(get_pagination_params)],
    service: Annotated[TraderDecisionsService, Depends(get_trader_decisions_service)],
    exchange: ExchangeCode | None = None,
    price_window_limit: Annotated[int, Query(ge=1, le=260)] = 90,
) -> ApiResponse[list[StockTraderDecisionRead]]:
    rows = await service.list_latest_trader_decisions(
        exchange=exchange,
        limit=pagination.limit,
        offset=pagination.offset,
        price_window_limit=price_window_limit,
    )
    items = [
        StockTraderDecisionRead(
            stock=StockRead.model_validate(row.stock),
            decision=row.decision,
            latest_trade_date=row.prices[-1].trade_date if row.prices else None,
        )
        for row in rows
    ]
    return success_response(data=items, message="Latest trader decisions retrieved")


@router.get("/signals/latest", response_model=ApiResponse[list[TradingSignalRead]])
async def list_latest_signals(
    pagination: Annotated[PaginationParams, Depends(get_pagination_params)],
    service: Annotated[SignalsService, Depends(get_signals_service)],
) -> ApiResponse[list[TradingSignalRead]]:
    signals = await service.list_latest_active_signals(
        limit=pagination.limit,
        offset=pagination.offset,
    )
    signal_items = [TradingSignalRead.model_validate(signal) for signal in signals]
    return success_response(
        data=signal_items,
        message="Latest active signals retrieved (legacy persisted strategy rows)",
    )


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
) -> ApiResponse[TradingSignalRead]:
    prepared_signal_data = signal_data.model_copy(update={"stock_id": stock_id})
    existing_signal = await service.find_signal(prepared_signal_data)
    if existing_signal is not None:
        return success_response(
            data=TradingSignalRead.model_validate(existing_signal),
            message="Trading signal already exists",
        )

    signal = await service.create_signal(prepared_signal_data)
    return success_response(data=TradingSignalRead.model_validate(signal), message="Trading signal created")
