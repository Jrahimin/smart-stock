from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.pagination import PaginationParams, get_pagination_params
from app.core.response_handler import ApiResponse, success_response
from app.modules.watchlists.watchlists_schemas import (
    UserWatchlistCreate,
    UserWatchlistRead,
    UserWatchlistSummaryRead,
    UserWatchlistToggleResult,
    UserWatchlistUpdate,
)
from app.modules.watchlists.watchlists_service import WatchlistsService, get_watchlists_service

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


@router.get("/items", response_model=ApiResponse[list[UserWatchlistRead]])
async def list_watchlist_items(
    pagination: Annotated[PaginationParams, Depends(get_pagination_params)],
    service: Annotated[WatchlistsService, Depends(get_watchlists_service)],
    holding_only: bool = False,
) -> ApiResponse[list[UserWatchlistRead]]:
    items = await service.list_items(
        holding_only=holding_only,
        limit=pagination.limit,
        offset=pagination.offset,
    )
    return success_response(data=items, message="Watchlist items retrieved")


@router.get("/summary", response_model=ApiResponse[UserWatchlistSummaryRead])
async def get_watchlist_summary(
    service: Annotated[WatchlistsService, Depends(get_watchlists_service)],
) -> ApiResponse[UserWatchlistSummaryRead]:
    summary = await service.get_summary()
    return success_response(data=summary, message="Watchlist summary retrieved")


@router.post("/items", response_model=ApiResponse[UserWatchlistRead])
async def add_watchlist_item(
    payload: UserWatchlistCreate,
    service: Annotated[WatchlistsService, Depends(get_watchlists_service)],
) -> ApiResponse[UserWatchlistRead]:
    entry, was_created = await service.add_item(payload)
    read_item = await service.to_read(entry)
    message = "Stock added to watchlist" if was_created else "Stock is already on your watchlist"
    return success_response(data=read_item, message=message)


@router.patch("/items/{stock_id}", response_model=ApiResponse[UserWatchlistRead])
async def update_watchlist_item(
    stock_id: UUID,
    payload: UserWatchlistUpdate,
    service: Annotated[WatchlistsService, Depends(get_watchlists_service)],
) -> ApiResponse[UserWatchlistRead]:
    entry = await service.update_item(stock_id, payload)
    read_item = await service.to_read(entry)
    return success_response(data=read_item, message="Watchlist item updated")


@router.delete("/items/{stock_id}", response_model=ApiResponse[dict[str, str]])
async def remove_watchlist_item(
    stock_id: UUID,
    service: Annotated[WatchlistsService, Depends(get_watchlists_service)],
) -> ApiResponse[dict[str, str]]:
    await service.remove_item(stock_id)
    return success_response(data={"stock_id": str(stock_id)}, message="Stock removed from watchlist")


@router.post("/items/{stock_id}/toggle", response_model=ApiResponse[UserWatchlistToggleResult])
async def toggle_watchlist_item(
    stock_id: UUID,
    service: Annotated[WatchlistsService, Depends(get_watchlists_service)],
) -> ApiResponse[UserWatchlistToggleResult]:
    result = await service.toggle_item(stock_id)
    message = "Stock added to watchlist" if result.added else "Stock removed from watchlist"
    return success_response(data=result, message=message)
