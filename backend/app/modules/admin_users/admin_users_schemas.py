from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import UserGender, UserRole


class AdminUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    display_name: str
    mobile_number: str | None
    role: UserRole
    is_active: bool
    email_verified_at: datetime | None
    last_seen_ip: str | None
    last_seen_user_agent: str | None
    last_seen_at: datetime | None
    deleted_at: datetime | None
    deleted_by_user_id: UUID | None
    created_at: datetime
    updated_at: datetime


class AdminUserSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    session_identifier: str
    login_at: datetime
    ip_address: str | None
    device_type: str | None
    browser: str | None
    operating_system: str | None
    user_agent: str | None
    last_activity_at: datetime | None
    logout_at: datetime | None
    revoked_at: datetime | None
    is_successful: bool
    failure_reason: str | None
    created_at: datetime


class AdminUserIdentityRead(BaseModel):
    provider: str
    linked_at: datetime


class AdminUserPortfolioSummaryRead(BaseModel):
    has_watchlist: bool
    has_holdings: bool
    total_watchlisted: int
    holding_count: int
    notes_count: int
    last_updated_at: datetime | None


class AdminUserSessionSummaryRead(BaseModel):
    total_count: int
    successful_count: int
    failed_count: int
    revoked_count: int
    logged_out_count: int
    latest_login_at: datetime | None


class AdminUserDetailsRead(AdminUserRead):
    gender: UserGender | None
    address: str | None
    profile_pic_url: str | None
    portfolio_daily_summary_email_enabled: bool
    preferred_locale: str
    has_password: bool
    identities: list[AdminUserIdentityRead]
    portfolio_summary: AdminUserPortfolioSummaryRead
    session_summary: AdminUserSessionSummaryRead


class AdminUserCreateRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    display_name: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.ADMIN


class AdminUserRoleUpdateRequest(BaseModel):
    role: UserRole


class AdminUserActiveUpdateRequest(BaseModel):
    is_active: bool


class AdminUserFilterParams(BaseModel):
    role: UserRole | None = None
    include_deleted: bool = False


class AdminUserListQuery(BaseModel):
    search: str | None = Field(default=None, max_length=120)
    is_active: bool | None = None
    role: UserRole | None = None
    include_deleted: bool = False
    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0)
