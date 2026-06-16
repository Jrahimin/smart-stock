import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.database_session import AsyncSessionLocal
from app.modules.admin_email_campaigns.admin_email_campaigns_repository import AdminEmailCampaignsRepository
from app.modules.admin_email_campaigns.admin_email_campaigns_service import AdminEmailCampaignsService
from app.modules.mail.mail_service import MailService
from app.core.core_config import get_settings

logger = logging.getLogger(__name__)

email_campaign_scheduler = AsyncIOScheduler(timezone="UTC")


async def _process_email_campaigns() -> None:
    settings = get_settings()
    async with AsyncSessionLocal() as session:
        service = AdminEmailCampaignsService(
            repository=AdminEmailCampaignsRepository(session),
            mail_service=MailService(settings),
            settings=settings,
        )
        try:
            await service.process_queued_campaigns()
        except Exception:
            logger.exception("Email campaign processor failed")


def start_email_campaign_scheduler() -> None:
    if email_campaign_scheduler.running:
        return
    email_campaign_scheduler.add_job(
        _process_email_campaigns,
        trigger="interval",
        seconds=30,
        id="email-campaign-processor",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    email_campaign_scheduler.start()
    logger.info("Email campaign scheduler started")


def stop_email_campaign_scheduler() -> None:
    if email_campaign_scheduler.running:
        email_campaign_scheduler.shutdown(wait=False)
        logger.info("Email campaign scheduler stopped")
