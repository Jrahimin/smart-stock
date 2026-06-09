from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies.auth_dependencies import allow_public_access
from app.core.response_handler import ApiResponse, success_response
from app.core.security_config import UserContext
from app.modules.wealth.wealth_calculation_service import WealthCalculationService
from app.modules.wealth.wealth_comparison_service import WealthComparisonService
from app.modules.wealth.wealth_guide_service import WealthGuideService
from app.modules.wealth.wealth_schemas import (
    MoneySnapshotPatch,
    MoneySnapshotRead,
    TaxPlannerCalculateRequest,
    TaxPlannerCalculateResponse,
    WealthComparisonEvaluateRequest,
    WealthComparisonEvaluateResponse,
    WealthDashboardRead,
    WealthScenarioCreate,
    WealthScenarioRead,
    WealthSeasonalContextRead,
    WealthToolCalculateRequest,
    WealthToolCalculateResponse,
)
from app.modules.wealth.tax_planner_service import TaxPlannerService, get_tax_planner_service
from app.modules.wealth.wealth_service import WealthService, get_wealth_service

router = APIRouter(prefix="/wealth", tags=["wealth"])


def get_wealth_calculation_service() -> WealthCalculationService:
    return WealthCalculationService()


def get_wealth_comparison_service() -> WealthComparisonService:
    return WealthComparisonService()


def get_wealth_guide_service() -> WealthGuideService:
    return WealthGuideService()


@router.post("/tools/{tool_slug}/calculate", response_model=ApiResponse[WealthToolCalculateResponse])
async def calculate_wealth_tool(
    tool_slug: str,
    payload: WealthToolCalculateRequest,
    user_context: Annotated[UserContext, Depends(allow_public_access)],
    calculation_service: Annotated[WealthCalculationService, Depends(get_wealth_calculation_service)],
) -> ApiResponse[WealthToolCalculateResponse]:
    del user_context
    result = calculation_service.calculate(tool_slug, payload.inputs, payload.assumptions)
    return success_response(data=result, message="Wealth tool calculated")


@router.post("/tax-planner/calculate", response_model=ApiResponse[TaxPlannerCalculateResponse])
async def calculate_tax_planner(
    payload: TaxPlannerCalculateRequest,
    user_context: Annotated[UserContext, Depends(allow_public_access)],
    tax_planner_service: Annotated[TaxPlannerService, Depends(get_tax_planner_service)],
) -> ApiResponse[TaxPlannerCalculateResponse]:
    del user_context
    result = tax_planner_service.calculate(payload)
    return success_response(data=result, message="Tax planner calculated")


@router.post("/comparisons/{comparison_slug}/evaluate", response_model=ApiResponse[WealthComparisonEvaluateResponse])
async def evaluate_wealth_comparison(
    comparison_slug: str,
    payload: WealthComparisonEvaluateRequest,
    user_context: Annotated[UserContext, Depends(allow_public_access)],
    comparison_service: Annotated[WealthComparisonService, Depends(get_wealth_comparison_service)],
) -> ApiResponse[WealthComparisonEvaluateResponse]:
    del user_context
    result = comparison_service.evaluate(comparison_slug, payload)
    return success_response(data=result, message="Wealth comparison evaluated")


@router.get("/seasonal-context", response_model=ApiResponse[WealthSeasonalContextRead])
async def get_wealth_seasonal_context(
    user_context: Annotated[UserContext, Depends(allow_public_access)],
    guide_service: Annotated[WealthGuideService, Depends(get_wealth_guide_service)],
) -> ApiResponse[WealthSeasonalContextRead]:
    del user_context
    data = guide_service.get_seasonal_context()
    return success_response(data=WealthSeasonalContextRead.model_validate(data), message="Seasonal context retrieved")


@router.get("/snapshot", response_model=ApiResponse[MoneySnapshotRead])
async def get_money_snapshot(
    service: Annotated[WealthService, Depends(get_wealth_service)],
) -> ApiResponse[MoneySnapshotRead]:
    snapshot = await service.get_snapshot()
    return success_response(data=snapshot, message="Money Snapshot retrieved")


@router.patch("/snapshot", response_model=ApiResponse[MoneySnapshotRead])
async def patch_money_snapshot(
    payload: MoneySnapshotPatch,
    service: Annotated[WealthService, Depends(get_wealth_service)],
) -> ApiResponse[MoneySnapshotRead]:
    snapshot = await service.patch_snapshot(payload)
    return success_response(data=snapshot, message="Money Snapshot updated")


@router.get("/dashboard", response_model=ApiResponse[WealthDashboardRead])
async def get_wealth_dashboard(
    service: Annotated[WealthService, Depends(get_wealth_service)],
) -> ApiResponse[WealthDashboardRead]:
    dashboard = await service.get_dashboard()
    return success_response(data=dashboard, message="Wealth dashboard retrieved")


@router.post("/scenarios", response_model=ApiResponse[WealthScenarioRead])
async def save_wealth_scenario(
    payload: WealthScenarioCreate,
    service: Annotated[WealthService, Depends(get_wealth_service)],
) -> ApiResponse[WealthScenarioRead]:
    scenario = await service.save_scenario(payload)
    return success_response(data=scenario, message="Scenario saved")
