from datetime import datetime

from pydantic import BaseModel

from app.core.enums import OnboardingGuideKey, OnboardingGuideState


class DashboardSidebarGuidePreferenceRead(BaseModel):
    key: OnboardingGuideKey = OnboardingGuideKey.DASHBOARD_SIDEBAR_GUIDE
    state: OnboardingGuideState | None
    updated_at: datetime | None


class DashboardSidebarGuidePreferenceWrite(BaseModel):
    state: OnboardingGuideState
