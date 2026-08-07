from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import Depends
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_repository import BaseRepository
from app.core.database_session import get_db_session
from app.core.enums import UserRole
from app.core.pagination import ListQueryParams
from app.models import User, UserIdentity, UserSession, UserWatchlist


@dataclass(frozen=True)
class AdminUserPortfolioStats:
    total_watchlisted: int
    holding_count: int
    notes_count: int
    last_updated_at: datetime | None


@dataclass(frozen=True)
class AdminUserSessionStats:
    total_count: int
    successful_count: int
    failed_count: int
    revoked_count: int
    logged_out_count: int
    latest_login_at: datetime | None


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
        statement = (
            statement.order_by(User.created_at.desc(), User.id.desc())
            .limit(params.limit)
            .offset(params.offset)
        )
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

    async def list_user_sessions(
        self,
        user_id: UUID,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> list[UserSession]:
        statement = (
            select(UserSession)
            .where(UserSession.user_id == user_id)
            .order_by(UserSession.login_at.desc(), UserSession.id.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.scalars(statement)
        return list(result.all())

    async def list_user_identities(self, user_id: UUID) -> list[UserIdentity]:
        statement = (
            select(UserIdentity)
            .where(UserIdentity.user_id == user_id)
            .order_by(UserIdentity.provider.asc(), UserIdentity.created_at.asc())
        )
        result = await self.session.scalars(statement)
        return list(result.all())

    async def get_user_portfolio_stats(self, user_id: UUID) -> AdminUserPortfolioStats:
        statement = select(
            func.count(UserWatchlist.id),
            func.count(UserWatchlist.id).filter(UserWatchlist.is_holding.is_(True)),
            func.count(UserWatchlist.id).filter(UserWatchlist.note.is_not(None)),
            func.max(UserWatchlist.updated_at),
        ).where(UserWatchlist.user_id == user_id)
        row = (await self.session.execute(statement)).one()
        return AdminUserPortfolioStats(
            total_watchlisted=int(row[0] or 0),
            holding_count=int(row[1] or 0),
            notes_count=int(row[2] or 0),
            last_updated_at=row[3],
        )

    async def get_user_session_stats(self, user_id: UUID) -> AdminUserSessionStats:
        statement = select(
            func.count(UserSession.id),
            func.count(UserSession.id).filter(UserSession.is_successful.is_(True)),
            func.count(UserSession.id).filter(UserSession.is_successful.is_(False)),
            func.count(UserSession.id).filter(UserSession.revoked_at.is_not(None)),
            func.count(UserSession.id).filter(UserSession.logout_at.is_not(None)),
            func.max(UserSession.login_at),
        ).where(UserSession.user_id == user_id)
        row = (await self.session.execute(statement)).one()
        return AdminUserSessionStats(
            total_count=int(row[0] or 0),
            successful_count=int(row[1] or 0),
            failed_count=int(row[2] or 0),
            revoked_count=int(row[3] or 0),
            logged_out_count=int(row[4] or 0),
            latest_login_at=row[5],
        )

    async def revoke_user_sessions(self, user_id: UUID) -> None:
        statement = (
            update(UserSession)
            .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        await self.session.execute(statement)
        await self.session.flush()


def get_admin_users_repository(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminUsersRepository:
    return AdminUsersRepository(session)
