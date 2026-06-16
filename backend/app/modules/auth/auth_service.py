from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import Depends

from app.core.core_config import Settings, get_settings
from app.core.exception_handlers import AppError, ConflictError, NotFoundError, UnauthorizedError
from app.core.security.jwt_service import create_access_token
from app.core.security.password_service import hash_password, verify_password
from app.core.security.token_hash import generate_opaque_token, hash_token
from app.core.security_config import UserContext
from app.models import User
from app.modules.auth.auth_repository import AuthRepository, get_auth_repository
from app.core.enums import UserGender
from app.modules.auth.auth_schemas import TokenPair, UserUpdateRequest
from app.modules.auth.login_client_info import LoginClientInfo
from app.modules.auth.social_verifier import SocialUserInfo, SocialVerifier, get_social_verifier
from app.modules.mail.mail_service import MailService, get_mail_service

LOCAL_PROVIDER = "local"


class AuthService:
    def __init__(
        self,
        repository: AuthRepository,
        mail_service: MailService,
        social_verifier: SocialVerifier,
        settings: Settings,
    ) -> None:
        self.repository = repository
        self.mail_service = mail_service
        self.social_verifier = social_verifier
        self.settings = settings

    async def register(
        self,
        *,
        email: str,
        password: str,
        display_name: str,
        mobile_number: str | None = None,
        gender: UserGender | None = None,
        address: str | None = None,
        profile_pic_url: str | None = None,
    ) -> None:
        existing_user = await self.repository.get_user_by_email(email)
        if existing_user is not None:
            raise ConflictError("A user with this email already exists")

        if mobile_number is not None:
            existing_mobile = await self.repository.get_user_by_mobile_number(mobile_number)
            if existing_mobile is not None:
                raise ConflictError("A user with this mobile number already exists")

        user = await self.repository.create_user(
            email=email,
            display_name=display_name,
            password_hash=hash_password(password),
            email_verified_at=None,
            mobile_number=mobile_number,
            gender=gender,
            address=address,
            profile_pic_url=profile_pic_url,
        )
        await self.repository.create_identity(
            user_id=user.id,
            provider=LOCAL_PROVIDER,
            provider_subject_id=email,
        )
        verification_token = await self._create_email_verification_token(user)
        await self.repository.commit()
        await self.mail_service.send_verification_email(
            email=user.email,
            display_name=user.display_name,
            token=verification_token,
        )

    async def verify_email(self, token: str) -> None:
        token_record = await self.repository.get_active_email_verification_token(hash_token(token))
        if token_record is None:
            raise UnauthorizedError("Email verification token is invalid or expired")

        user = await self.repository.get_by_id(token_record.user_id)
        if user is None:
            raise NotFoundError("User was not found")

        token_record.used_at = datetime.now(UTC)
        user.email_verified_at = datetime.now(UTC)
        await self.repository.commit()

    async def resend_verification(self, email: str) -> None:
        user = await self.repository.get_user_by_email(email)
        if user is None or user.email_verified_at is not None:
            return

        verification_token = await self._create_email_verification_token(user)
        await self.repository.commit()
        await self.mail_service.send_verification_email(
            email=user.email,
            display_name=user.display_name,
            token=verification_token,
        )

    async def login(
        self,
        *,
        email: str,
        password: str,
        client_info: LoginClientInfo | None = None,
    ) -> TokenPair:
        now = datetime.now(UTC)
        user = await self.repository.get_user_by_email(email)
        invalid_credentials = (
            user is None or user.password_hash is None or not verify_password(password, user.password_hash)
        )
        if invalid_credentials:
            await self._record_login_attempt(
                user=user,
                client_info=client_info,
                is_successful=False,
                failure_reason="Invalid email or password",
                login_at=now,
            )
            await self.repository.commit()
            raise UnauthorizedError("Invalid email or password")

        try:
            self._ensure_login_allowed(user)
        except (UnauthorizedError, AppError) as exc:
            await self._record_login_attempt(
                user=user,
                client_info=client_info,
                is_successful=False,
                failure_reason=exc.message,
                login_at=now,
            )
            await self.repository.commit()
            raise

        token_pair = await self._create_token_pair(user, client_info=client_info, login_at=now)
        await self.repository.commit()
        return token_pair

    async def refresh(self, refresh_token: str) -> TokenPair:
        token_hash = hash_token(refresh_token)
        token_record = await self.repository.get_active_refresh_token(token_hash)
        if token_record is None:
            raise UnauthorizedError("Refresh token is invalid or expired")

        user = await self.repository.get_by_id(token_record.user_id)
        if user is None or not user.is_active or user.deleted_at is not None:
            raise UnauthorizedError("Refresh token is invalid or expired")

        await self.repository.revoke_refresh_token(token_hash)
        token_pair = await self._create_token_pair(user)
        await self.repository.commit()
        return token_pair

    async def logout(self, refresh_token: str, *, session_id: str | None = None) -> None:
        await self.repository.revoke_refresh_token(hash_token(refresh_token))
        if session_id:
            await self.repository.revoke_user_session(session_id)
        await self.repository.commit()

    async def get_me(self, user_context: UserContext) -> User:
        user = await self.repository.get_by_id(UUID(user_context.user_id))
        if user is None:
            raise NotFoundError("User was not found")
        return user

    async def update_profile(self, user_context: UserContext, payload: UserUpdateRequest) -> User:
        user = await self.get_me(user_context)
        updates = payload.model_dump(exclude_unset=True)

        if "mobile_number" in updates and updates["mobile_number"] is not None:
            existing_mobile = await self.repository.get_user_by_mobile_number(updates["mobile_number"])
            if existing_mobile is not None and existing_mobile.id != user.id:
                raise ConflictError("A user with this mobile number already exists")

        if updates:
            user = await self.repository.update(user, updates)

        await self.repository.commit()
        return user

    async def change_password(
        self,
        *,
        user_context: UserContext,
        current_password: str,
        new_password: str,
    ) -> None:
        user = await self.get_me(user_context)
        if user.password_hash is None:
            raise AppError("Password is not set. Use set password instead.")
        if not verify_password(current_password, user.password_hash):
            raise UnauthorizedError("Current password is invalid")

        user.password_hash = hash_password(new_password)
        await self.repository.revoke_user_refresh_tokens(user.id)
        await self.repository.commit()

    async def set_password(
        self,
        *,
        user_context: UserContext,
        new_password: str,
    ) -> None:
        user = await self.get_me(user_context)
        if user.password_hash is not None:
            raise ConflictError("Password is already set. Use change password instead.")

        user.password_hash = hash_password(new_password)
        await self.repository.revoke_user_refresh_tokens(user.id)
        await self.repository.commit()

    async def login_with_google(
        self,
        raw_id_token: str,
        *,
        client_info: LoginClientInfo | None = None,
    ) -> TokenPair:
        social_user = self.social_verifier.verify_google_id_token(raw_id_token)
        user = await self._get_or_create_social_user(social_user)
        self._ensure_login_allowed(user)
        token_pair = await self._create_token_pair(user, client_info=client_info, login_at=datetime.now(UTC))
        await self.repository.commit()
        return token_pair

    async def login_with_facebook(
        self,
        access_token: str,
        *,
        client_info: LoginClientInfo | None = None,
    ) -> TokenPair:
        social_user = await self.social_verifier.verify_facebook_access_token(access_token)
        user = await self._get_or_create_social_user(social_user)
        self._ensure_login_allowed(user)
        token_pair = await self._create_token_pair(user, client_info=client_info, login_at=datetime.now(UTC))
        await self.repository.commit()
        return token_pair

    async def _get_or_create_social_user(self, social_user: SocialUserInfo) -> User:
        existing_identity = await self.repository.get_identity(
            provider=social_user.provider,
            provider_subject_id=social_user.provider_subject_id,
        )
        if existing_identity is not None:
            user = await self.repository.get_by_id(existing_identity.user_id)
            if user is None:
                raise NotFoundError("User was not found")
            if user.email_verified_at is None:
                user.email_verified_at = datetime.now(UTC)
            if social_user.profile_pic_url and not user.profile_pic_url:
                user.profile_pic_url = social_user.profile_pic_url
            return user

        email = social_user.email or f"{social_user.provider}-{social_user.provider_subject_id}@users.local"
        user = await self.repository.get_user_by_email(email)
        if user is None:
            user = await self.repository.create_user(
                email=email,
                display_name=social_user.display_name,
                password_hash=None,
                email_verified_at=datetime.now(UTC),
                profile_pic_url=social_user.profile_pic_url,
            )
        elif user.email_verified_at is None:
            user.email_verified_at = datetime.now(UTC)
        elif social_user.profile_pic_url and not user.profile_pic_url:
            user.profile_pic_url = social_user.profile_pic_url

        await self.repository.create_identity(
            user_id=user.id,
            provider=social_user.provider,
            provider_subject_id=social_user.provider_subject_id,
        )
        return user

    async def _create_token_pair(
        self,
        user: User,
        *,
        client_info: LoginClientInfo | None = None,
        login_at: datetime | None = None,
        session_id: str | None = None,
    ) -> TokenPair:
        now = login_at or datetime.now(UTC)
        resolved_session_id = session_id or self.repository.generate_session_identifier()
        if client_info is not None:
            await self._record_login_attempt(
                user=user,
                client_info=client_info,
                is_successful=True,
                failure_reason=None,
                login_at=now,
                session_identifier=resolved_session_id,
            )
        access_token, expires_in = create_access_token(
            user_id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=user.role,
            session_id=resolved_session_id,
        )
        refresh_token = generate_opaque_token()
        refresh_expires_at = now + timedelta(days=self.settings.jwt_refresh_token_expire_days)
        await self.repository.create_refresh_token(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            expires_at=refresh_expires_at,
        )
        return TokenPair(access_token=access_token, refresh_token=refresh_token, expires_in=expires_in)

    async def _record_login_attempt(
        self,
        *,
        user: User | None,
        client_info: LoginClientInfo | None,
        is_successful: bool,
        failure_reason: str | None,
        login_at: datetime,
        session_identifier: str | None = None,
    ) -> None:
        resolved_session_id = session_identifier or self.repository.generate_session_identifier()
        await self.repository.create_user_session(
            user_id=user.id if user is not None else None,
            session_identifier=resolved_session_id,
            login_at=login_at,
            ip_address=client_info.ip_address if client_info else None,
            device_type=client_info.device_type if client_info else None,
            browser=client_info.browser if client_info else None,
            operating_system=client_info.operating_system if client_info else None,
            user_agent=client_info.user_agent if client_info else None,
            is_successful=is_successful,
            failure_reason=failure_reason,
        )
        if is_successful and user is not None and client_info is not None:
            await self.repository.update_user_last_seen(
                user,
                ip_address=client_info.ip_address,
                user_agent=client_info.user_agent,
                seen_at=login_at,
            )

    async def _create_email_verification_token(self, user: User) -> str:
        verification_token = generate_opaque_token()
        expires_at = datetime.now(UTC) + timedelta(hours=self.settings.email_verification_token_expire_hours)
        await self.repository.create_email_verification_token(
            user_id=user.id,
            token_hash=hash_token(verification_token),
            expires_at=expires_at,
        )
        return verification_token

    @staticmethod
    def _ensure_login_allowed(user: User) -> None:
        if user.deleted_at is not None:
            raise UnauthorizedError("User account is inactive")
        if not user.is_active:
            raise UnauthorizedError("User account is inactive")
        if user.email_verified_at is None:
            raise AppError("Email verification is required before login")


def get_auth_service(
    repository: AuthRepository = Depends(get_auth_repository),
    mail_service: MailService = Depends(get_mail_service),
    social_verifier: SocialVerifier = Depends(get_social_verifier),
    settings: Settings = Depends(get_settings),
) -> AuthService:
    return AuthService(repository, mail_service, social_verifier, settings)
