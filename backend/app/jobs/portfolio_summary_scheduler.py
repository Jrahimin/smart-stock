import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.core_config import get_settings
from app.core.database_session import AsyncSessionLocal
from app.core.enums import ExchangeCode, MarketDataState
from app.core.redis_client import build_redis_client
from app.core.security_config import UserContext
from app.jobs.portfolio_summary_delivery import deliver_portfolio_summary_emails

logger = logging.getLogger(__name__)

portfolio_summary_scheduler = AsyncIOScheduler(timezone="Asia/Dhaka")


async def _send_portfolio_summary_emails() -> None:
    settings = get_settings()
    if not settings.portfolio_summary_email_scheduler_enabled:
        return

    async with AsyncSessionLocal() as session:
        redis = build_redis_client(settings)
        await deliver_portfolio_summary_emails(session=session, settings=settings, redis=redis)


def start_portfolio_summary_scheduler() -> None:
    if portfolio_summary_scheduler.running:
        return
    portfolio_summary_scheduler.add_job(
        _send_portfolio_summary_emails,
        trigger="cron",
        hour=16,
        minute=15,
        day_of_week="sun,mon,tue,wed,thu",
        id="portfolio-summary-email",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    portfolio_summary_scheduler.start()
    logger.info("Portfolio summary email scheduler started")


def stop_portfolio_summary_scheduler() -> None:
    if portfolio_summary_scheduler.running:
        portfolio_summary_scheduler.shutdown(wait=False)
        logger.info("Portfolio summary email scheduler stopped")
