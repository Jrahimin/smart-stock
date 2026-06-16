import logging

from app.core.core_config import get_settings
from app.jobs.email_campaign_scheduler import start_email_campaign_scheduler, stop_email_campaign_scheduler
from app.jobs.market_data_scheduler import daily_market_sync_scheduler, market_snapshot_scheduler

logger = logging.getLogger(__name__)


async def start_application_schedulers() -> None:
    settings = get_settings()
    if settings.market_snapshot_scheduler_enabled:
        market_snapshot_scheduler.start()
        logger.info("Market snapshot scheduler started")
    else:
        logger.info("Market snapshot scheduler disabled by configuration")

    if settings.daily_market_sync_scheduler_enabled:
        daily_market_sync_scheduler.start()
        logger.info("Daily market sync scheduler started")
    else:
        logger.info("Daily market sync scheduler disabled by configuration")

    start_email_campaign_scheduler()
    logger.info("Email campaign scheduler started")


async def stop_application_schedulers() -> None:
    logger.info("Stopping email campaign scheduler")
    stop_email_campaign_scheduler()

    logger.info("Stopping market snapshot scheduler")
    await market_snapshot_scheduler.stop()

    logger.info("Stopping daily market sync scheduler")
    await daily_market_sync_scheduler.stop()
