"""Workflow tests: snapshot vs daily enrichment separation."""

from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.enums import ExchangeCode
from app.jobs.ingestion.amarstock_daily_enrichment import (
    PostDailyAmarstockStats,
    run_daily_news_enrichment,
    run_snapshot_market_enrichment,
)
from app.jobs.ingestion.ingest_daily_market_prices import (
    _ingest_with_optional_fallback,
    run_daily_market_sync,
    sync_market_snapshot,
)
from app.jobs.ingestion.ingestion_source_base import MarketDataSource
from app.modules.market_data.market_data_schemas import DailyPriceIngestionResult
from app.modules.market_data.market_data_service import MarketSnapshotCoverageError


@pytest.mark.asyncio
async def test_sync_market_snapshot_runs_snapshot_enrichment_not_news(monkeypatch: pytest.MonkeyPatch) -> None:
    price_result = DailyPriceIngestionResult(
        exchange=ExchangeCode.DSE,
        trade_date=date(2026, 6, 11),
        source="AMARSTOCK_LATEST_PRICE_API",
        fetched_count=100,
        created_count=0,
        skipped_existing_count=100,
        skipped_unknown_symbol_count=0,
        suspicious_count=0,
    )
    enrich_stats = PostDailyAmarstockStats(index_summary_upserted=True)

    mock_service = MagicMock()
    mock_service.ingest_daily_prices = AsyncMock(return_value=price_result)
    mock_service.run_snapshot_enrichment = AsyncMock(return_value=enrich_stats)
    mock_service.run_daily_news_sync = AsyncMock()
    mock_service.publish_market_generation = AsyncMock(return_value="generation-1")

    mock_session = MagicMock()
    mock_session_cm = MagicMock()
    mock_session_cm.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_cm.__aexit__ = AsyncMock(return_value=None)

    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices.AsyncSessionLocal",
        lambda: mock_session_cm,
    )
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices._build_service",
        lambda _session: mock_service,
    )

    result = await sync_market_snapshot(
        date(2026, 6, 11),
        skip_validation=True,
        skip_session_validation=True,
    )

    mock_service.run_snapshot_enrichment.assert_awaited_once()
    mock_service.run_daily_news_sync.assert_not_called()
    mock_service.publish_market_generation.assert_awaited_once()
    assert mock_service.publish_market_generation.await_args.kwargs["accepted_count"] == 100
    assert result.index_summary_upserted is True
    assert result.fetched_count == 100


@pytest.mark.asyncio
async def test_sync_market_snapshot_spawns_rebuild_without_awaiting(monkeypatch: pytest.MonkeyPatch) -> None:
    price_result = DailyPriceIngestionResult(
        exchange=ExchangeCode.DSE,
        trade_date=date(2026, 6, 11),
        source="AMARSTOCK_LATEST_PRICE_API",
        fetched_count=10,
        created_count=10,
        skipped_existing_count=0,
        skipped_unknown_symbol_count=0,
        suspicious_count=0,
    )
    enrich_stats = PostDailyAmarstockStats(index_summary_upserted=True)

    mock_service = MagicMock()
    mock_service.ingest_daily_prices = AsyncMock(return_value=price_result)
    mock_service.run_snapshot_enrichment = AsyncMock(return_value=enrich_stats)
    mock_service.publish_market_generation = AsyncMock(return_value="generation-1")

    mock_session = MagicMock()
    mock_session_cm = MagicMock()
    mock_session_cm.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_cm.__aexit__ = AsyncMock(return_value=None)

    spawn_mock = MagicMock()
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices.AsyncSessionLocal",
        lambda: mock_session_cm,
    )
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices._build_service",
        lambda _session: mock_service,
    )
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices._ingest_with_optional_fallback",
        AsyncMock(return_value=price_result),
    )
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices.spawn_rebuild_market_read_cache",
        spawn_mock,
    )

    result = await sync_market_snapshot(
        date(2026, 6, 11),
        skip_validation=True,
        skip_session_validation=True,
    )

    spawn_mock.assert_called_once()
    assert spawn_mock.call_args.kwargs.get("settings") is not None or len(spawn_mock.call_args.args) >= 1
    assert result.fetched_count == 10


