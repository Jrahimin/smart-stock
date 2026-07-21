from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.core_config import Settings
from app.core.enums import ExchangeCode, MarketDataState
from app.core.redis_client import OptionalRedisClient
from app.core.security_config import UserContext
from app.modules.mail.mail_service import MailService
from app.modules.mail.portfolio_summary_email import build_portfolio_summary_email
from app.modules.market_data.market_data_repository import MarketDataRepository
from app.modules.market_data.market_data_service import MarketDataService
from app.modules.market_universe.market_universe_service import MarketUniverseService
from app.modules.portfolios.portfolios_repository import PortfoliosRepository
from app.modules.portfolios.portfolios_service import PortfoliosService
from app.modules.stocks.stocks_repository import StocksRepository
from app.modules.trading_intelligence.decision_snapshot_repository import DecisionSnapshotRepository

logger = logging.getLogger(__name__)


def _system_user() -> UserContext:
    return UserContext(
        user_id="system",
        display_name="System Job",
        is_authenticated=True,
        roles=["system"],
    )


def _build_universe_service(
    session: AsyncSession,
    settings: Settings,
    redis: OptionalRedisClient,
) -> MarketUniverseService:
    return MarketUniverseService(
        market_repository=MarketDataRepository(session),
        stocks_repository=StocksRepository(session),
        redis=redis,
        settings=settings,
        decision_snapshot_repository=DecisionSnapshotRepository(session),
    )


async def deliver_portfolio_summary_emails(
    *,
    session: AsyncSession,
    settings: Settings,
    redis: OptionalRedisClient,
) -> None:
    repository = PortfoliosRepository(session)
    market_data_service = MarketDataService(MarketDataRepository(session), _system_user())
    universe_service = _build_universe_service(session, settings, redis)
    freshness = await market_data_service.get_market_freshness(exchange=ExchangeCode.DSE)
    if freshness.data_state not in {MarketDataState.FINALIZED, MarketDataState.FINALIZATION_PENDING}:
        logger.info("Skipping portfolio summary emails; market data is not finalized")
        return

    mail_service = MailService(settings)
    users = await repository.list_users_with_daily_summary_enabled()
    portfolio_url = f"{settings.frontend_base_url.rstrip('/')}/portfolio"

    for user in users:
        try:
            service = PortfoliosService(
                repository=repository,
                user_context=UserContext(
                    user_id=str(user.id),
                    display_name=user.display_name,
                    email=user.email,
                    is_authenticated=True,
                ),
                universe_service=universe_service,
                market_data_service=market_data_service,
            )
            workspace = await service.get_workspace(exchange=ExchangeCode.DSE)
            subject, body, body_html = build_portfolio_summary_email(
                display_name=user.display_name,
                workspace=workspace,
                portfolio_url=portfolio_url,
                locale=user.preferred_locale,
            )
            await mail_service.send_email(
                to_email=user.email,
                subject=subject,
                body=body,
                body_html=body_html,
            )
        except Exception:
            logger.exception("Failed to send portfolio summary email for user %s", user.id)
