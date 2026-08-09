"""Tests for DSE historical price backfill."""

from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.core.enums import DataQualityFlag, ExchangeCode
from app.jobs.ingestion.ingest_daily_market_prices import _merge_ingestion_results, backfill_daily_prices
from app.jobs.ingestion.ingestion_source_base import IngestedDailyPrice
from app.modules.market_data.market_data_schemas import DailyPriceIngestionResult
from app.modules.market_data.market_data_service import MarketDataService


def test_merge_ingestion_results_single() -> None:
    one = DailyPriceIngestionResult(
        exchange=ExchangeCode.DSE,
        trade_date=date(2026, 5, 15),
        source="DSE",
        fetched_count=10,
        created_count=8,
        skipped_existing_count=2,
        skipped_unknown_symbol_count=0,
    )
    assert _merge_ingestion_results([one]) is one


def test_merge_ingestion_results_aggregate() -> None:
    results = [
        DailyPriceIngestionResult(
            exchange=ExchangeCode.DSE,
            trade_date=date(2026, 5, 14),
            source="DSE",
            fetched_count=5,
            created_count=3,
            skipped_existing_count=2,
            skipped_unknown_symbol_count=1,
        ),
        DailyPriceIngestionResult(
            exchange=ExchangeCode.DSE,
            trade_date=date(2026, 5, 15),
            source="DSE",
            fetched_count=7,
            created_count=7,
            skipped_existing_count=0,
            skipped_unknown_symbol_count=0,
        ),
    ]
    merged = _merge_ingestion_results(results)
    assert merged.fetched_count == 12
    assert merged.created_count == 10
    assert merged.skipped_existing_count == 2
    assert merged.skipped_unknown_symbol_count == 1


@pytest.mark.asyncio
async def test_backfill_daily_prices_insert_only(monkeypatch: pytest.MonkeyPatch) -> None:
    ingested = IngestedDailyPrice(
        symbol="GP",
        trade_date=date(2026, 5, 15),
        open_price=Decimal("310"),
        high_price=Decimal("315"),
        low_price=Decimal("308"),
        close_price=Decimal("312"),
        adjusted_close_price=None,
        previous_close_price=Decimal("309"),
        volume=1000,
        trade_count=50,
        turnover=Decimal("312000"),
        source="DSE",
        data_quality_flag=DataQualityFlag.OK,
    )

    mock_source = MagicMock()
    mock_source.source_name = "DSE"
    mock_source.fetch_daily_prices = AsyncMock(return_value=[ingested])

    mock_service = MagicMock()
    mock_service.ingest_daily_prices = AsyncMock(
        return_value=DailyPriceIngestionResult(
            exchange=ExchangeCode.DSE,
            trade_date=date(2026, 5, 15),
            source="DSE",
            fetched_count=1,
            created_count=1,
            skipped_existing_count=0,
            skipped_unknown_symbol_count=0,
        )
    )
    mock_service.publish_decision_input_revision = AsyncMock(return_value="G124")

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

    result = await backfill_daily_prices(
        date(2026, 5, 15),
        source=mock_source,
        insert_only=True,
    )

    mock_service.ingest_daily_prices.assert_awaited_once()
    assert mock_service.ingest_daily_prices.await_args.kwargs["insert_only"] is True
    mock_service.publish_decision_input_revision.assert_awaited_once_with(
        exchange=ExchangeCode.DSE,
        source="historical-ohlcv-correction",
    )
    assert result.created_count == 1


@pytest.mark.asyncio
async def test_noop_backfill_does_not_publish_a_decision_revision(monkeypatch: pytest.MonkeyPatch) -> None:
    mock_source = MagicMock()
    mock_source.source_name = "DSE"
    mock_service = MagicMock()
    mock_service.ingest_daily_prices = AsyncMock(
        return_value=DailyPriceIngestionResult(
            exchange=ExchangeCode.DSE,
            trade_date=date(2026, 5, 15),
            source="DSE",
            fetched_count=1,
            created_count=0,
            skipped_existing_count=1,
            skipped_unknown_symbol_count=0,
        )
    )
    mock_service.publish_decision_input_revision = AsyncMock()
    mock_session_cm = MagicMock(
        __aenter__=AsyncMock(return_value=MagicMock()),
        __aexit__=AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices.AsyncSessionLocal",
        lambda: mock_session_cm,
    )
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices._build_service",
        lambda _session: mock_service,
    )
    spawned: list[ExchangeCode] = []
    monkeypatch.setattr(
        "app.jobs.ingestion.ingest_daily_market_prices.spawn_rebuild_market_read_cache",
        lambda exchange, **_kwargs: spawned.append(exchange),
    )

    result = await backfill_daily_prices(date(2026, 5, 15), source=mock_source, insert_only=True)

    assert result.created_count == 0
    mock_service.publish_decision_input_revision.assert_not_awaited()
    assert spawned == []


@pytest.mark.asyncio
async def test_existing_daily_price_ingestion_does_not_bump_generation(monkeypatch: pytest.MonkeyPatch) -> None:
    ingested = IngestedDailyPrice(
        symbol="GP",
        trade_date=date(2026, 5, 15),
        open_price=Decimal("310"),
        high_price=Decimal("315"),
        low_price=Decimal("308"),
        close_price=Decimal("312"),
        adjusted_close_price=None,
        previous_close_price=Decimal("309"),
        volume=1000,
        trade_count=50,
        turnover=Decimal("312000"),
        source="DSE",
        data_quality_flag=DataQualityFlag.OK,
    )

    class Repository:
        async def get_stocks_by_symbols(self, **_kwargs):
            return {"GP": SimpleNamespace(id=uuid4())}

        async def upsert_daily_price_if_changed(self, _values):
            return None

        async def commit(self):
            return None

    source = MagicMock()
    source.source_name = "DSE"
    source.fetch_daily_prices = AsyncMock(return_value=[ingested])
    service = MarketDataService(Repository(), MagicMock())
    service.publish_decision_input_revision = AsyncMock()
    spawned: list[ExchangeCode] = []
    monkeypatch.setattr(
        "app.modules.market_data.market_data_service.spawn_rebuild_market_read_cache",
        lambda exchange: spawned.append(exchange),
    )

    result = await service.ingest_daily_prices(
        exchange=ExchangeCode.DSE,
        trade_date=ingested.trade_date,
        source=source,
    )

    assert result.created_count == 0
    assert result.skipped_existing_count == 1
    service.publish_decision_input_revision.assert_not_awaited()
    assert spawned == []
