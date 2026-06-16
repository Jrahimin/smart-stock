import asyncio
import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import Depends
from sqlalchemy import or_, select

from app.core.core_config import Settings, get_settings
from app.core.enums import (
    EmailCampaignRecipientDeliveryStatus,
    EmailCampaignRecipientScope,
    EmailCampaignStatus,
    SystemJobExecutionStatus,
    SystemJobTriggerSource,
    SystemJobType,
    UserRole,
)
from app.core.exception_handlers import AppError, NotFoundError
from app.core.security_config import UserContext
from app.models import EmailCampaign, SystemJobExecution, User
from app.modules.admin_email_campaigns.admin_email_campaigns_repository import (
    AdminEmailCampaignsRepository,
    get_admin_email_campaigns_repository,
)
from app.modules.admin_email_campaigns.admin_email_campaigns_schemas import (
    EmailCampaignAudienceQuery,
    EmailCampaignAudienceUser,
    EmailCampaignCreateRequest,
    EmailCampaignRead,
    EmailCampaignRecipientRead,
)
from app.modules.mail.mail_service import MailService, get_mail_service

logger = logging.getLogger(__name__)
BATCH_SIZE = 25
BATCH_DELAY_SECONDS = 0.5


def _duration_ms(started_at: datetime | None, completed_at: datetime | None) -> int | None:
    if started_at is None or completed_at is None:
        return None
    return int((completed_at - started_at).total_seconds() * 1000)


