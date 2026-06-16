from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies.auth_dependencies import CurrentAdmin, CurrentSuperAdmin
from app.core.response_handler import ApiResponse, success_response
from app.modules.admin_configuration.admin_configuration_service import (
    AdminConfigSettingRead,
    AdminConfigSettingUpdateRequest,
    AdminConfigurationService,
    get_admin_configuration_service,
)

router = APIRouter(prefix="/admin/configuration", tags=["admin configuration"])


@router.get("", response_model=ApiResponse[list[AdminConfigSettingRead]])
async def list_configuration_settings(
    service: Annotated[AdminConfigurationService, Depends(get_admin_configuration_service)],
    _: CurrentAdmin,
) -> ApiResponse[list[AdminConfigSettingRead]]:
    settings = await service.list_settings()
    return success_response(data=settings, message="Configuration settings retrieved")


@router.put("/{setting_key}", response_model=ApiResponse[AdminConfigSettingRead])
async def update_configuration_setting(
    setting_key: str,
    payload: AdminConfigSettingUpdateRequest,
    service: Annotated[AdminConfigurationService, Depends(get_admin_configuration_service)],
    actor: CurrentSuperAdmin,
) -> ApiResponse[AdminConfigSettingRead]:
    setting = await service.update_setting(setting_key=setting_key, payload=payload, actor=actor)
    return success_response(data=setting, message="Configuration setting updated")
