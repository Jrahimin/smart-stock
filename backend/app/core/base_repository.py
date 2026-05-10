from collections.abc import Mapping, Sequence
from typing import Any, Generic, TypeVar
from uuid import UUID

from sqlalchemy import Select, case, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database_session import Base
from app.core.pagination import ListQueryParams

ModelT = TypeVar("ModelT", bound=Base)
AnyModelT = TypeVar("AnyModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    model: type[ModelT]

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, entity_id: UUID) -> ModelT | None:
        return await self.session.get(self.model, entity_id)

    async def create(self, values: dict[str, object]) -> ModelT:
        entity = self.model(**values)
        self.session.add(entity)
        await self.session.flush()
        return entity

    async def create_model(self, model: type[AnyModelT], values: dict[str, object]) -> AnyModelT:
        entity = model(**values)
        self.session.add(entity)
        await self.session.flush()
        return entity

    async def update(self, entity: ModelT, values: dict[str, object]) -> ModelT:
        for field_name, value in values.items():
            setattr(entity, field_name, value)
        await self.session.flush()
        return entity

    async def list_filtered(
        self,
        *,
        params: ListQueryParams,
        exact_filters: Mapping[str, object | None] | None = None,
        search_columns: Sequence[Any] = (),
        order_by: Sequence[Any] = (),
    ) -> list[ModelT]:
        statement = select(self.model)
        statement = self._apply_exact_filters(statement, exact_filters)
        statement = self._apply_active_filter(statement, params.is_active)
        statement = self._apply_search_filter(statement, params.search, search_columns)
        statement = self._apply_ordering_and_pagination(
            statement,
            order_by=order_by,
            limit=params.limit,
            offset=params.offset,
        )

        result = await self.session.scalars(statement)
        return list(result.all())

    async def toggle_boolean_by_id(self, entity_id: UUID, field_name: str) -> ModelT | None:
        field = getattr(self.model, field_name)
        statement = (
            update(self.model)
            .where(self.model.id == entity_id)
            .values({field_name: case((field.is_(True), False), else_=True)})
            .returning(self.model)
        )
        return await self.session.scalar(statement)

    async def delete(self, entity: ModelT) -> None:
        await self.session.delete(entity)
        await self.session.flush()

    async def commit(self) -> None:
        await self.session.commit()

    async def refresh(self, entity: ModelT) -> None:
        await self.session.refresh(entity)

    def _apply_exact_filters(
        self,
        statement: Select[tuple[ModelT]],
        exact_filters: Mapping[str, object | None] | None,
    ) -> Select[tuple[ModelT]]:
        if exact_filters is None:
            return statement

        for field_name, value in exact_filters.items():
            if value is not None:
                statement = statement.where(getattr(self.model, field_name) == value)
        return statement

    def _apply_active_filter(
        self,
        statement: Select[tuple[ModelT]],
        is_active: bool | None,
    ) -> Select[tuple[ModelT]]:
        if is_active is None:
            return statement
        return statement.where(getattr(self.model, "is_active") == is_active)

    def _apply_search_filter(
        self,
        statement: Select[tuple[ModelT]],
        search: str | None,
        search_columns: Sequence[Any],
    ) -> Select[tuple[ModelT]]:
        normalized_search = search.strip() if search is not None else None
        if normalized_search is None or normalized_search == "" or not search_columns:
            return statement

        search_pattern = f"%{normalized_search}%"
        return statement.where(or_(*(column.ilike(search_pattern) for column in search_columns)))

    def _apply_ordering_and_pagination(
        self,
        statement: Select[tuple[ModelT]],
        *,
        order_by: Sequence[Any],
        limit: int,
        offset: int,
    ) -> Select[tuple[ModelT]]:
        if order_by:
            statement = statement.order_by(*order_by)
        return statement.limit(limit).offset(offset)

