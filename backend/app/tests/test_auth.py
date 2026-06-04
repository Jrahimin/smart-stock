import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.exception_handlers import AppError
from app.core.security.jwt_service import decode_access_token
from app.core.security.password_service import hash_password, verify_password
from app.core.security.token_hash import hash_token
from app.modules.auth.auth_service import AuthService
from app.modules.auth.social_verifier import SocialUserInfo


class FakeAuthRepository:
    def __init__(self) -> None:
        self.users: dict[str, SimpleNamespace] = {}
        self.users_by_id: dict[object, SimpleNamespace] = {}
        self.identities: dict[tuple[str, str], SimpleNamespace] = {}
        self.refresh_tokens: dict[str, SimpleNamespace] = {}
        self.email_tokens: dict[str, SimpleNamespace] = {}

    async def get_user_by_email(self, email: str):
        return self.users.get(email.lower())

    async def get_user_by_mobile_number(self, mobile_number: str):
        for user in self.users.values():
            if getattr(user, "mobile_number", None) == mobile_number:
                return user
        return None

    async def get_identity(self, *, provider: str, provider_subject_id: str):
        return self.identities.get((provider, provider_subject_id))

    async def create_user(
        self,
        *,
        email: str,
        display_name: str,
        password_hash: str | None,
        email_verified_at,
        mobile_number=None,
        gender=None,
        address=None,
        profile_pic_url=None,
    ):
        user = SimpleNamespace(
            id=uuid4(),
            email=email,
            display_name=display_name,
            password_hash=password_hash,
            email_verified_at=email_verified_at,
            mobile_number=mobile_number,
            gender=gender,
            address=address,
            profile_pic_url=profile_pic_url,
            is_active=True,
        )
        self.users[email.lower()] = user
        self.users_by_id[user.id] = user
        return user

    async def update(self, entity, values: dict[str, object]):
        for field_name, value in values.items():
            setattr(entity, field_name, value)
        return entity

    async def create_identity(self, *, user_id, provider: str, provider_subject_id: str):
        identity = SimpleNamespace(user_id=user_id, provider=provider, provider_subject_id=provider_subject_id)
        self.identities[(provider, provider_subject_id)] = identity
        return identity

    async def create_refresh_token(self, *, user_id, token_hash: str, expires_at):
        token = SimpleNamespace(user_id=user_id, token_hash=token_hash, expires_at=expires_at, revoked_at=None)
        self.refresh_tokens[token_hash] = token
        return token

    async def get_active_refresh_token(self, token_hash: str):
        token = self.refresh_tokens.get(token_hash)
        if token is None or token.revoked_at is not None or token.expires_at <= datetime.now(UTC):
            return None
        return token

    async def revoke_refresh_token(self, token_hash: str):
        token = self.refresh_tokens.get(token_hash)
        if token is not None and token.revoked_at is None:
            token.revoked_at = datetime.now(UTC)

    async def revoke_user_refresh_tokens(self, user_id):
        for token in self.refresh_tokens.values():
            if token.user_id == user_id and token.revoked_at is None:
                token.revoked_at = datetime.now(UTC)

    async def create_email_verification_token(self, *, user_id, token_hash: str, expires_at):
        token = SimpleNamespace(user_id=user_id, token_hash=token_hash, expires_at=expires_at, used_at=None)
        self.email_tokens[token_hash] = token
        return token

    async def get_active_email_verification_token(self, token_hash: str):
        token = self.email_tokens.get(token_hash)
        if token is None or token.used_at is not None or token.expires_at <= datetime.now(UTC):
            return None
        return token

    async def get_by_id(self, user_id):
        return self.users_by_id.get(user_id)

    async def commit(self):
        return None


class FakeMailService:
    def __init__(self) -> None:
        self.verification_tokens: list[str] = []

    async def send_verification_email(self, *, email: str, display_name: str, token: str):
        _ = (email, display_name)
        self.verification_tokens.append(token)


class FakeSocialVerifier:
    def verify_google_id_token(self, raw_token: str) -> SocialUserInfo:
        assert raw_token == "google-token"
        return SocialUserInfo(
            provider="google",
            provider_subject_id="google-subject",
            email="google@example.com",
            display_name="Google User",
        )


def _build_service() -> tuple[AuthService, FakeAuthRepository, FakeMailService]:
    repository = FakeAuthRepository()
    mail_service = FakeMailService()
    settings = SimpleNamespace(jwt_refresh_token_expire_days=30, email_verification_token_expire_hours=24)
    service = AuthService(repository, mail_service, FakeSocialVerifier(), settings)
    return service, repository, mail_service


def test_password_hash_and_verify() -> None:
    password_hash = hash_password("strong-password")
    assert verify_password("strong-password", password_hash)
    assert not verify_password("wrong-password", password_hash)


def test_access_jwt_encode_and_decode_through_login() -> None:
    async def run() -> None:
        service, _, mail_service = _build_service()
        await service.register(email="trader@example.com", password="strong-password", display_name="Trader")
        await service.verify_email(mail_service.verification_tokens[0])
        token_pair = await service.login(email="trader@example.com", password="strong-password")

        payload = decode_access_token(token_pair.access_token)
        assert payload["email"] == "trader@example.com"
        assert payload["type"] == "access"

    asyncio.run(run())


def test_unverified_login_fails_then_verify_allows_login() -> None:
    async def run() -> None:
        service, _, mail_service = _build_service()
        await service.register(email="trader@example.com", password="strong-password", display_name="Trader")

        with pytest.raises(AppError):
            await service.login(email="trader@example.com", password="strong-password")

        await service.verify_email(mail_service.verification_tokens[0])
        token_pair = await service.login(email="trader@example.com", password="strong-password")
        assert token_pair.access_token
        assert token_pair.refresh_token

    asyncio.run(run())


def test_refresh_rotates_and_logout_revokes_refresh_token() -> None:
    async def run() -> None:
        service, repository, mail_service = _build_service()
        await service.register(email="trader@example.com", password="strong-password", display_name="Trader")
        await service.verify_email(mail_service.verification_tokens[0])
        token_pair = await service.login(email="trader@example.com", password="strong-password")

        refreshed_pair = await service.refresh(token_pair.refresh_token)
        assert repository.refresh_tokens[hash_token(token_pair.refresh_token)].revoked_at is not None

        await service.logout(refreshed_pair.refresh_token)
        assert repository.refresh_tokens[hash_token(refreshed_pair.refresh_token)].revoked_at is not None

    asyncio.run(run())


def test_google_login_sets_email_verified() -> None:
    async def run() -> None:
        service, repository, _ = _build_service()
        token_pair = await service.login_with_google("google-token")
        user = await repository.get_user_by_email("google@example.com")

        assert token_pair.access_token
        assert user is not None
        assert user.email_verified_at is not None

    asyncio.run(run())
