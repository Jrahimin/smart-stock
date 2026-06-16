from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import EmailCampaignRecipientDeliveryStatus, EmailCampaignRecipientScope, EmailCampaignStatus


class EmailCampaignCreateRequest(BaseModel):
    subject: str = Field(min_length=1, max_length=255)
    body_text: str = Field(min_length=1)
    body_html: str | None = None
    recipient_scope: EmailCampaignRecipientScope
    filter_criteria_json: dict[str, Any] = Field(default_factory=dict)
    selected_user_ids: list[UUID] = Field(default_factory=list)


class EmailCampaignAudienceQuery(BaseModel):
    role: str | None = None
    verified_only: bool = False
    subscribed_only: bool = False
    search: str | None = Field(default=None, max_length=120)
    limit: int = Field(default=200, ge=1, le=500)


class EmailCampaignAudienceUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    display_name: str
    role: str
    email_verified_at: datetime | None
    is_active: bool


class EmailCampaignRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    subject: str
    body_text: str
    body_html: str | None
    recipient_scope: EmailCampaignRecipientScope
    status: EmailCampaignStatus
    filter_criteria_json: dict[str, Any]
    created_by_user_id: UUID
    queued_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    total_recipients: int
    sent_count: int
    failed_count: int
    system_job_execution_id: UUID | None
    metadata_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class EmailCampaignRecipientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    campaign_id: UUID
    user_id: UUID | None
    email: str
    display_name: str
    delivery_status: EmailCampaignRecipientDeliveryStatus
    sent_at: datetime | None
    error_message: str | None
    created_at: datetime
