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
from app.jobs.ingestion.ingest_daily_market_prices import run_daily_market_sync, sync_market_snapshot
from app.modules.market_data.market_data_schemas import DailyPriceIngestionResult


@pytest.mark.asyncio
async def test_sync_market_snapshot_runs_snapshot_enrichment_not_news(monkeypatch: pytest.MonkeyPatch) -> None:
    price_result = DailyPriceIngestionResult(
        exchange=ExchangeCode.DSE,
        trade_date=date(2026, 6, 11),
        source="AMARSTOCK_LATEST_PRICE_API",
        fetched_count=100,
        created_count=100,
        skipped_existing_count=0,
        skipped_unknown_symbol_count=0,
        suspicious_count=0,
    )
    enrich_stats = PostDailyAmarstockStats(index_summary_upserted=True)

    mock_service = MagicMock()
    mock_service.ingest_daily_prices = AsyncMock(return_value=price_result)
    mock_service.run_snapshot_enrichment = AsyncMock(return_value=enrich_stats)
    mock_service.run_daily_news_sync = AsyncMock()

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

    result = await sync_market_snapshot(date(2026, 6, 11), skip_validation=True)

    mock_service.run_snapshot_enrichment.assert_awaited_once()
    mock_service.run_daily_news_sync.assert_not_called()
    assert result.index_summary_upserted is True
    assert result.fetched_count == 100


@pytest.mark.asyncio
async def test_run_daily_market_sync_runs_news_not_snapshot_enrichment(monkeypatch: pytest.MonkeyPatch) -> None:
    enrich_stats = PostDailyAmarstockStats(news_upserted=3, news_skipped=1)

    mock_service = MagicMock()
    mock_service.run_daily_news_sync = AsyncMock(return_value=enrich_stats)
    mock_service.run_snapshot_enrichment = AsyncMock()

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

    result = await run_daily_market_sync(date(2026, 6, 11), include_snapshot=False)

    mock_service.run_daily_news_sync.assert_awaited_once()
    mock_service.run_snapshot_enrichment.assert_not_called()
    assert result.news_upserted == 3
    assert result.news_skipped == 1


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
