from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import SystemJobExecutionStatus, SystemJobTriggerSource, SystemJobType


class SystemJobExecutionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    job_type: SystemJobType
    job_name: str
    status: SystemJobExecutionStatus
    trigger_source: SystemJobTriggerSource
    triggered_by_user_id: UUID | None
    started_at: datetime | None
    completed_at: datetime | None
    duration_ms: int | None
    attempt_count: int
    error_message: str | None
    metadata_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class AdminJobTriggerRequest(BaseModel):
    job_type: SystemJobType
    job_name: str | None = Field(default=None, max_length=120)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SystemJobTriggerResult(BaseModel):
    execution: SystemJobExecutionRead
    result_summary: dict[str, Any]
