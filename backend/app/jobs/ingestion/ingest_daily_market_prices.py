"""Market price ingestion orchestration: intraday snapshots vs daily news sync."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.core_config import Settings, get_settings
from app.core.database_session import AsyncSessionLocal
from app.core.enums import ExchangeCode
from app.core.enums import MarketDataState
from app.core.redis_client import build_redis_client
from app.core.security_config import UserContext
from app.jobs.ingestion.dse_market_data_source import DseMarketDataSource
from app.jobs.ingestion.ingestion_source_base import MarketDataSource
from app.jobs.ingestion.market_data_source_factory import (
    build_primary_market_data_source,
    resolve_validation_source,
    should_attempt_stocknow_fallback,
)
from app.jobs.ingestion.stocknow_market_data_source import StockNowMarketDataSource
from app.jobs.market_cache_spawn import spawn_rebuild_market_read_cache
from app.jobs.market_session_validation import validate_market_session
from app.modules.market_data.market_data_repository import MarketDataRepository
from app.modules.market_data.market_data_schemas import (
    DailyNewsSyncResult,
    DailyPriceIngestionResult,
    MarketSnapshotSyncResult,
)
from app.modules.market_data.market_data_service import MarketDataService
from app.modules.market_pulse.market_pulse_snapshot_repository import MarketPulseSnapshotRepository
from app.modules.market_pulse.market_pulse_snapshot_service import MarketPulseSnapshotService
from app.modules.market_universe.market_universe_service import MarketUniverseService
from app.modules.stocks.stocks_repository import StocksRepository
from app.modules.trading_intelligence.decision_snapshot_repository import DecisionSnapshotRepository

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


async def _capture_market_pulse_session_snapshot(
    *,
    exchange: ExchangeCode,
    trade_date: date,
    settings: Settings,
) -> None:
    """Capture after finalization in an isolated transaction; failures never undo finality."""

    try:
        async with AsyncSessionLocal() as session:
            redis = build_redis_client(settings)
            universe_service = MarketUniverseService(
                market_repository=MarketDataRepository(session),
                stocks_repository=StocksRepository(session),
                redis=redis,
                settings=settings,
                decision_snapshot_repository=DecisionSnapshotRepository(session),
            )
            capture_service = MarketPulseSnapshotService(
                universe_service=universe_service,
                snapshot_repository=MarketPulseSnapshotRepository(session),
                redis=redis,
            )
            result = await capture_service.capture_finalized_session(
                exchange=exchange,
                session_date=trade_date,
            )
            logger.info(
                "Market Pulse session snapshot %s for %s %s (eligible=%s)",
                result.status,
                exchange.value,
                trade_date,
                result.eligible_candidate_count,
            )
    except Exception:
        logger.exception(
            "Market Pulse session snapshot failed after finalization: exchange=%s trade_date=%s",
            exchange.value,
            trade_date,
        )


async def _ingest_with_optional_fallback(
    service: MarketDataService,
    *,
    exchange: ExchangeCode,
    trade_date: date,
    settings: Settings,
    source: MarketDataSource | None = None,
    validation_source: MarketDataSource | None = None,
    invalidate_market_cache: bool = False,
    commit: bool = True,
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
            invalidate_market_cache=invalidate_market_cache,
            commit=commit,
        )
    except BaseException as exc:
        primary_error = exc
        await service.repository.rollback()
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
            invalidate_market_cache=invalidate_market_cache,
            commit=commit,
        )
    elif primary_error is not None:
        raise primary_error

    return result


def _skipped_snapshot_result(
    *,
    exchange: ExchangeCode,
    trade_date: date,
    reason: str | None,
) -> MarketSnapshotSyncResult:
    return MarketSnapshotSyncResult(
        exchange=exchange,
        trade_date=trade_date,
        source="",
        fetched_count=0,
        created_count=0,
        skipped_unknown_symbol_count=0,
        suspicious_count=0,
        index_summary_upserted=False,
        index_summary_error=None,
        session_skipped=True,
        session_skip_reason=reason,
    )


def _skipped_daily_news_result(
    *,
    exchange: ExchangeCode,
    trade_date: date,
    reason: str | None,
) -> DailyNewsSyncResult:
    return DailyNewsSyncResult(
        exchange=exchange,
        trade_date=trade_date,
        session_skipped=True,
        session_skip_reason=reason,
    )


async def sync_market_snapshot(
    trade_date: date | None = None,
    *,
    exchange: ExchangeCode = ExchangeCode.DSE,
    settings: Settings | None = None,
    skip_validation: bool = False,
    skip_session_validation: bool = False,
) -> MarketSnapshotSyncResult:
    """Intraday snapshot: per-stock prices + DSEX summary (no news)."""
    resolved_settings = settings or get_settings()
    resolved_trade_date = trade_date or datetime.now(DHAKA_TIMEZONE).date()

    if not skip_session_validation:
        session = await validate_market_session(settings=resolved_settings)
        if not session.should_sync:
            spawn_rebuild_market_read_cache(exchange, settings=resolved_settings)
            return _skipped_snapshot_result(
                exchange=exchange,
                trade_date=resolved_trade_date,
                reason=session.reason,
            )
        resolved_trade_date = session.trade_date

    validation = None if skip_validation else resolve_validation_source(resolved_settings)

    async with AsyncSessionLocal() as session:
        service = _build_service(session)
        price_result = await _ingest_with_optional_fallback(
            service,
            exchange=exchange,
            trade_date=resolved_trade_date,
            settings=resolved_settings,
            validation_source=validation,
            invalidate_market_cache=False,
            commit=False,
        )
        enrich = await service.run_snapshot_enrichment(
            exchange=exchange,
            trade_date=resolved_trade_date,
            commit=False,
        )
        if price_result.fetched_count > 0 and enrich.index_summary_upserted:
            await service.publish_market_generation(
                exchange=exchange,
                trade_date=resolved_trade_date,
                state=MarketDataState.LIVE,
                source=price_result.source,
                fetched_count=price_result.fetched_count,
                accepted_count=price_result.created_count,
                suspicious_count=price_result.suspicious_count,
            )
        else:
            # Price rows and DSEX enrichment share this transaction.  If either
            # side is incomplete, keep the prior published generation visible.
            await service.repository.rollback()
            logger.error(
                "Market snapshot was not published: exchange=%s date=%s prices=%s dsex=%s",
                exchange.value,
                resolved_trade_date,
                price_result.fetched_count,
                enrich.index_summary_upserted,
            )

    spawn_rebuild_market_read_cache(exchange, settings=resolved_settings)

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
    skip_session_validation: bool = False,
) -> DailyNewsSyncResult:
    """Once-per-day orchestration: news ingestion (optional final snapshot)."""
    resolved_settings = settings or get_settings()
    resolved_trade_date = trade_date or datetime.now(DHAKA_TIMEZONE).date()

    if not skip_session_validation:
        session_validation = await validate_market_session(settings=resolved_settings)
        if not session_validation.should_sync:
            return _skipped_daily_news_result(
                exchange=exchange,
                trade_date=resolved_trade_date,
                reason=session_validation.reason,
            )
        resolved_trade_date = session_validation.trade_date

    if include_snapshot:
        await sync_market_snapshot(
            resolved_trade_date,
            exchange=exchange,
            settings=resolved_settings,
            skip_validation=skip_validation,
            skip_session_validation=True,
        )

    async with AsyncSessionLocal() as session:
        service = _build_service(session)
        enrich = await service.run_daily_news_sync(
            exchange=exchange,
            trade_date=resolved_trade_date,
        )
        session_finalized = await service.finalize_market_session(
            exchange=exchange,
            trade_date=resolved_trade_date,
        )

    if not session_finalized:
        logger.error(
            "Market session was not finalized because completed price/DSEX inputs are missing: "
            "exchange=%s trade_date=%s",
            exchange.value,
            resolved_trade_date,
        )
    else:
        try:
            async with AsyncSessionLocal() as session:
                service = _build_service(session)
                await service.publish_finalized_market_generation(
                    exchange=exchange,
                    trade_date=resolved_trade_date,
                )
        except Exception:
            # Finalization is the durable market truth.  A generation manifest
            # failure must be visible and retryable, but must never undo it.
            logger.exception(
                "Market session finalized but its publication manifest failed: exchange=%s date=%s",
                exchange.value,
                resolved_trade_date,
            )
        else:
            await _capture_market_pulse_session_snapshot(
                exchange=exchange,
                trade_date=resolved_trade_date,
                settings=resolved_settings,
            )

    spawn_rebuild_market_read_cache(exchange, settings=resolved_settings)

    return DailyNewsSyncResult(
        exchange=exchange,
        trade_date=resolved_trade_date,
        news_upserted=enrich.news_upserted,
        news_skipped=enrich.news_skipped,
        news_error=enrich.news_error,
        session_finalized=session_finalized,
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
        result = await _ingest_with_optional_fallback(
            service,
            exchange=exchange,
            trade_date=trade_date,
            settings=get_settings(),
            source=source,
            validation_source=validation_source,
        )

    return result


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
                invalidate_market_cache=False,
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

    spawn_rebuild_market_read_cache(exchange)
    return _merge_ingestion_results(results)
