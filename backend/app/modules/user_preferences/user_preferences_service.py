from typing import Annotated
from uuid import UUID

from fastapi import Depends

from app.api.dependencies.auth_dependencies import get_current_user
from app.core.enums import OnboardingGuideKey
from app.core.security_config import UserContext
from app.modules.user_preferences.user_preferences_repository import (
    UserPreferencesRepository,
    get_user_preferences_repository,
)
from app.modules.user_preferences.user_preferences_schemas import (
    DashboardMobileGuidePreferenceRead,
    DashboardMobileGuidePreferenceWrite,
    DashboardSidebarGuidePreferenceRead,
    DashboardSidebarGuidePreferenceWrite,
)

DASHBOARD_SIDEBAR_GUIDE_KEY = OnboardingGuideKey.DASHBOARD_SIDEBAR_GUIDE
DASHBOARD_MOBILE_GUIDE_KEY = OnboardingGuideKey.DASHBOARD_MOBILE_INTRO


class UserPreferencesService:
    def __init__(self, repository: UserPreferencesRepository, user_context: UserContext) -> None:
        self.repository = repository
        self.user_context = user_context

    def _user_id(self) -> UUID:
        return UUID(self.user_context.user_id)

    async def get_dashboard_sidebar_guide_preference(self) -> DashboardSidebarGuidePreferenceRead:
        preference = await self.repository.get_onboarding_guide_preference(
            user_id=self._user_id(),
            guide_key=DASHBOARD_SIDEBAR_GUIDE_KEY,
        )
        if preference is None:
            return DashboardSidebarGuidePreferenceRead(
                state=None,
                updated_at=None,
            )
        return DashboardSidebarGuidePreferenceRead(
            state=preference.state,
            updated_at=preference.updated_at,
        )

    async def get_dashboard_mobile_guide_preference(self) -> DashboardMobileGuidePreferenceRead:
        preference = await self.repository.get_onboarding_guide_preference(
            user_id=self._user_id(),
            guide_key=DASHBOARD_MOBILE_GUIDE_KEY,
        )
        if preference is None:
            return DashboardMobileGuidePreferenceRead(
                state=None,
                updated_at=None,
            )
        return DashboardMobileGuidePreferenceRead(
            state=preference.state,
            updated_at=preference.updated_at,
        )

    async def save_dashboard_sidebar_guide_preference(
        self,
        payload: DashboardSidebarGuidePreferenceWrite,
    ) -> DashboardSidebarGuidePreferenceRead:
        preference = await self.repository.get_onboarding_guide_preference(
            user_id=self._user_id(),
            guide_key=DASHBOARD_SIDEBAR_GUIDE_KEY,
        )
        if preference is None:
            preference = await self.repository.create(
                {
                    "user_id": self._user_id(),
                    "guide_key": DASHBOARD_SIDEBAR_GUIDE_KEY,
                    "state": payload.state,
                }
            )
        else:
            preference = await self.repository.update(preference, {"state": payload.state})

        await self.repository.commit()
        await self.repository.refresh(preference)
        return DashboardSidebarGuidePreferenceRead(
            state=preference.state,
            updated_at=preference.updated_at,
        )

    async def save_dashboard_mobile_guide_preference(
        self,
        payload: DashboardMobileGuidePreferenceWrite,
    ) -> DashboardMobileGuidePreferenceRead:
        preference = await self.repository.get_onboarding_guide_preference(
            user_id=self._user_id(),
            guide_key=DASHBOARD_MOBILE_GUIDE_KEY,
        )
        if preference is None:
            preference = await self.repository.create(
                {
                    "user_id": self._user_id(),
                    "guide_key": DASHBOARD_MOBILE_GUIDE_KEY,
                    "state": payload.state,
                }
            )
        else:
            preference = await self.repository.update(preference, {"state": payload.state})

        await self.repository.commit()
        await self.repository.refresh(preference)
        return DashboardMobileGuidePreferenceRead(
            state=preference.state,
            updated_at=preference.updated_at,
        )


def get_user_preferences_service(
    repository: Annotated[
        UserPreferencesRepository,
        Depends(get_user_preferences_repository),
    ],
    user_context: Annotated[UserContext, Depends(get_current_user)],
) -> UserPreferencesService:
    return UserPreferencesService(repository, user_context)
