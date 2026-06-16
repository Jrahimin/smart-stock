from datetime import UTC, datetime
from uuid import UUID

from fastapi import Depends
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_repository import BaseRepository
from app.core.database_session import get_db_session
from app.core.enums import EmailCampaignRecipientDeliveryStatus, EmailCampaignStatus
from app.models import EmailCampaign, EmailCampaignRecipient, User


class AdminEmailCampaignsRepository(BaseRepository[EmailCampaign]):
    model = EmailCampaign

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def list_campaigns(self, *, limit: int = 50, offset: int = 0) -> list[EmailCampaign]:
        statement = (
            select(EmailCampaign)
            .order_by(EmailCampaign.created_at.desc(), EmailCampaign.id.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.scalars(statement)
        return list(result.all())

    async def get_campaign(self, campaign_id: UUID) -> EmailCampaign | None:
        return await self.session.get(EmailCampaign, campaign_id)

    async def list_queued_campaigns(self, *, limit: int = 5) -> list[EmailCampaign]:
        statement = (
            select(EmailCampaign)
            .where(EmailCampaign.status == EmailCampaignStatus.QUEUED)
            .order_by(EmailCampaign.queued_at.asc().nullslast(), EmailCampaign.created_at.asc())
            .limit(limit)
        )
        result = await self.session.scalars(statement)
        return list(result.all())

    async def claim_campaign(self, campaign_id: UUID) -> EmailCampaign | None:
        now = datetime.now(UTC)
        statement = (
            update(EmailCampaign)
            .where(
                EmailCampaign.id == campaign_id,
                EmailCampaign.status == EmailCampaignStatus.QUEUED,
            )
            .values(status=EmailCampaignStatus.RUNNING, started_at=now)
            .returning(EmailCampaign)
        )
        return await self.session.scalar(statement)

    async def list_pending_recipients(self, campaign_id: UUID) -> list[EmailCampaignRecipient]:
        statement = (
            select(EmailCampaignRecipient)
            .where(
                EmailCampaignRecipient.campaign_id == campaign_id,
                EmailCampaignRecipient.delivery_status == EmailCampaignRecipientDeliveryStatus.PENDING,
            )
            .order_by(EmailCampaignRecipient.created_at.asc())
        )
        result = await self.session.scalars(statement)
        return list(result.all())

    async def count_recipients_by_status(
        self,
        campaign_id: UUID,
        delivery_status: EmailCampaignRecipientDeliveryStatus,
    ) -> int:
        statement = (
            select(func.count())
            .select_from(EmailCampaignRecipient)
            .where(
                EmailCampaignRecipient.campaign_id == campaign_id,
                EmailCampaignRecipient.delivery_status == delivery_status,
            )
        )
        return int(await self.session.scalar(statement) or 0)

    async def create_recipient(
        self,
        *,
        campaign_id: UUID,
        user: User,
    ) -> EmailCampaignRecipient:
        return await self.create_model(
            EmailCampaignRecipient,
            {
                "campaign_id": campaign_id,
                "user_id": user.id,
                "email": user.email,
                "display_name": user.display_name,
                "delivery_status": EmailCampaignRecipientDeliveryStatus.PENDING,
            },
        )

    async def update_recipient_status(
        self,
        recipient: EmailCampaignRecipient,
        *,
        delivery_status: EmailCampaignRecipientDeliveryStatus,
        error_message: str | None = None,
    ) -> EmailCampaignRecipient:
        values: dict[str, object] = {"delivery_status": delivery_status}
        if delivery_status == EmailCampaignRecipientDeliveryStatus.SENT:
            values["sent_at"] = datetime.now(UTC)
        if error_message is not None:
            values["error_message"] = error_message
        return await self.update(recipient, values)


def get_admin_email_campaigns_repository(
    session: AsyncSession = Depends(get_db_session),
) -> AdminEmailCampaignsRepository:
    return AdminEmailCampaignsRepository(session)
