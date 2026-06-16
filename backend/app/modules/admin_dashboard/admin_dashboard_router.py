from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies.auth_dependencies import CurrentAdmin
from app.core.response_handler import ApiResponse, success_response
from app.modules.admin_dashboard.admin_dashboard_schemas import AdminDashboardOverviewRead
from app.modules.admin_dashboard.admin_dashboard_service import AdminDashboardService, get_admin_dashboard_service

router = APIRouter(prefix="/admin/dashboard", tags=["admin dashboard"])


@router.get("", response_model=ApiResponse[AdminDashboardOverviewRead])
async def get_admin_dashboard(
    service: Annotated[AdminDashboardService, Depends(get_admin_dashboard_service)],
    _: CurrentAdmin,
) -> ApiResponse[AdminDashboardOverviewRead]:
    overview = await service.get_overview()
    return success_response(data=overview, message="Admin dashboard retrieved")