@pytest.mark.asyncio
async def test_manual_snapshot_waits_for_cache_rebuild(monkeypatch: pytest.MonkeyPatch) -> None:
    price_result = DailyPriceIngestionResult(
        exchange=ExchangeCode.DSE,
        trade_date=date(2026, 8, 6),
        source="AMARSTOCK_MARKET_MSGPACK",
        fetched_count=426,
        created_count=425,
        skipped_existing_count=0,
        skipped_unknown_symbol_count=1,
        suspicious_count=0,
    )
    mock_service = MagicMock()
    mock_service.run_snapshot_enrichment = AsyncMock(
        return_value=PostDailyAmarstockStats(index_summary_upserted=True)
    )
    mock_service.publish_market_generation = AsyncMock(return_value="generation-1")
    mock_session_cm = MagicMock()
    mock_session_cm.__aenter__ = AsyncMock(return_value=MagicMock())
    mock_session_cm.__aexit__ = AsyncMock(return_value=None)
    awaited_rebuild = AsyncMock(return_value=True)
    background_spawn = MagicMock()
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices.AsyncSessionLocal",
        lambda: mock_session_cm,
    )
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices._build_service",
        lambda _session: mock_service,
    )
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices._ingest_with_optional_fallback",
        AsyncMock(return_value=price_result),
    )
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices.rebuild_market_read_cache_now",
        awaited_rebuild,
    )
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices.spawn_rebuild_market_read_cache",
        background_spawn,
    )

    result = await sync_market_snapshot(
        date(2026, 8, 6),
        skip_validation=True,
        skip_session_validation=True,
        wait_for_cache_rebuild=True,
    )

    assert result.fetched_count == 426
    assert mock_service.publish_market_generation.await_args.kwargs["accepted_count"] == 425
    awaited_rebuild.assert_awaited_once()
    background_spawn.assert_not_called()


@pytest.mark.asyncio
async def test_run_daily_market_sync_runs_news_not_snapshot_enrichment(monkeypatch: pytest.MonkeyPatch) -> None:
    enrich_stats = PostDailyAmarstockStats(news_upserted=3, news_skipped=1)

    mock_service = MagicMock()
    mock_service.run_daily_news_sync = AsyncMock(return_value=enrich_stats)
    mock_service.run_snapshot_enrichment = AsyncMock()
    mock_service.finalize_market_session = AsyncMock(return_value=True)
    mock_service.publish_finalized_market_generation = AsyncMock(return_value="generation-1")

    mock_session = MagicMock()
    mock_session_cm = MagicMock()
    mock_session_cm.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_cm.__aexit__ = AsyncMock(return_value=None)

    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices.AsyncSessionLocal",
        lambda: mock_session_cm,
    )
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices._build_service",
        lambda _session: mock_service,
    )
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices.sync_market_snapshot",
        AsyncMock(),
    )
    capture_mock = AsyncMock()
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices._capture_market_pulse_session_snapshot",
        capture_mock,
    )

    result = await run_daily_market_sync(
        date(2026, 6, 11),
        include_snapshot=False,
        skip_session_validation=True,
    )

    mock_service.run_daily_news_sync.assert_awaited_once()
    mock_service.run_snapshot_enrichment.assert_not_called()
    assert result.news_upserted == 3
    assert result.news_skipped == 1
    assert result.session_finalized is True
    mock_service.finalize_market_session.assert_awaited_once_with(
        exchange=ExchangeCode.DSE,
        trade_date=date(2026, 6, 11),
    )
    capture_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_snapshot_enrichment_does_not_ingest_news_when_index_disabled() -> None:
    settings = MagicMock()
    settings.amarstock_index_summary_enabled = False

    session = MagicMock()
    stats = await run_snapshot_market_enrichment(
        session,
        exchange=ExchangeCode.DSE,
        trade_date=date(2026, 6, 11),
        settings=settings,
    )
    assert stats.index_summary_upserted is False
    assert stats.news_upserted == 0


class _FailingPrimary(MarketDataSource):
    source_name = "FAILING_PRIMARY"

    async def fetch_daily_prices(self, trade_date: date):
        return []


