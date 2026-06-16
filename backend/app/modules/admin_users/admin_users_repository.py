from datetime import UTC, datetime
from uuid import UUID

from fastapi import Depends
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_repository import BaseRepository
from app.core.database_session import get_db_session
from app.core.enums import UserRole
from app.core.pagination import ListQueryParams
from app.models import User, UserSession


class AdminUsersRepository(BaseRepository[User]):
    model = User

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def list_users(
        self,
        *,
        params: ListQueryParams,
        role: UserRole | None = None,
        include_deleted: bool = False,
    ) -> list[User]:
        statement = select(User)
        if not include_deleted:
            statement = statement.where(User.deleted_at.is_(None))
        if params.is_active is not None:
            statement = statement.where(User.is_active == params.is_active)
        if role is not None:
            statement = statement.where(User.role == role)
        if params.search:
            pattern = f"%{params.search.strip()}%"
            statement = statement.where(
                or_(User.email.ilike(pattern), User.display_name.ilike(pattern))
            )
        statement = statement.order_by(User.created_at.desc(), User.id.desc()).limit(params.limit).offset(params.offset)
        result = await self.session.scalars(statement)
        return list(result.all())

    async def count_users(self, *, include_deleted: bool = False) -> int:
        statement = select(func.count()).select_from(User)
        if not include_deleted:
            statement = statement.where(User.deleted_at.is_(None))
        return int(await self.session.scalar(statement) or 0)

    async def count_by_role(self, role: UserRole, *, include_deleted: bool = False) -> int:
        statement = select(func.count()).select_from(User).where(User.role == role)
        if not include_deleted:
            statement = statement.where(User.deleted_at.is_(None))
        return int(await self.session.scalar(statement) or 0)

    async def count_active_users(self, *, active: bool, include_deleted: bool = False) -> int:
        statement = select(func.count()).select_from(User).where(User.is_active == active)
        if not include_deleted:
            statement = statement.where(User.deleted_at.is_(None))
        return int(await self.session.scalar(statement) or 0)

    async def soft_delete_user(self, user: User, *, deleted_by_user_id: UUID) -> User:
        now = datetime.now(UTC)
        return await self.update(
            user,
            {
                "deleted_at": now,
                "deleted_by_user_id": deleted_by_user_id,
                "is_active": False,
            },
        )

    async def list_user_sessions(self, user_id: UUID, *, limit: int = 50, offset: int = 0) -> list[UserSession]:
        statement = (
            select(UserSession)
            .where(UserSession.user_id == user_id)
            .order_by(UserSession.login_at.desc(), UserSession.id.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.scalars(statement)
        return list(result.all())

    async def revoke_user_sessions(self, user_id: UUID) -> None:
        statement = (
            update(UserSession)
            .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        await self.session.execute(statement)
        await self.session.flush()


def get_admin_users_repository(session: AsyncSession = Depends(get_db_session)) -> AdminUsersRepository:
    return AdminUsersRepository(session)
