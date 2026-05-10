from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.core.database_session import AsyncSessionLocal
from app.core.enums import ExchangeCode
from app.core.security_config import UserContext
from app.jobs.ingestion.amarstock_market_data_source import AmarStockMarketDataSource
from app.jobs.ingestion.dse_market_data_source import DseMarketDataSource
from app.jobs.ingestion.ingestion_source_base import MarketDataSource
from app.jobs.ingestion.stocknow_market_data_source import StockNowMarketDataSource
from app.modules.market_data.market_data_repository import MarketDataRepository
from app.modules.market_data.market_data_schemas import DailyPriceIngestionResult
from app.modules.market_data.market_data_service import MarketDataService

DHAKA_TIMEZONE = ZoneInfo("Asia/Dhaka")


async def ingest_daily_market_prices(
    trade_date: date,
    *,
    exchange: ExchangeCode = ExchangeCode.DSE,
    source: MarketDataSource | None = None,
    validation_source: MarketDataSource | None = None,
) -> DailyPriceIngestionResult:
    async with AsyncSessionLocal() as session:
        repository = MarketDataRepository(session)
        service = MarketDataService(
            repository=repository,
            user_context=UserContext(
                user_id="system",
                display_name="System Job",
                is_authenticated=True,
                roles=["system"],
            ),
        )
        return await service.ingest_daily_prices(
            exchange=exchange,
            trade_date=trade_date,
            source=source or DseMarketDataSource(),
            validation_source=validation_source,
        )


async def run_daily_market_sync(
    trade_date: date | None = None,
    *,
    skip_validation: bool = False,
    validation_source: MarketDataSource | None = None,
) -> DailyPriceIngestionResult:
    """Ingest AmarStock daily prices with optional StockNow-style validation.

    * If ``skip_validation`` is True, no validation source runs (``validation_source`` is ignored).
    * Otherwise uses ``validation_source`` when passed, defaulting to StockNow when it is omitted.
    """
    resolved_validation: MarketDataSource | None = None
    if not skip_validation:
        resolved_validation = validation_source or StockNowMarketDataSource()

    return await ingest_daily_market_prices(
        trade_date=trade_date or datetime.now(DHAKA_TIMEZONE).date(),
        exchange=ExchangeCode.DSE,
        source=AmarStockMarketDataSource(),
        validation_source=resolved_validation,
    )
