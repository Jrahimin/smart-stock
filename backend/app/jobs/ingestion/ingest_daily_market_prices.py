"""Market price ingestion orchestration: intraday snapshots vs daily news sync."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.core_config import Settings, get_settings
from app.core.enums import ExchangeCode
from app.core.security_config import UserContext
from app.jobs.ingestion.dse_market_data_source import DseMarketDataSource
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

    from app.core.redis_client import build_redis_client
    from app.core.market_cache import invalidate_market_caches

    await invalidate_market_caches(
        build_redis_client(resolved_settings),
        exchange,
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


def _merge_ingestion_results(results: list[DailyPriceIngestionResult]) -> DailyPriceIngestionResult:
    if not results:
        raise ValueError("No backfill results to merge")
    first = results[0]
    if len(results) == 1:
        return first
    return DailyPriceIngestionResult(
        exchange=first.exchange,
        trade_date=first.trade_date,
        source=first.source,
        fetched_count=sum(item.fetched_count for item in results),
        created_count=sum(item.created_count for item in results),
        skipped_existing_count=sum(item.skipped_existing_count for item in results),
        skipped_unknown_symbol_count=sum(item.skipped_unknown_symbol_count for item in results),
        suspicious_count=sum(item.suspicious_count for item in results),
    )


async def backfill_daily_prices(
    trade_date: date,
    *,
    end_date: date | None = None,
    exchange: ExchangeCode = ExchangeCode.DSE,
    insert_only: bool = True,
    source: MarketDataSource | None = None,
) -> DailyPriceIngestionResult:
    """Historical OHLCV backfill from the DSE day-end archive (one request per date)."""
    resolved_end = end_date or trade_date
    if resolved_end < trade_date:
        raise ValueError(f"end_date {resolved_end} must be on or after trade_date {trade_date}")

    dse_source = source or DseMarketDataSource.from_settings(get_settings())
    results: list[DailyPriceIngestionResult] = []
    day = trade_date
    while day <= resolved_end:
        async with AsyncSessionLocal() as session:
            service = _build_service(session)
            result = await service.ingest_daily_prices(
                exchange=exchange,
                trade_date=day,
                source=dse_source,
                validation_source=None,
                insert_only=insert_only,
            )
        logger.info(
            "DSE backfill %s: fetched=%s inserted=%s skipped_existing=%s skipped_unknown=%s",
            day.isoformat(),
            result.fetched_count,
            result.created_count,
            result.skipped_existing_count,
            result.skipped_unknown_symbol_count,
        )
        if result.fetched_count == 0:
            logger.warning("No rows parsed for %s (weekend/holiday or DSE archive empty)", day.isoformat())
        results.append(result)
        day += timedelta(days=1)

    return _merge_ingestion_results(results)
