from typing import Annotated

from fastapi import Depends, Query
from pydantic import BaseModel, Field


class PaginationParams(BaseModel):
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


class ListQueryParams(PaginationParams):
    is_active: bool | None = None
    search: str | None = Field(default=None, min_length=1, max_length=120)


LimitQuery = Annotated[int, Query(ge=1, le=500)]
OffsetQuery = Annotated[int, Query(ge=0)]
SearchQuery = Annotated[str | None, Query(min_length=1, max_length=120)]


def get_pagination_params(limit: LimitQuery = 50, offset: OffsetQuery = 0) -> PaginationParams:
    return PaginationParams(limit=limit, offset=offset)


def get_list_query_params(
    pagination: Annotated[PaginationParams, Depends(get_pagination_params)],
    is_active: bool | None = None,
    search: SearchQuery = None,
) -> ListQueryParams:
    return ListQueryParams(
        limit=pagination.limit,
        offset=pagination.offset,
        is_active=is_active,
        search=search,
    )

