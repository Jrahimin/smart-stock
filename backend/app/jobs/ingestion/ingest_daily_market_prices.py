"""Market price ingestion orchestration: intraday snapshots vs daily news sync."""

from __future__ import annotations

import logging
from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.core.core_config import Settings, get_settings
from app.core.enums import ExchangeCode
from app.core.security_config import UserContext
from app.jobs.ingestion.ingestion_source_base import MarketDataSource
from app.jobs.ingestion.market_data_source_factory import (
    build_primary_market_data_source,
    resolve_validation_source,
    should_attempt_stocknow_fallback,
)
from app.jobs.ingestion.stocknow_market_data_source import StockNowMarketDataSource
from app.modules.market_data.market_data_repository import MarketDataRepository
from app.modules.market_data.market_data_schemas import (
    DailyNewsSyncResult,
    DailyPriceIngestionResult,
    MarketSnapshotSyncResult,
)
from app.modules.market_data.market_data_service import MarketDataService
from app.core.database_session import AsyncSessionLocal

logger = logging.getLogger(__name__)
DHAKA_TIMEZONE = ZoneInfo("Asia/Dhaka")


def _build_service(session) -> MarketDataService:
    return MarketDataService(
        repository=MarketDataRepository(session),
        user_context=UserContext(
            user_id="system",
            display_name="System Job",
            is_authenticated=True,
            roles=["system"],
        ),
    )


async def _ingest_with_optional_fallback(
    service: MarketDataService,
    *,
    exchange: ExchangeCode,
    trade_date: date,
    settings: Settings,
    source: MarketDataSource | None = None,
    validation_source: MarketDataSource | None = None,
) -> DailyPriceIngestionResult:
    primary = source or build_primary_market_data_source(settings)
    validation = (
        validation_source
        if validation_source is not None
        else resolve_validation_source(settings)
    )

    primary_error: BaseException | None = None
    try:
        result = await service.ingest_daily_prices(
            exchange=exchange,
            trade_date=trade_date,
            source=primary,
            validation_source=validation,
        )
    except BaseException as exc:
        primary_error = exc
        result = DailyPriceIngestionResult(
            exchange=exchange,
            trade_date=trade_date,
            source=primary.source_name,
            fetched_count=0,
            created_count=0,
            skipped_existing_count=0,
            skipped_unknown_symbol_count=0,
            suspicious_count=0,
        )

    if should_attempt_stocknow_fallback(
        settings,
        primary_count=result.fetched_count,
        primary_error=primary_error,
    ):
        logger.warning(
            "Primary market ingest failed or empty; attempting StockNow fallback: error=%s fetched=%s",
            primary_error,
            result.fetched_count,
        )
        fallback = StockNowMarketDataSource()
        result = await service.ingest_daily_prices(
            exchange=exchange,
            trade_date=trade_date,
            source=fallback,
            validation_source=None,
        )
    elif primary_error is not None:
        raise primary_error

    return result


async def sync_market_snapshot(
    trade_date: date | None = None,
    *,
    exchange: ExchangeCode = ExchangeCode.DSE,
    settings: Settings | None = None,
    skip_validation: bool = False,
) -> MarketSnapshotSyncResult:
    """Intraday snapshot: per-stock prices + DSEX summary (no news)."""
    resolved_settings = settings or get_settings()
    resolved_trade_date = trade_date or datetime.now(DHAKA_TIMEZONE).date()
    validation = None if skip_validation else resolve_validation_source(resolved_settings)

    async with AsyncSessionLocal() as session:
        service = _build_service(session)
        price_result = await _ingest_with_optional_fallback(
            service,
            exchange=exchange,
            trade_date=resolved_trade_date,
            settings=resolved_settings,
            validation_source=validation,
        )
        enrich = await service.run_snapshot_enrichment(
            exchange=exchange,
            trade_date=resolved_trade_date,
        )

    return MarketSnapshotSyncResult(
        exchange=exchange,
        trade_date=resolved_trade_date,
        source=price_result.source,
        fetched_count=price_result.fetched_count,
        created_count=price_result.created_count,
        skipped_unknown_symbol_count=price_result.skipped_unknown_symbol_count,
        suspicious_count=price_result.suspicious_count,
        index_summary_upserted=enrich.index_summary_upserted,
        index_summary_error=enrich.index_summary_error,
    )


async def run_daily_market_sync(
    trade_date: date | None = None,
    *,
    exchange: ExchangeCode = ExchangeCode.DSE,
    settings: Settings | None = None,
    include_snapshot: bool = False,
    skip_validation: bool = False,
) -> DailyNewsSyncResult:
    """Once-per-day orchestration: news ingestion (optional final snapshot)."""
    resolved_settings = settings or get_settings()
    resolved_trade_date = trade_date or datetime.now(DHAKA_TIMEZONE).date()

    if include_snapshot:
        await sync_market_snapshot(
            resolved_trade_date,
            exchange=exchange,
            settings=resolved_settings,
            skip_validation=skip_validation,
        )

    async with AsyncSessionLocal() as session:
        service = _build_service(session)
        enrich = await service.run_daily_news_sync(
            exchange=exchange,
            trade_date=resolved_trade_date,
        )

    return DailyNewsSyncResult(
        exchange=exchange,
        trade_date=resolved_trade_date,
        news_upserted=enrich.news_upserted,
        news_skipped=enrich.news_skipped,
        news_error=enrich.news_error,
    )


async def ingest_daily_market_prices(
    trade_date: date,
    *,
    exchange: ExchangeCode = ExchangeCode.DSE,
    source: MarketDataSource | None = None,
    validation_source: MarketDataSource | None = None,
) -> DailyPriceIngestionResult:
    """Price-only ingest (API / manual); prefer sync_market_snapshot for scheduled work."""
    async with AsyncSessionLocal() as session:
        service = _build_service(session)
        return await _ingest_with_optional_fallback(
            service,
            exchange=exchange,
            trade_date=trade_date,
            settings=get_settings(),
            source=source,
            validation_source=validation_source,
        )
