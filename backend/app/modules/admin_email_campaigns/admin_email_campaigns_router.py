from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.dependencies.auth_dependencies import CurrentAdmin
from app.core.response_handler import ApiResponse, success_response
from app.modules.admin_email_campaigns.admin_email_campaigns_schemas import (
    EmailCampaignAudienceQuery,
    EmailCampaignAudienceUser,
    EmailCampaignCreateRequest,
    EmailCampaignRead,
    EmailCampaignRecipientRead,
)
from app.modules.admin_email_campaigns.admin_email_campaigns_service import (
    AdminEmailCampaignsService,
    get_admin_email_campaigns_service,
)

router = APIRouter(tags=["admin email campaigns"])


@router.get("/admin/email-campaigns", response_model=ApiResponse[list[EmailCampaignRead]])
async def list_email_campaigns(
    service: Annotated[AdminEmailCampaignsService, Depends(get_admin_email_campaigns_service)],
    _: CurrentAdmin,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> ApiResponse[list[EmailCampaignRead]]:
    campaigns = await service.list_campaigns(limit=limit, offset=offset)
    return success_response(data=campaigns, message="Email campaigns retrieved")


@router.get("/admin/email-campaigns/audience-preview", response_model=ApiResponse[list[EmailCampaignAudienceUser]])
async def preview_email_campaign_audience(
    service: Annotated[AdminEmailCampaignsService, Depends(get_admin_email_campaigns_service)],
    _: CurrentAdmin,
    role: str | None = Query(default=None),
    verified_only: bool = Query(default=False),
    subscribed_only: bool = Query(default=False),
    search: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=200, ge=1, le=500),
) -> ApiResponse[list[EmailCampaignAudienceUser]]:
    audience = await service.preview_audience(
        EmailCampaignAudienceQuery(
            role=role,
            verified_only=verified_only,
            subscribed_only=subscribed_only,
            search=search,
            limit=limit,
        )
    )
    return success_response(data=audience, message="Email campaign audience preview retrieved")


@router.get("/admin/email-campaigns/{campaign_id}", response_model=ApiResponse[EmailCampaignRead])
async def get_email_campaign(
    campaign_id: UUID,
    service: Annotated[AdminEmailCampaignsService, Depends(get_admin_email_campaigns_service)],
    _: CurrentAdmin,
) -> ApiResponse[EmailCampaignRead]:
    campaign = await service.get_campaign(campaign_id)
    return success_response(data=campaign, message="Email campaign retrieved")


@router.get(
    "/admin/email-campaigns/{campaign_id}/recipients",
    response_model=ApiResponse[list[EmailCampaignRecipientRead]],
)
async def list_email_campaign_recipients(
    campaign_id: UUID,
    service: Annotated[AdminEmailCampaignsService, Depends(get_admin_email_campaigns_service)],
    _: CurrentAdmin,
) -> ApiResponse[list[EmailCampaignRecipientRead]]:
    recipients = await service.list_campaign_recipients(campaign_id)
    return success_response(data=recipients, message="Email campaign recipients retrieved")


@router.post("/admin/email-campaigns", response_model=ApiResponse[EmailCampaignRead])
async def create_email_campaign(
    payload: EmailCampaignCreateRequest,
    service: Annotated[AdminEmailCampaignsService, Depends(get_admin_email_campaigns_service)],
    actor: CurrentAdmin,
) -> ApiResponse[EmailCampaignRead]:
    campaign = await service.create_campaign(payload=payload, actor=actor)
    return success_response(data=campaign, message="Email campaign created")


@router.post("/admin/email-campaigns/{campaign_id}/queue", response_model=ApiResponse[EmailCampaignRead])
async def queue_email_campaign(
    campaign_id: UUID,
    service: Annotated[AdminEmailCampaignsService, Depends(get_admin_email_campaigns_service)],
    _: CurrentAdmin,
) -> ApiResponse[EmailCampaignRead]:
    campaign = await service.queue_campaign(campaign_id)
    return success_response(data=campaign, message="Email campaign queued")
