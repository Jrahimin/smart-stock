from datetime import UTC, datetime
from uuid import UUID

from fastapi import Depends
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_repository import BaseRepository
from app.core.database_session import get_db_session
from app.core.enums import UserGender
from app.models import EmailVerificationToken, RefreshToken, User, UserIdentity


class AuthRepository(BaseRepository[User]):
    model = User

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_user_by_email(self, email: str) -> User | None:
        statement = select(User).where(func.lower(User.email) == email.lower())
        return await self.session.scalar(statement)

    async def get_identity(self, *, provider: str, provider_subject_id: str) -> UserIdentity | None:
        statement = select(UserIdentity).where(
            UserIdentity.provider == provider,
            UserIdentity.provider_subject_id == provider_subject_id,
        )
        return await self.session.scalar(statement)

    async def get_user_by_mobile_number(self, mobile_number: str) -> User | None:
        statement = select(User).where(User.mobile_number == mobile_number)
        return await self.session.scalar(statement)

    async def create_user(
        self,
        *,
        email: str,
        display_name: str,
        password_hash: str | None,
        email_verified_at: datetime | None,
        mobile_number: str | None = None,
        gender: UserGender | None = None,
        address: str | None = None,
        profile_pic_url: str | None = None,
    ) -> User:
        return await self.create(
            {
                "email": email,
                "display_name": display_name,
                "password_hash": password_hash,
                "email_verified_at": email_verified_at,
                "mobile_number": mobile_number,
                "gender": gender,
                "address": address,
                "profile_pic_url": profile_pic_url,
                "is_active": True,
            }
        )

    async def create_identity(self, *, user_id: UUID, provider: str, provider_subject_id: str) -> UserIdentity:
        return await self.create_model(
            UserIdentity,
            {
                "user_id": user_id,
                "provider": provider,
                "provider_subject_id": provider_subject_id,
            },
        )

    async def create_refresh_token(
        self,
        *,
        user_id: UUID,
        token_hash: str,
        expires_at: datetime,
    ) -> RefreshToken:
        return await self.create_model(
            RefreshToken,
            {
                "user_id": user_id,
                "token_hash": token_hash,
                "expires_at": expires_at,
            },
        )

    async def get_active_refresh_token(self, token_hash: str) -> RefreshToken | None:
        now = datetime.now(UTC)
        statement = select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
        )
        return await self.session.scalar(statement)

    async def revoke_refresh_token(self, token_hash: str) -> None:
        statement = (
            update(RefreshToken)
            .where(RefreshToken.token_hash == token_hash, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        await self.session.execute(statement)
        await self.session.flush()

    async def revoke_user_refresh_tokens(self, user_id: UUID) -> None:
        statement = (
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        await self.session.execute(statement)
        await self.session.flush()

    async def create_email_verification_token(
        self,
        *,
        user_id: UUID,
        token_hash: str,
        expires_at: datetime,
    ) -> EmailVerificationToken:
        return await self.create_model(
            EmailVerificationToken,
            {
                "user_id": user_id,
                "token_hash": token_hash,
                "expires_at": expires_at,
            },
        )

    async def get_active_email_verification_token(self, token_hash: str) -> EmailVerificationToken | None:
        now = datetime.now(UTC)
        statement = select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == token_hash,
            EmailVerificationToken.used_at.is_(None),
            EmailVerificationToken.expires_at > now,
        )
        return await self.session.scalar(statement)


def get_auth_repository(session: AsyncSession = Depends(get_db_session)) -> AuthRepository:
    return AuthRepository(session)
