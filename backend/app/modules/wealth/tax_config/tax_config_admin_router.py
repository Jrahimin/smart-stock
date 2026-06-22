from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies.auth_dependencies import CurrentAdmin, CurrentSuperAdmin
from app.core.response_handler import ApiResponse, success_response
from app.modules.wealth.tax_config.tax_config_schemas import (
    TaxInvestmentCategoriesUpdateRequest,
    TaxInvestmentCategoryRead,
    TaxPlannerAdminConfigRead,
    TaxPlannerConfigScalarsWrite,
    TaxPlannerSlabsUpdateRequest,
)
from app.modules.wealth.tax_config.tax_config_service import TaxConfigService, get_tax_config_service

router = APIRouter(prefix="/admin/tax-planner", tags=["admin tax planner"])


@router.get("/config", response_model=ApiResponse[TaxPlannerAdminConfigRead])
async def get_tax_planner_admin_config(
    service: Annotated[TaxConfigService, Depends(get_tax_config_service)],
    _: CurrentAdmin,
) -> ApiResponse[TaxPlannerAdminConfigRead]:
    row = await service.get_admin_config()
    return success_response(data=row, message="Tax planner config retrieved")


@router.put("/config", response_model=ApiResponse[TaxPlannerAdminConfigRead])
async def update_tax_planner_config(
    payload: TaxPlannerConfigScalarsWrite,
    service: Annotated[TaxConfigService, Depends(get_tax_config_service)],
    actor: CurrentSuperAdmin,
) -> ApiResponse[TaxPlannerAdminConfigRead]:
    row = await service.update_config_scalars(payload, actor=actor)
    return success_response(data=row, message="Tax planner config updated")


@router.put("/slabs", response_model=ApiResponse[TaxPlannerAdminConfigRead])
async def update_tax_planner_slabs(
    payload: TaxPlannerSlabsUpdateRequest,
    service: Annotated[TaxConfigService, Depends(get_tax_config_service)],
    actor: CurrentSuperAdmin,
) -> ApiResponse[TaxPlannerAdminConfigRead]:
    row = await service.update_slabs(payload, actor=actor)
    return success_response(data=row, message="Tax slabs updated")


@router.get("/investment-categories", response_model=ApiResponse[list[TaxInvestmentCategoryRead]])
async def list_tax_investment_categories(
    service: Annotated[TaxConfigService, Depends(get_tax_config_service)],
    _: CurrentAdmin,
) -> ApiResponse[list[TaxInvestmentCategoryRead]]:
    rows = await service.list_investment_categories()
    return success_response(data=rows, message="Investment categories retrieved")


@router.put("/investment-categories", response_model=ApiResponse[list[TaxInvestmentCategoryRead]])
async def update_tax_investment_categories(
    payload: TaxInvestmentCategoriesUpdateRequest,
    service: Annotated[TaxConfigService, Depends(get_tax_config_service)],
    actor: CurrentSuperAdmin,
) -> ApiResponse[list[TaxInvestmentCategoryRead]]:
    rows = await service.update_investment_categories(payload, actor=actor)
    return success_response(data=rows, message="Investment categories updated")
