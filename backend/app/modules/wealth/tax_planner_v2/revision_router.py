from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth_dependencies import (
    CurrentAdmin,
    CurrentSuperAdmin,
    allow_public_access,
)
from app.core.database_session import get_db_session
from app.core.exception_handlers import UnauthorizedError
from app.core.response_handler import ApiErrorResponse, ApiResponse, success_response
from app.core.security_config import UserContext

from .contracts import CurrentCalculationRequest, TaxCalculationResponse
from .http_controls import TaxPlannerRoute, TaxSettings, require_public_v2
from .revision_contracts import (
    CreateDraft,
    DiscardDraft,
    DiscardResult,
    PreviewDraft,
    PreviewResult,
    PublicConfig,
    PublishDraft,
    RevisionDetail,
    RevisionSummary,
    SaveDraft,
)
from .revision_service import RulesError, TaxPlannerRevisionService, dhaka_today

_COMMON_ERRORS = {
    409: {"model": ApiErrorResponse},
    413: {"model": ApiErrorResponse},
    422: {"model": ApiErrorResponse},
    503: {"model": ApiErrorResponse},
}

public_router = APIRouter(
    prefix="/wealth/tax-planner/v2",
    tags=["tax planner v2"],
    route_class=TaxPlannerRoute,
    dependencies=[Depends(require_public_v2), Depends(allow_public_access)],
    responses=_COMMON_ERRORS,
)
admin_router = APIRouter(
    prefix="/admin/tax-planner/v2",
    tags=["admin tax planner v2"],
    route_class=TaxPlannerRoute,
    responses={
        **_COMMON_ERRORS,
        401: {"model": ApiErrorResponse},
        403: {"model": ApiErrorResponse},
    },
)


def get_revision_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TaxPlannerRevisionService:
    return TaxPlannerRevisionService(session)


RevisionService = Annotated[TaxPlannerRevisionService, Depends(get_revision_service)]
YearQuery = Annotated[str | None, Query(max_length=20)]


def _actor_id(actor: UserContext) -> UUID:
    try:
        return UUID(actor.user_id)
    except ValueError:
        raise UnauthorizedError() from None


@public_router.get("/config", response_model=ApiResponse[PublicConfig])
async def public_config(
    service: RevisionService,
    settings: TaxSettings,
) -> ApiResponse[PublicConfig]:
    result = await service.current_config(
        as_of=dhaka_today(),
        suspended=settings.tax_planner_v2_calculations_suspended,
    )
    return success_response(result, "Tax planner rules retrieved")


@public_router.post("/calculate", response_model=ApiResponse[TaxCalculationResponse])
async def calculate(
    request: CurrentCalculationRequest,
    service: RevisionService,
    settings: TaxSettings,
) -> ApiResponse[TaxCalculationResponse]:
    if settings.tax_planner_v2_calculations_suspended:
        raise RulesError(
            503, "TAX_CALCULATIONS_SUSPENDED", "Tax planner calculations are temporarily suspended"
        )
    result = await service.calculate_current(request, as_of=dhaka_today())
    return success_response(result, "Tax estimate calculated")


@admin_router.get("/rulesets", response_model=ApiResponse[tuple[RevisionSummary, ...]])
async def list_revisions(
    service: RevisionService,
    _: CurrentAdmin,
    assessment_year: YearQuery = None,
) -> ApiResponse[tuple[RevisionSummary, ...]]:
    return success_response(
        await service.list_revisions(assessment_year), "Tax rule revisions retrieved"
    )


@admin_router.get("/rulesets/{revision_id}", response_model=ApiResponse[RevisionDetail])
async def get_revision(
    revision_id: UUID,
    service: RevisionService,
    _: CurrentAdmin,
) -> ApiResponse[RevisionDetail]:
    return success_response(await service.get_revision(revision_id), "Tax rule revision retrieved")


@admin_router.post("/drafts", response_model=ApiResponse[RevisionDetail])
async def create_draft(
    request: CreateDraft,
    service: RevisionService,
    actor: CurrentSuperAdmin,
) -> ApiResponse[RevisionDetail]:
    result = await service.create_draft(request, actor=_actor_id(actor))
    return success_response(result, "Tax rule draft ready")


@admin_router.put("/drafts/{revision_id}", response_model=ApiResponse[RevisionDetail])
async def save_draft(
    revision_id: UUID,
    request: SaveDraft,
    service: RevisionService,
    actor: CurrentSuperAdmin,
) -> ApiResponse[RevisionDetail]:
    result = await service.save_draft(revision_id, request, actor=_actor_id(actor))
    return success_response(result, "Tax rule draft saved")


@admin_router.post("/drafts/{revision_id}/preview", response_model=ApiResponse[PreviewResult])
async def preview_draft(
    revision_id: UUID,
    request: PreviewDraft,
    service: RevisionService,
    _: CurrentSuperAdmin,
) -> ApiResponse[PreviewResult]:
    result = await service.preview_draft(revision_id, request.edit_version, as_of=dhaka_today())
    return success_response(result, "Tax rule draft preview evaluated")


@admin_router.post("/drafts/{revision_id}/discard", response_model=ApiResponse[DiscardResult])
async def discard_draft(
    revision_id: UUID,
    request: DiscardDraft,
    service: RevisionService,
    actor: CurrentSuperAdmin,
) -> ApiResponse[DiscardResult]:
    result = await service.discard_draft(revision_id, request, actor=_actor_id(actor))
    return success_response(result, "Tax rule draft discarded and retained in history")


@admin_router.post("/drafts/{revision_id}/publish", response_model=ApiResponse[RevisionDetail])
async def publish_draft(
    revision_id: UUID,
    request: PublishDraft,
    service: RevisionService,
    actor: CurrentSuperAdmin,
) -> ApiResponse[RevisionDetail]:
    result = await service.publish_draft(
        revision_id,
        request,
        actor=_actor_id(actor),
        as_of=dhaka_today(),
    )
    return success_response(result, "Tax rule revision published")
