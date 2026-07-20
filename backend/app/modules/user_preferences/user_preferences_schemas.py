from datetime import datetime

from pydantic import BaseModel

from app.core.enums import OnboardingGuideKey, OnboardingGuideState


class DashboardSidebarGuidePreferenceRead(BaseModel):
    key: OnboardingGuideKey = OnboardingGuideKey.DASHBOARD_SIDEBAR_GUIDE
    state: OnboardingGuideState | None
    updated_at: datetime | None


class DashboardSidebarGuidePreferenceWrite(BaseModel):
    state: OnboardingGuideState


class DashboardMobileGuidePreferenceRead(BaseModel):
    key: OnboardingGuideKey = OnboardingGuideKey.DASHBOARD_MOBILE_INTRO
    state: OnboardingGuideState | None
    updated_at: datetime | None


class DashboardMobileGuidePreferenceWrite(BaseModel):
    state: OnboardingGuideState


class WealthDesktopGuidePreferenceRead(BaseModel):
    key: OnboardingGuideKey = OnboardingGuideKey.WEALTH_OVERVIEW_DESKTOP_GUIDE
    state: OnboardingGuideState | None
    updated_at: datetime | None


class WealthDesktopGuidePreferenceWrite(BaseModel):
    state: OnboardingGuideState


class WealthMobileGuidePreferenceRead(BaseModel):
    key: OnboardingGuideKey = OnboardingGuideKey.WEALTH_OVERVIEW_MOBILE_GUIDE
    state: OnboardingGuideState | None
    updated_at: datetime | None


class WealthMobileGuidePreferenceWrite(BaseModel):
    state: OnboardingGuideState