@pytest.mark.asyncio
async def test_primary_failure_rolls_back_before_fallback() -> None:
    events: list[str] = []
    service = MagicMock()

    async def ingest(**kwargs):
        if kwargs["source"].source_name == "FAILING_PRIMARY":
            events.append("primary")
            raise MarketSnapshotCoverageError("incomplete")
        events.append("fallback")
        return DailyPriceIngestionResult(
            exchange=ExchangeCode.DSE,
            trade_date=date(2026, 8, 6),
            source=kwargs["source"].source_name,
            fetched_count=400,
            created_count=400,
            skipped_existing_count=0,
            skipped_unknown_symbol_count=0,
            suspicious_count=0,
        )

    async def rollback() -> None:
        events.append("rollback")

    service.ingest_daily_prices = AsyncMock(side_effect=ingest)
    service.rollback_transaction = AsyncMock(side_effect=rollback)
    settings = MagicMock()
    settings.daily_market_stocknow_fallback_enabled = True
    settings.market_snapshot_min_active_coverage_percent = 95
    settings.market_snapshot_min_source_symbols = 300

    result = await _ingest_with_optional_fallback(
        service,
        exchange=ExchangeCode.DSE,
        trade_date=date(2026, 8, 6),
        settings=settings,
        source=_FailingPrimary(),
        validation_source=None,
        commit=False,
    )

    assert result.fetched_count == 400
    assert events == ["primary", "rollback", "fallback"]


@pytest.mark.asyncio
async def test_failed_coverage_never_publishes_generation(monkeypatch: pytest.MonkeyPatch) -> None:
    mock_service = MagicMock()
    mock_service.rollback_transaction = AsyncMock()
    mock_service.publish_market_generation = AsyncMock()

    mock_session = MagicMock()
    mock_session_cm = MagicMock()
    mock_session_cm.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_cm.__aexit__ = AsyncMock(return_value=None)

    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices.AsyncSessionLocal",
        lambda: mock_session_cm,
    )
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices._build_service",
        lambda _session: mock_service,
    )
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices._ingest_with_optional_fallback",
        AsyncMock(side_effect=MarketSnapshotCoverageError("incomplete")),
    )

    with pytest.raises(MarketSnapshotCoverageError):
        await sync_market_snapshot(
            date(2026, 8, 6),
            skip_validation=True,
            skip_session_validation=True,
        )

    mock_service.rollback_transaction.assert_awaited_once()
    mock_service.publish_market_generation.assert_not_awaited()


@pytest.mark.asyncio
async def test_failed_dsex_rolls_back_without_generation_or_cache_rebuild(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    price_result = DailyPriceIngestionResult(
        exchange=ExchangeCode.DSE,
        trade_date=date(2026, 8, 6),
        source="AMARSTOCK_MARKET_MSGPACK",
        fetched_count=426,
        created_count=420,
        skipped_existing_count=0,
        skipped_unknown_symbol_count=6,
        suspicious_count=0,
    )
    mock_service = MagicMock()
    mock_service.run_snapshot_enrichment = AsyncMock(
        return_value=PostDailyAmarstockStats(
            index_summary_upserted=False,
            index_summary_error="upstream failed",
        )
    )
    mock_service.rollback_transaction = AsyncMock()
    mock_service.publish_market_generation = AsyncMock()
    mock_session_cm = MagicMock()
    mock_session_cm.__aenter__ = AsyncMock(return_value=MagicMock())
    mock_session_cm.__aexit__ = AsyncMock(return_value=None)
    spawn_mock = MagicMock()
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices.AsyncSessionLocal",
        lambda: mock_session_cm,
    )
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices._build_service",
        lambda _session: mock_service,
    )
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices._ingest_with_optional_fallback",
        AsyncMock(return_value=price_result),
    )
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices.spawn_rebuild_market_read_cache",
        spawn_mock,
    )

    result = await sync_market_snapshot(
        date(2026, 8, 6),
        skip_validation=True,
        skip_session_validation=True,
    )

    assert result.index_summary_upserted is False
    mock_service.rollback_transaction.assert_awaited_once()
    mock_service.publish_market_generation.assert_not_awaited()
    spawn_mock.assert_not_called()


@pytest.mark.asyncio
async def test_daily_news_enrichment_does_not_touch_index_when_news_disabled() -> None:
    settings = MagicMock()
    settings.amarstock_news_ingestion_enabled = False

    session = MagicMock()
    stats = await run_daily_news_enrichment(
        session,
        exchange=ExchangeCode.DSE,
        trade_date=date(2026, 6, 11),
        settings=settings,
    )
    assert stats.news_upserted == 0
    assert stats.index_summary_upserted is False
