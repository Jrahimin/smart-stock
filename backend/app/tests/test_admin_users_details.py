from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.enums import UserRole
from app.models import User
from app.modules.admin_users.admin_users_repository import (
    AdminUserPortfolioStats,
    AdminUserSessionStats,
)
from app.modules.admin_users.admin_users_service import AdminUsersService


class FakeAdminUsersRepository:
    def __init__(self, user: User) -> None:
        self.user = user

    async def get_by_id(self, user_id):
        return self.user if user_id == self.user.id else None

    async def list_user_identities(self, user_id):
        assert user_id == self.user.id
        return [
            SimpleNamespace(
                provider="google",
                provider_subject_id="must-not-leak",
                created_at=datetime(2026, 7, 1, tzinfo=UTC),
            )
        ]

    async def get_user_portfolio_stats(self, user_id):
        assert user_id == self.user.id
        return AdminUserPortfolioStats(
            total_watchlisted=4,
            holding_count=2,
            notes_count=1,
            last_updated_at=datetime(2026, 8, 1, tzinfo=UTC),
        )

    async def get_user_session_stats(self, user_id):
        assert user_id == self.user.id
        return AdminUserSessionStats(
            total_count=7,
            successful_count=6,
            failed_count=1,
            revoked_count=2,
            logged_out_count=1,
            latest_login_at=datetime(2026, 8, 2, tzinfo=UTC),
        )


def build_user() -> User:
    now = datetime(2026, 8, 1, tzinfo=UTC)
    return User(
        id=uuid4(),
        email="oauth@example.com",
        password_hash=None,
        display_name="OAuth User",
        mobile_number=None,
        gender=None,
        address=None,
        profile_pic_url="https://example.com/avatar.png",
        is_active=True,
        email_verified_at=now,
        role=UserRole.USER,
        deleted_at=None,
        deleted_by_user_id=None,
        last_seen_ip="127.0.0.1",
        last_seen_user_agent="Test Browser",
        last_seen_at=now,
        portfolio_daily_summary_email_enabled=True,
        preferred_locale="bn",
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_user_details_include_safe_identity_and_portfolio_summaries() -> None:
    user = build_user()
    service = AdminUsersService(
        FakeAdminUsersRepository(user),  # type: ignore[arg-type]
        SimpleNamespace(),  # type: ignore[arg-type]
        SimpleNamespace(),  # type: ignore[arg-type]
    )

    details = await service.get_user_details(user.id)

    assert details.id == user.id
    assert details.has_password is False
    assert [identity.provider for identity in details.identities] == ["google"]
    assert set(details.model_dump()["identities"][0]) == {"provider", "linked_at"}
    assert details.portfolio_summary.has_watchlist is True
    assert details.portfolio_summary.has_holdings is True
    assert details.portfolio_summary.holding_count == 2
    assert details.session_summary.total_count == 7
    assert details.portfolio_daily_summary_email_enabled is True
