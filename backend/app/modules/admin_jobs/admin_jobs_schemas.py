from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import SystemJobExecutionStatus, SystemJobTriggerSource, SystemJobType


class SystemJobExecutionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    job_type: SystemJobType
    job_name: str
    dedupe_key: str | None
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

    @field_validator("job_type")
    @classmethod
    def validate_supported_job_type(cls, value: SystemJobType) -> SystemJobType:
        supported_types = {
            SystemJobType.MARKET_SNAPSHOT,
            SystemJobType.MARKET_SYNC,
            SystemJobType.STOCK_DETAILS_SYNC,
            SystemJobType.INDICATORS,
            SystemJobType.SIGNALS,
        }
        if value not in supported_types:
            raise ValueError("This job type is not supported by the operations queue.")
        return value


class SystemJobTriggerResult(BaseModel):
    execution: SystemJobExecutionRead
    deduplicated: bool
