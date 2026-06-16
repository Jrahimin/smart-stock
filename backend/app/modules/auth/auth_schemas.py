from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import UserGender, UserRole


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    display_name: str
    mobile_number: str | None = None
    gender: UserGender | None = None
    address: str | None = None
    profile_pic_url: str | None = None
    is_active: bool
    role: UserRole
    email_verified_at: datetime | None
    last_seen_ip: str | None = None
    last_seen_user_agent: str | None = None
    last_seen_at: datetime | None = None
    deleted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class UserUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=160)
    mobile_number: str | None = Field(default=None, max_length=32)
    gender: UserGender | None = None
    address: str | None = Field(default=None, max_length=2000)
    profile_pic_url: str | None = Field(default=None, max_length=500)

    @field_validator("display_name", "mobile_number", "address", "profile_pic_url", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: Any) -> Any:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=160)
    mobile_number: str | None = Field(default=None, max_length=32)
    gender: UserGender | None = None
    address: str | None = Field(default=None, max_length=2000)
    profile_pic_url: str | None = Field(default=None, max_length=500)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @field_validator("display_name", mode="before")
    @classmethod
    def normalize_display_name(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("mobile_number", "address", "profile_pic_url", mode="before")
    @classmethod
    def normalize_optional_register_text(cls, value: Any) -> Any:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    @field_validator("email")
    @classmethod
    def validate_email_shape(cls, value: str) -> str:
        if "@" not in value or value.startswith("@") or value.endswith("@"):
            raise ValueError("A valid email address is required")
        return value


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip().lower()
        return value


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(min_length=32)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=32)


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=32)


class ResendVerificationRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip().lower()
        return value


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class GoogleLoginRequest(BaseModel):
    id_token: str = Field(min_length=16)


class FacebookLoginRequest(BaseModel):
    access_token: str = Field(min_length=16)


class AuthMessage(BaseModel):
    detail: str