class AdminEmailCampaignsService:
    def __init__(
        self,
        repository: AdminEmailCampaignsRepository,
        mail_service: MailService,
        settings: Settings,
    ) -> None:
        self.repository = repository
        self.mail_service = mail_service
        self.settings = settings

    async def list_campaigns(self, *, limit: int = 50, offset: int = 0) -> list[EmailCampaignRead]:
        campaigns = await self.repository.list_campaigns(limit=limit, offset=offset)
        return [await self._to_campaign_read(campaign) for campaign in campaigns]

    async def get_campaign(self, campaign_id: UUID) -> EmailCampaignRead:
        campaign = await self._get_campaign_or_404(campaign_id)
        return await self._to_campaign_read(campaign)

    async def preview_audience(self, query: EmailCampaignAudienceQuery) -> list[EmailCampaignAudienceUser]:
        users = await self._query_audience_users(
            role=query.role,
            verified_only=query.verified_only,
            subscribed_only=query.subscribed_only,
            search=query.search,
            limit=query.limit,
        )
        return [EmailCampaignAudienceUser.model_validate(user) for user in users]

    async def count_audience(self, query: EmailCampaignAudienceQuery) -> int:
        users = await self._query_audience_users(
            role=query.role,
            verified_only=query.verified_only,
            subscribed_only=query.subscribed_only,
            search=query.search,
            limit=query.limit,
        )
        return len(users)

    async def create_campaign(
        self,
        *,
        payload: EmailCampaignCreateRequest,
        actor: UserContext,
    ) -> EmailCampaignRead:
        filter_criteria = dict(payload.filter_criteria_json)
        if payload.selected_user_ids:
            filter_criteria["selected_user_ids"] = [str(user_id) for user_id in payload.selected_user_ids]

        campaign = await self.repository.create(
            {
                "subject": payload.subject.strip(),
                "body_text": payload.body_text,
                "body_html": payload.body_html,
                "recipient_scope": payload.recipient_scope,
                "status": EmailCampaignStatus.DRAFT,
                "filter_criteria_json": filter_criteria,
                "created_by_user_id": UUID(actor.user_id),
            }
        )
        await self.repository.commit()
        return await self._to_campaign_read(campaign)

    async def queue_campaign(self, campaign_id: UUID) -> EmailCampaignRead:
        campaign = await self._get_campaign_or_404(campaign_id)
        if campaign.status not in {EmailCampaignStatus.DRAFT, EmailCampaignStatus.FAILED}:
            raise AppError("Only draft or failed campaigns can be queued")

        from app.models import EmailCampaignRecipient

        existing_recipients = await self.repository.session.scalars(
            select(EmailCampaignRecipient).where(EmailCampaignRecipient.campaign_id == campaign.id)
        )
        for recipient in existing_recipients.all():
            await self.repository.session.delete(recipient)
        await self.repository.session.flush()

        recipients = await self._resolve_recipients(campaign)
        if not recipients:
            raise AppError("No recipients matched the selected audience")

        for user in recipients:
            await self.repository.create_recipient(campaign_id=campaign.id, user=user)

        campaign.status = EmailCampaignStatus.QUEUED
        campaign.queued_at = datetime.now(UTC)
        campaign.started_at = None
        campaign.completed_at = None
        campaign.total_recipients = len(recipients)
        campaign.sent_count = 0
        campaign.failed_count = 0
        await self.repository.commit()
        return await self._to_campaign_read(campaign)

    async def list_campaign_recipients(self, campaign_id: UUID) -> list[EmailCampaignRecipientRead]:
        await self._get_campaign_or_404(campaign_id)
        from app.models import EmailCampaignRecipient

        statement = (
            select(EmailCampaignRecipient)
            .where(EmailCampaignRecipient.campaign_id == campaign_id)
            .order_by(EmailCampaignRecipient.created_at.asc())
        )
        result = await self.repository.session.scalars(statement)
        return [EmailCampaignRecipientRead.model_validate(item) for item in result.all()]

    async def process_queued_campaigns(self) -> None:
        campaigns = await self.repository.list_queued_campaigns()
        for campaign in campaigns:
            claimed = await self.repository.claim_campaign(campaign.id)
            if claimed is None:
                continue
            await self.repository.commit()
            await self._process_campaign(claimed)

    async def _process_campaign(self, campaign: EmailCampaign) -> None:
        execution = await self.repository.create_model(
            SystemJobExecution,
            {
                "job_type": SystemJobType.EMAIL_CAMPAIGN,
                "job_name": f"email_campaign:{campaign.id}",
                "status": SystemJobExecutionStatus.RUNNING,
                "trigger_source": SystemJobTriggerSource.SCHEDULER,
                "triggered_by_user_id": campaign.created_by_user_id,
                "started_at": datetime.now(UTC),
                "metadata_json": {"campaign_id": str(campaign.id)},
            },
        )
        campaign.system_job_execution_id = execution.id
        await self.repository.session.flush()

        pending_recipients = await self.repository.list_pending_recipients(campaign.id)
        for recipient in pending_recipients:
            try:
                await self.mail_service.send_email(
                    to_email=recipient.email,
                    subject=campaign.subject,
                    body=campaign.body_text,
                    body_html=campaign.body_html,
                )
                await self.repository.update_recipient_status(
                    recipient,
                    delivery_status=EmailCampaignRecipientDeliveryStatus.SENT,
                )
                campaign.sent_count += 1
            except Exception as exc:
                logger.exception("Failed to send campaign email to %s", recipient.email)
                await self.repository.update_recipient_status(
                    recipient,
                    delivery_status=EmailCampaignRecipientDeliveryStatus.FAILED,
                    error_message=str(exc),
                )
                campaign.failed_count += 1
            await self.repository.session.flush()
            await asyncio.sleep(BATCH_DELAY_SECONDS)

        pending_count = await self.repository.count_recipients_by_status(
            campaign.id,
            EmailCampaignRecipientDeliveryStatus.PENDING,
        )

        if pending_count == 0 and campaign.failed_count == 0:
            final_status = EmailCampaignStatus.SUCCEEDED
            execution_status = SystemJobExecutionStatus.SUCCEEDED
        elif campaign.sent_count > 0:
            final_status = EmailCampaignStatus.PARTIAL
            execution_status = SystemJobExecutionStatus.PARTIAL
        else:
            final_status = EmailCampaignStatus.FAILED
            execution_status = SystemJobExecutionStatus.FAILED

        now = datetime.now(UTC)
        campaign.status = final_status
        campaign.completed_at = now
        execution.status = execution_status
        execution.completed_at = now
        execution.duration_ms = _duration_ms(execution.started_at, now)
        execution.metadata_json = {
            **execution.metadata_json,
            "sent_count": campaign.sent_count,
            "failed_count": campaign.failed_count,
        }
        await self.repository.commit()

    async def _resolve_recipients(self, campaign: EmailCampaign) -> list[User]:
        criteria = campaign.filter_criteria_json
        statement = select(User).where(User.deleted_at.is_(None), User.is_active.is_(True))

        if campaign.recipient_scope == EmailCampaignRecipientScope.ALL_USERS:
            pass
        elif campaign.recipient_scope == EmailCampaignRecipientScope.VERIFIED_USERS:
            statement = statement.where(User.email_verified_at.is_not(None))
        elif campaign.recipient_scope == EmailCampaignRecipientScope.SUBSCRIBED_USERS:
            statement = statement.where(User.email_verified_at.is_not(None))
        elif campaign.recipient_scope == EmailCampaignRecipientScope.NON_ADMIN_USERS:
            statement = statement.where(User.role == UserRole.USER)
        elif campaign.recipient_scope == EmailCampaignRecipientScope.SELECTED_USERS:
            selected_ids = [UUID(value) for value in criteria.get("selected_user_ids", [])]
            if not selected_ids:
                return []
            statement = statement.where(User.id.in_(selected_ids))
        elif campaign.recipient_scope == EmailCampaignRecipientScope.FILTERED_USERS:
            if criteria.get("verified_only"):
                statement = statement.where(User.email_verified_at.is_not(None))
            if criteria.get("subscribed_only"):
                statement = statement.where(User.email_verified_at.is_not(None))
            role_value = criteria.get("role")
            if role_value:
                statement = statement.where(User.role == UserRole(role_value))
            search = criteria.get("search")
            if search:
                pattern = f"%{str(search).strip()}%"
                statement = statement.where(or_(User.email.ilike(pattern), User.display_name.ilike(pattern)))
        else:
            raise AppError("Unsupported recipient scope")

        result = await self.repository.session.scalars(statement.order_by(User.created_at.asc()))
        return list(result.all())

    async def _query_audience_users(
        self,
        *,
        role: str | None,
        verified_only: bool,
        subscribed_only: bool,
        search: str | None,
        limit: int,
    ) -> list[User]:
        statement = select(User).where(User.deleted_at.is_(None), User.is_active.is_(True))
        if verified_only:
            statement = statement.where(User.email_verified_at.is_not(None))
        if subscribed_only:
            statement = statement.where(User.email_verified_at.is_not(None))
        if role and role != "ALL":
            statement = statement.where(User.role == UserRole(role))
        if search:
            pattern = f"%{search.strip()}%"
            statement = statement.where(or_(User.email.ilike(pattern), User.display_name.ilike(pattern)))
        statement = statement.order_by(User.created_at.asc()).limit(limit)
        result = await self.repository.session.scalars(statement)
        return list(result.all())

    async def _get_campaign_or_404(self, campaign_id: UUID) -> EmailCampaign:
        campaign = await self.repository.get_campaign(campaign_id)
        if campaign is None:
            raise NotFoundError("Email campaign was not found")
        return campaign

    async def _to_campaign_read(self, campaign: EmailCampaign) -> EmailCampaignRead:
        return EmailCampaignRead(
            id=campaign.id,
            subject=campaign.subject,
            body_text=campaign.body_text,
            body_html=campaign.body_html,
            recipient_scope=campaign.recipient_scope,
            status=campaign.status,
            filter_criteria_json=campaign.filter_criteria_json,
            created_by_user_id=campaign.created_by_user_id,
            queued_at=campaign.queued_at,
            started_at=campaign.started_at,
            completed_at=campaign.completed_at,
            total_recipients=campaign.total_recipients,
            sent_count=campaign.sent_count,
            failed_count=campaign.failed_count,
            system_job_execution_id=campaign.system_job_execution_id,
            metadata_json=campaign.metadata_json,
            created_at=campaign.created_at,
            updated_at=campaign.updated_at,
        )


def get_admin_email_campaigns_service(
    repository: AdminEmailCampaignsRepository = Depends(get_admin_email_campaigns_repository),
    mail_service: MailService = Depends(get_mail_service),
    settings: Settings = Depends(get_settings),
) -> AdminEmailCampaignsService:
    return AdminEmailCampaignsService(repository, mail_service, settings)
