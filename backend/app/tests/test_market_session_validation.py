"""Tests for AmarStock index API session validation before market sync."""

from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.enums import ExchangeCode
from app.jobs.ingestion.amarstock_index_api_source import AmarStockDsexSnapshot
from app.jobs.ingestion.amarstock_daily_enrichment import PostDailyAmarstockStats
from app.jobs.ingestion.ingest_daily_market_prices import run_daily_market_sync, sync_market_snapshot
from app.jobs.market_session_validation import MarketSessionValidation, validate_market_session
from app.modules.market_data.market_data_schemas import DailyPriceIngestionResult


def _snapshot_for(trade_date: date, *, market_status: str = "Closed") -> AmarStockDsexSnapshot:
    return AmarStockDsexSnapshot(
        trade_date=trade_date,
        index_close=Decimal("5500"),
        index_change=Decimal("0"),
        index_change_percent=Decimal("0"),
        day_open=Decimal("5500"),
        day_high=Decimal("5500"),
        day_low=Decimal("5500"),
        range_52w_low=Decimal("4500"),
        range_52w_high=Decimal("5600"),
        return_6m_percent=None,
        return_1y_percent=None,
        market_status=market_status,
        total_volume=0,
        total_turnover=None,
        total_trades=0,
        advancing_issues=0,
        declining_issues=0,
        unchanged_issues=0,
    )


@pytest.mark.asyncio
async def test_validate_market_session_passes_when_api_date_matches_today(monkeypatch: pytest.MonkeyPatch) -> None:
    today = date(2026, 7, 1)
    mock_source = MagicMock()
    mock_source.fetch_dsex_snapshot = AsyncMock(return_value=_snapshot_for(today, market_status="Closed"))
    monkeypatch.setattr(
        "app.jobs.market_session_validation.AmarStockIndexApiSource.from_settings",
        lambda _settings: mock_source,
    )

    result = await validate_market_session(today=today)

    assert result == MarketSessionValidation(
        should_sync=True,
        trade_date=today,
        market_status="Closed",
        reason=None,
    )


@pytest.mark.asyncio
async def test_validate_market_session_skips_on_holiday_stale_date(monkeypatch: pytest.MonkeyPatch) -> None:
    today = date(2026, 7, 1)
    last_session = date(2026, 6, 30)
    mock_source = MagicMock()
    mock_source.fetch_dsex_snapshot = AsyncMock(return_value=_snapshot_for(last_session, market_status="Closed"))
    monkeypatch.setattr(
        "app.jobs.market_session_validation.AmarStockIndexApiSource.from_settings",
        lambda _settings: mock_source,
    )

    result = await validate_market_session(today=today)

    assert result.should_sync is False
    assert result.trade_date == last_session
    assert result.market_status == "Closed"
    assert result.reason is not None
    assert "2026-06-30" in result.reason
    assert "2026-07-01" in result.reason


@pytest.mark.asyncio
async def test_validate_market_session_fails_closed_on_api_error(monkeypatch: pytest.MonkeyPatch) -> None:
    today = date(2026, 7, 1)
    mock_source = MagicMock()
    mock_source.fetch_dsex_snapshot = AsyncMock(side_effect=RuntimeError("timeout"))
    monkeypatch.setattr(
        "app.jobs.market_session_validation.AmarStockIndexApiSource.from_settings",
        lambda _settings: mock_source,
    )

    result = await validate_market_session(today=today)

    assert result.should_sync is False
    assert result.trade_date == today
    assert result.market_status == "Unknown"
    assert result.reason is not None
    assert "index API unavailable" in result.reason


@pytest.mark.asyncio
async def test_sync_market_snapshot_skips_ingest_on_non_trading_session(monkeypatch: pytest.MonkeyPatch) -> None:
    today = date(2026, 7, 1)
    last_session = date(2026, 6, 30)
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices.validate_market_session",
        AsyncMock(
            return_value=MarketSessionValidation(
                should_sync=False,
                trade_date=last_session,
                market_status="Closed",
                reason="holiday",
            )
        ),
    )

    ingest_mock = AsyncMock()
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices._ingest_with_optional_fallback",
        ingest_mock,
    )

    result = await sync_market_snapshot(today)

    ingest_mock.assert_not_called()
    assert result.session_skipped is True
    assert result.session_skip_reason == "holiday"
    assert result.fetched_count == 0
    assert result.created_count == 0
    assert result.index_summary_upserted is False


@pytest.mark.asyncio
async def test_sync_market_snapshot_uses_api_trade_date_when_validation_passes(monkeypatch: pytest.MonkeyPatch) -> None:
    today = date(2026, 7, 1)
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices.validate_market_session",
        AsyncMock(
            return_value=MarketSessionValidation(
                should_sync=True,
                trade_date=today,
                market_status="Open",
                reason=None,
            )
        ),
    )

    price_result = DailyPriceIngestionResult(
        exchange=ExchangeCode.DSE,
        trade_date=today,
        source="AMARSTOCK_LATEST_PRICE_API",
        fetched_count=10,
        created_count=10,
        skipped_existing_count=0,
        skipped_unknown_symbol_count=0,
        suspicious_count=0,
    )
    mock_service = MagicMock()
    mock_service.ingest_daily_prices = AsyncMock(return_value=price_result)
    mock_service.run_snapshot_enrichment = AsyncMock(
        return_value=PostDailyAmarstockStats(index_summary_upserted=True),
    )

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
        AsyncMock(return_value=price_result),
    )

    result = await sync_market_snapshot(date(2026, 6, 11), skip_validation=True)

    assert result.session_skipped is False
    assert result.trade_date == today
    assert result.fetched_count == 10


@pytest.mark.asyncio
async def test_run_daily_market_sync_skips_news_on_non_trading_session(monkeypatch: pytest.MonkeyPatch) -> None:
    today = date(2026, 7, 1)
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices.validate_market_session",
        AsyncMock(
            return_value=MarketSessionValidation(
                should_sync=False,
                trade_date=date(2026, 6, 30),
                market_status="Closed",
                reason="holiday",
            )
        ),
    )

    mock_service = MagicMock()
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
    spawn_mock = MagicMock()
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices.spawn_rebuild_market_read_cache",
        spawn_mock,
    )

    result = await run_daily_market_sync(today, include_snapshot=False)

    mock_service.run_daily_news_sync.assert_not_called()
    spawn_mock.assert_not_called()
    assert result.session_skipped is True
    assert result.news_upserted == 0
