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
    TaxPlannerDesktopGuidePreferenceRead,
    TaxPlannerDesktopGuidePreferenceWrite,
    TaxPlannerMobileGuidePreferenceRead,
    TaxPlannerMobileGuidePreferenceWrite,
    WealthDesktopGuidePreferenceRead,
    WealthDesktopGuidePreferenceWrite,
    WealthMobileGuidePreferenceRead,
    WealthMobileGuidePreferenceWrite,
)

DASHBOARD_SIDEBAR_GUIDE_KEY = OnboardingGuideKey.DASHBOARD_SIDEBAR_GUIDE
DASHBOARD_MOBILE_GUIDE_KEY = OnboardingGuideKey.DASHBOARD_MOBILE_INTRO
WEALTH_DESKTOP_GUIDE_KEY = OnboardingGuideKey.WEALTH_OVERVIEW_DESKTOP_GUIDE
WEALTH_MOBILE_GUIDE_KEY = OnboardingGuideKey.WEALTH_OVERVIEW_MOBILE_GUIDE
TAX_PLANNER_DESKTOP_GUIDE_KEY = OnboardingGuideKey.TAX_PLANNER_DESKTOP_GUIDE
TAX_PLANNER_MOBILE_GUIDE_KEY = OnboardingGuideKey.TAX_PLANNER_MOBILE_GUIDE


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

    async def get_wealth_desktop_guide_preference(self) -> WealthDesktopGuidePreferenceRead:
        return await self._get_guide_preference(
            WEALTH_DESKTOP_GUIDE_KEY,
            WealthDesktopGuidePreferenceRead,
        )

    async def save_wealth_desktop_guide_preference(
        self, payload: WealthDesktopGuidePreferenceWrite
    ) -> WealthDesktopGuidePreferenceRead:
        return await self._save_guide_preference(
            WEALTH_DESKTOP_GUIDE_KEY,
            payload.state,
            WealthDesktopGuidePreferenceRead,
        )

    async def get_wealth_mobile_guide_preference(self) -> WealthMobileGuidePreferenceRead:
        return await self._get_guide_preference(
            WEALTH_MOBILE_GUIDE_KEY,
            WealthMobileGuidePreferenceRead,
        )

    async def save_wealth_mobile_guide_preference(
        self, payload: WealthMobileGuidePreferenceWrite
    ) -> WealthMobileGuidePreferenceRead:
        return await self._save_guide_preference(
            WEALTH_MOBILE_GUIDE_KEY,
            payload.state,
            WealthMobileGuidePreferenceRead,
        )

    async def get_tax_planner_desktop_guide_preference(
        self,
    ) -> TaxPlannerDesktopGuidePreferenceRead:
        return await self._get_guide_preference(
            TAX_PLANNER_DESKTOP_GUIDE_KEY,
            TaxPlannerDesktopGuidePreferenceRead,
        )

    async def save_tax_planner_desktop_guide_preference(
        self, payload: TaxPlannerDesktopGuidePreferenceWrite
    ) -> TaxPlannerDesktopGuidePreferenceRead:
        return await self._save_guide_preference(
            TAX_PLANNER_DESKTOP_GUIDE_KEY, payload.state, TaxPlannerDesktopGuidePreferenceRead
        )

    async def get_tax_planner_mobile_guide_preference(
        self,
    ) -> TaxPlannerMobileGuidePreferenceRead:
        return await self._get_guide_preference(
            TAX_PLANNER_MOBILE_GUIDE_KEY,
            TaxPlannerMobileGuidePreferenceRead,
        )

    async def save_tax_planner_mobile_guide_preference(
        self, payload: TaxPlannerMobileGuidePreferenceWrite
    ) -> TaxPlannerMobileGuidePreferenceRead:
        return await self._save_guide_preference(
            TAX_PLANNER_MOBILE_GUIDE_KEY, payload.state, TaxPlannerMobileGuidePreferenceRead
        )

    async def _get_guide_preference(self, guide_key: OnboardingGuideKey, response_type):
        preference = await self.repository.get_onboarding_guide_preference(
            user_id=self._user_id(), guide_key=guide_key
        )
        return response_type(
            state=preference.state if preference else None,
            updated_at=preference.updated_at if preference else None,
        )

    async def _save_guide_preference(self, guide_key: OnboardingGuideKey, state, response_type):
        preference = await self.repository.get_onboarding_guide_preference(
            user_id=self._user_id(), guide_key=guide_key
        )
        if preference is None:
            preference = await self.repository.create(
                {"user_id": self._user_id(), "guide_key": guide_key, "state": state}
            )
        else:
            preference = await self.repository.update(preference, {"state": state})
        await self.repository.commit()
        await self.repository.refresh(preference)
        return response_type(state=preference.state, updated_at=preference.updated_at)


def get_user_preferences_service(
    repository: Annotated[
        UserPreferencesRepository,
        Depends(get_user_preferences_repository),
    ],
    user_context: Annotated[UserContext, Depends(get_current_user)],
) -> UserPreferencesService:
    return UserPreferencesService(repository, user_context)
