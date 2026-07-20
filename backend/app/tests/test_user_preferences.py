import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

from app.core.enums import OnboardingGuideKey, OnboardingGuideState
from app.core.security_config import UserContext
from app.modules.user_preferences.user_preferences_schemas import (
    DashboardSidebarGuidePreferenceWrite,
    WealthDesktopGuidePreferenceWrite,
    WealthMobileGuidePreferenceWrite,
)
from app.modules.user_preferences.user_preferences_service import UserPreferencesService


class FakeUserPreferencesRepository:
    def __init__(self) -> None:
        self.preferences: dict[tuple[object, object], SimpleNamespace] = {}

    async def get_onboarding_guide_preference(self, *, user_id, guide_key):
        return self.preferences.get((user_id, guide_key))

    async def create(self, values: dict[str, object]):
        preference = SimpleNamespace(
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            **values,
        )
        self.preferences[(values["user_id"], values["guide_key"])] = preference
        return preference

    async def update(self, entity, values: dict[str, object]):
        for field_name, value in values.items():
            setattr(entity, field_name, value)
        entity.updated_at = datetime.now(UTC)
        return entity

    async def commit(self):
        return None

    async def refresh(self, entity):
        return None


def _service(repository: FakeUserPreferencesRepository, user_id) -> UserPreferencesService:
    user_context = UserContext(
        user_id=str(user_id),
        display_name="Trader",
        email="trader@example.com",
        is_authenticated=True,
    )
    return UserPreferencesService(repository, user_context)


def test_missing_dashboard_sidebar_guide_preference_returns_not_started_state():
    repository = FakeUserPreferencesRepository()
    service = _service(repository, uuid4())

    async def run():
        preference = await service.get_dashboard_sidebar_guide_preference()
        assert preference.key == OnboardingGuideKey.DASHBOARD_SIDEBAR_GUIDE
        assert preference.state is None
        assert preference.updated_at is None

    asyncio.run(run())


def test_dashboard_sidebar_guide_preference_saves_and_replaces_state():
    repository = FakeUserPreferencesRepository()
    service = _service(repository, uuid4())

    async def run():
        completed = await service.save_dashboard_sidebar_guide_preference(
            DashboardSidebarGuidePreferenceWrite(state=OnboardingGuideState.COMPLETED)
        )
        dismissed = await service.save_dashboard_sidebar_guide_preference(
            DashboardSidebarGuidePreferenceWrite(state=OnboardingGuideState.DISMISSED)
        )

        assert completed.state == OnboardingGuideState.COMPLETED
        assert dismissed.state == OnboardingGuideState.DISMISSED
        assert len(repository.preferences) == 1

    asyncio.run(run())


def test_dashboard_sidebar_guide_preference_is_user_scoped():
    repository = FakeUserPreferencesRepository()
    first_service = _service(repository, uuid4())
    second_service = _service(repository, uuid4())

    async def run():
        await first_service.save_dashboard_sidebar_guide_preference(
            DashboardSidebarGuidePreferenceWrite(state=OnboardingGuideState.COMPLETED)
        )
        second_user_preference = await second_service.get_dashboard_sidebar_guide_preference()

        assert second_user_preference.state is None

    asyncio.run(run())


def test_missing_dashboard_mobile_guide_preference_returns_not_started_state():
    repository = FakeUserPreferencesRepository()
    service = _service(repository, uuid4())

    async def run():
        preference = await service.get_dashboard_mobile_guide_preference()
        assert preference.key == OnboardingGuideKey.DASHBOARD_MOBILE_INTRO
        assert preference.state is None
        assert preference.updated_at is None

    asyncio.run(run())


def test_dashboard_mobile_guide_preference_saves_and_replaces_state():
    repository = FakeUserPreferencesRepository()
    service = _service(repository, uuid4())

    async def run():
        completed = await service.save_dashboard_mobile_guide_preference(
            DashboardSidebarGuidePreferenceWrite(state=OnboardingGuideState.COMPLETED)
        )
        dismissed = await service.save_dashboard_mobile_guide_preference(
            DashboardSidebarGuidePreferenceWrite(state=OnboardingGuideState.DISMISSED)
        )

        assert completed.state == OnboardingGuideState.COMPLETED
        assert dismissed.state == OnboardingGuideState.DISMISSED
        assert len(repository.preferences) == 1

    asyncio.run(run())


def test_wealth_guide_preferences_are_independent_per_surface():
    repository = FakeUserPreferencesRepository()
    service = _service(repository, uuid4())

    async def run():
        desktop = await service.get_wealth_desktop_guide_preference()
        mobile = await service.get_wealth_mobile_guide_preference()
        assert desktop.key == OnboardingGuideKey.WEALTH_OVERVIEW_DESKTOP_GUIDE
        assert mobile.key == OnboardingGuideKey.WEALTH_OVERVIEW_MOBILE_GUIDE
        assert desktop.state is None and mobile.state is None

        await service.save_wealth_desktop_guide_preference(
            WealthDesktopGuidePreferenceWrite(state=OnboardingGuideState.COMPLETED)
        )
        dismissed = await service.save_wealth_mobile_guide_preference(
            WealthMobileGuidePreferenceWrite(state=OnboardingGuideState.DISMISSED)
        )
        assert dismissed.state == OnboardingGuideState.DISMISSED
        assert len(repository.preferences) == 2

    asyncio.run(run())
