from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.response_handler import ApiResponse, success_response
from app.modules.user_preferences.user_preferences_schemas import (
    DashboardMobileGuidePreferenceRead,
    DashboardMobileGuidePreferenceWrite,
    DashboardSidebarGuidePreferenceRead,
    DashboardSidebarGuidePreferenceWrite,
)
from app.modules.user_preferences.user_preferences_service import (
    UserPreferencesService,
    get_user_preferences_service,
)

router = APIRouter(prefix="/preferences", tags=["preferences"])


@router.get(
    "/dashboard-sidebar-guide",
    response_model=ApiResponse[DashboardSidebarGuidePreferenceRead],
)
async def get_dashboard_sidebar_guide_preference(
    service: Annotated[UserPreferencesService, Depends(get_user_preferences_service)],
) -> ApiResponse[DashboardSidebarGuidePreferenceRead]:
    preference = await service.get_dashboard_sidebar_guide_preference()
    return success_response(data=preference, message="Dashboard sidebar guide preference retrieved")


@router.put(
    "/dashboard-sidebar-guide",
    response_model=ApiResponse[DashboardSidebarGuidePreferenceRead],
)
async def save_dashboard_sidebar_guide_preference(
    payload: DashboardSidebarGuidePreferenceWrite,
    service: Annotated[UserPreferencesService, Depends(get_user_preferences_service)],
) -> ApiResponse[DashboardSidebarGuidePreferenceRead]:
    preference = await service.save_dashboard_sidebar_guide_preference(payload)
    return success_response(data=preference, message="Dashboard sidebar guide preference saved")


@router.get(
    "/dashboard-mobile-guide",
    response_model=ApiResponse[DashboardMobileGuidePreferenceRead],
)
async def get_dashboard_mobile_guide_preference(
    service: Annotated[UserPreferencesService, Depends(get_user_preferences_service)],
) -> ApiResponse[DashboardMobileGuidePreferenceRead]:
    preference = await service.get_dashboard_mobile_guide_preference()
    return success_response(data=preference, message="Dashboard mobile guide preference retrieved")


@router.put(
    "/dashboard-mobile-guide",
    response_model=ApiResponse[DashboardMobileGuidePreferenceRead],
)
async def save_dashboard_mobile_guide_preference(
    payload: DashboardMobileGuidePreferenceWrite,
    service: Annotated[UserPreferencesService, Depends(get_user_preferences_service)],
) -> ApiResponse[DashboardMobileGuidePreferenceRead]:
    preference = await service.save_dashboard_mobile_guide_preference(payload)
    return success_response(data=preference, message="Dashboard mobile guide preference saved")
