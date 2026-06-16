from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.dependencies.auth_dependencies import CurrentAdmin, CurrentSuperAdmin
from app.core.enums import SystemJobExecutionStatus, SystemJobType
from app.core.response_handler import ApiResponse, success_response
from app.modules.admin_jobs.admin_jobs_schemas import (
    AdminJobTriggerRequest,
    SystemJobExecutionRead,
    SystemJobTriggerResult,
)
from app.modules.admin_jobs.admin_jobs_service import AdminJobsService, get_admin_jobs_service

router = APIRouter(prefix="/admin/jobs", tags=["admin jobs"])


@router.get("/executions", response_model=ApiResponse[list[SystemJobExecutionRead]])
async def list_job_executions(
    service: Annotated[AdminJobsService, Depends(get_admin_jobs_service)],
    _: CurrentAdmin,
    job_type: SystemJobType | None = None,
    status: SystemJobExecutionStatus | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> ApiResponse[list[SystemJobExecutionRead]]:
    executions = await service.list_executions(
        job_type=job_type,
        status=status,
        limit=limit,
        offset=offset,
    )
    return success_response(
        data=[SystemJobExecutionRead.model_validate(item) for item in executions],
        message="System job executions retrieved",
    )


@router.get("/executions/{execution_id}", response_model=ApiResponse[SystemJobExecutionRead])
async def get_job_execution(
    execution_id: UUID,
    service: Annotated[AdminJobsService, Depends(get_admin_jobs_service)],
    _: CurrentAdmin,
) -> ApiResponse[SystemJobExecutionRead]:
    execution = await service.get_execution(execution_id)
    return success_response(
        data=SystemJobExecutionRead.model_validate(execution),
        message="System job execution retrieved",
    )


@router.post("/trigger", response_model=ApiResponse[SystemJobTriggerResult])
async def trigger_job(
    request: AdminJobTriggerRequest,
    service: Annotated[AdminJobsService, Depends(get_admin_jobs_service)],
    actor: CurrentSuperAdmin,
) -> ApiResponse[SystemJobTriggerResult]:
    result = await service.trigger_job(request=request, actor=actor)
    return success_response(data=result, message="Job triggered")
