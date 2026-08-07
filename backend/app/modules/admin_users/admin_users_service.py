from typing import Annotated
from uuid import UUID

from fastapi import Depends

from app.core.enums import ExchangeCode, UserRole
from app.core.exception_handlers import AppError, ForbiddenError, NotFoundError
from app.core.pagination import ListQueryParams
from app.core.security.password_service import hash_password
from app.core.security_config import UserContext
from app.models import User
from app.modules.admin_users.admin_users_repository import (
    AdminUsersRepository,
    get_admin_users_repository,
)
from app.modules.admin_users.admin_users_schemas import (
    AdminUserCreateRequest,
    AdminUserDetailsRead,
    AdminUserIdentityRead,
    AdminUserListQuery,
    AdminUserPortfolioSummaryRead,
    AdminUserRead,
    AdminUserRoleUpdateRequest,
    AdminUserSessionSummaryRead,
)
from app.modules.auth.auth_repository import AuthRepository, get_auth_repository
from app.modules.portfolios.portfolios_schemas import PortfolioWorkspaceRead
from app.modules.portfolios.portfolios_service import PortfoliosService, get_portfolios_service


class AdminUsersService:
    def __init__(
        self,
        repository: AdminUsersRepository,
        auth_repository: AuthRepository,
        portfolios_service: PortfoliosService,
    ) -> None:
        self.repository = repository
        self.auth_repository = auth_repository
        self.portfolios_service = portfolios_service

    async def list_users(self, query: AdminUserListQuery) -> list[User]:
        params = ListQueryParams(
            limit=query.limit,
            offset=query.offset,
            is_active=query.is_active,
            search=query.search,
        )
        return await self.repository.list_users(
            params=params,
            role=query.role,
            include_deleted=query.include_deleted,
        )

    async def get_user(self, user_id: UUID, *, include_deleted: bool = False) -> User:
        user = await self.repository.get_by_id(user_id)
        if user is None or (user.deleted_at is not None and not include_deleted):
            raise NotFoundError("User was not found")
        return user

    async def get_user_details(self, user_id: UUID) -> AdminUserDetailsRead:
        user = await self.get_user(user_id, include_deleted=True)
        identities = await self.repository.list_user_identities(user_id)
        portfolio = await self.repository.get_user_portfolio_stats(user_id)
        sessions = await self.repository.get_user_session_stats(user_id)
        base = AdminUserRead.model_validate(user)
        return AdminUserDetailsRead(
            **base.model_dump(),
            gender=user.gender,
            address=user.address,
            profile_pic_url=user.profile_pic_url,
            portfolio_daily_summary_email_enabled=user.portfolio_daily_summary_email_enabled,
            preferred_locale=user.preferred_locale,
            has_password=user.has_password,
            identities=[
                AdminUserIdentityRead(provider=identity.provider, linked_at=identity.created_at)
                for identity in identities
            ],
            portfolio_summary=AdminUserPortfolioSummaryRead(
                has_watchlist=portfolio.total_watchlisted > 0,
                has_holdings=portfolio.holding_count > 0,
                total_watchlisted=portfolio.total_watchlisted,
                holding_count=portfolio.holding_count,
                notes_count=portfolio.notes_count,
                last_updated_at=portfolio.last_updated_at,
            ),
            session_summary=AdminUserSessionSummaryRead(
                total_count=sessions.total_count,
                successful_count=sessions.successful_count,
                failed_count=sessions.failed_count,
                revoked_count=sessions.revoked_count,
                logged_out_count=sessions.logged_out_count,
                latest_login_at=sessions.latest_login_at,
            ),
        )

    async def get_user_portfolio(
        self,
        user_id: UUID,
        *,
        exchange: ExchangeCode,
    ) -> PortfolioWorkspaceRead:
        await self.get_user(user_id, include_deleted=True)
        return await self.portfolios_service.get_workspace_for_user(
            user_id=user_id,
            exchange=exchange,
        )

    async def set_active_status(self, user_id: UUID, *, is_active: bool) -> User:
        user = await self.get_user(user_id)
        user = await self.repository.update(user, {"is_active": is_active})
        await self.repository.commit()
        await self.repository.refresh(user)
        return user

    async def update_role(
        self,
        user_id: UUID,
        payload: AdminUserRoleUpdateRequest,
        *,
        actor: UserContext,
    ) -> User:
        if UserRole.SUPER_ADMIN.value not in actor.roles:
            raise ForbiddenError("Super admin access is required")
        user = await self.get_user(user_id)
        if user.id == UUID(actor.user_id) and payload.role != UserRole.SUPER_ADMIN:
            raise AppError("You cannot remove your own super admin role")
        user = await self.repository.update(user, {"role": payload.role})
        await self.repository.commit()
        await self.repository.refresh(user)
        return user

    async def soft_delete_user(self, user_id: UUID, *, actor: UserContext) -> User:
        if UserRole.SUPER_ADMIN.value not in actor.roles:
            raise ForbiddenError("Super admin access is required")
        user = await self.get_user(user_id)
        if user.id == UUID(actor.user_id):
            raise AppError("You cannot delete your own account")
        user = await self.repository.soft_delete_user(user, deleted_by_user_id=UUID(actor.user_id))
        await self.auth_repository.revoke_user_refresh_tokens(user.id)
        await self.repository.revoke_user_sessions(user.id)
        await self.repository.commit()
        await self.repository.refresh(user)
        return user

    async def revoke_sessions(self, user_id: UUID) -> None:
        user = await self.get_user(user_id)
        await self.auth_repository.revoke_user_refresh_tokens(user.id)
        await self.repository.revoke_user_sessions(user.id)
        await self.repository.commit()

    async def create_admin_user(
        self,
        payload: AdminUserCreateRequest,
        *,
        actor: UserContext,
    ) -> User:
        if payload.role == UserRole.SUPER_ADMIN:
            raise AppError("Create super admin accounts via the bootstrap seeder")

        existing = await self.auth_repository.get_user_by_email(payload.email.strip().lower())
        if existing is not None:
            raise AppError("A user with this email already exists")

        from datetime import UTC, datetime

        now = datetime.now(UTC)
        user = await self.auth_repository.create_user(
            email=payload.email.strip().lower(),
            display_name=payload.display_name.strip(),
            password_hash=hash_password(payload.password),
            email_verified_at=now,
        )
        await self.auth_repository.create_identity(
            user_id=user.id,
            provider="local",
            provider_subject_id=user.email,
        )
        user.role = payload.role
        user.is_active = True
        await self.repository.commit()
        await self.repository.refresh(user)
        return user

    async def list_user_sessions(self, user_id: UUID, *, limit: int = 50, offset: int = 0):
        await self.get_user(user_id, include_deleted=True)
        return await self.repository.list_user_sessions(user_id, limit=limit, offset=offset)


def get_admin_users_service(
    repository: Annotated[AdminUsersRepository, Depends(get_admin_users_repository)],
    auth_repository: Annotated[AuthRepository, Depends(get_auth_repository)],
    portfolios_service: Annotated[PortfoliosService, Depends(get_portfolios_service)],
) -> AdminUsersService:
    return AdminUsersService(repository, auth_repository, portfolios_service)
