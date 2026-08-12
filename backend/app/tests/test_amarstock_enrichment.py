"""Unit tests for AmarStock News / LatestPrice enrichment helpers."""

from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.core.enums import MarketEventType
from app.jobs.ingestion.amarstock_latest_price_api_source import (
    AmarStockLatestPriceApiSource,
    _decode_columnar_rows,
    _parse_row,
    row_to_ingested_daily_price,
)
from app.jobs.ingestion.amarstock_news_classifier import classify_market_event_type
from app.jobs.ingestion.amarstock_turnover import normalize_amarstock_turnover_text


def test_classify_board_meeting() -> None:
    t = classify_market_event_type(
        title="Board Meeting schedule under LR 16(1)",
        content="meeting of the Board of Directors",
    )
    assert t == MarketEventType.BOARD_MEETING


def test_classify_dividend() -> None:
    t = classify_market_event_type(title="Cash dividend", content="declared cash dividend")
    assert t == MarketEventType.DISCLOSURE


def test_turnover_suffix_m() -> None:
    assert normalize_amarstock_turnover_text("7.5M") == Decimal("7500000")


def test_turnover_no_suffix_millions() -> None:
    assert normalize_amarstock_turnover_text("25.61") == Decimal("25610000")


def test_parse_latest_price_row() -> None:
    row = _parse_row(
        {
            "Scrip": "TEST",
            "CreatedOn": "/Date(1778507873000)/",
            "LTP": 3.2,
            "Close": 3.2,
            "Trade": 100,
            "Value": 1.5,
            "PE": 10.5,
            "BusinessSegment": "IT Sector",
            "MarketCategory": "A",
        }
    )
    assert row is not None
    assert row.scrip == "TEST"
    assert row.trade == 100
    assert row.business_segment == "IT Sector"


def test_row_to_ingested_daily_price_maps_ohlcv() -> None:
    row = _parse_row(
        {
            "Scrip": "GP",
            "Open": 310.5,
            "High": 315.0,
            "Low": 308.0,
            "Close": 312.0,
            "YCP": 309.0,
            "Volume": 50000,
            "Trade": 1200,
            "Value": "15.5",
        }
    )
    assert row is not None
    ingested = row_to_ingested_daily_price(row, trade_date=date(2026, 6, 11))
    assert ingested is not None
    assert ingested.symbol == "GP"
    assert ingested.close_price == Decimal("312.0")
    assert ingested.open_price == Decimal("310.5")
    assert ingested.volume == 50000
    assert ingested.trade_count == 1200
    assert ingested.source == "AMARSTOCK_LATEST_PRICE_API"


def test_row_to_ingested_daily_price_skips_zero_close() -> None:
    row = _parse_row({"Scrip": "BAD", "Close": 0, "LTP": 0})
    assert row is not None
    assert row_to_ingested_daily_price(row, trade_date=date(2026, 6, 11)) is None


@pytest.mark.asyncio
async def test_current_market_snapshot_replaces_expired_latest_price_token() -> None:
    source = AmarStockLatestPriceApiSource(
        base_url="https://www.amarstock.com",
        market_snapshot_path="/823af3f1ebdd",
        max_retries=1,
        retry_delay_seconds=0,
    )
    source._client.fetch_structured = AsyncMock(
        return_value={
            "aa": ["SONALILIFE"],
            "ab": ["Sonali Life Insurance PLC"],
            "ad": [1000],
            "aj": [12.5],
            "ak": [5000],
            "aq": [1000],
            "ar": [1000000],
            "av": ["A"],
            "ay": [25],
            "az": [0],
            "ba": [30],
            "bb": [1],
            "bc": [44],
            "cb": [1.2],
            "ce": [0.3],
            "ci": [14.5],
            "dp": ["Insurance"],
            "ea": [12.7],
            "eb": [12.5],
            "ec": [12.8],
            "ed": [12.4],
            "ee": [12.7],
            "eh": [45],
            "ei": [1.23],
            "ej": [10.5],
            "ek": [60],
        }
    )

    rows = await source.fetch_all_rows()

    assert source.build_url() == "https://www.amarstock.com/823af3f1ebdd"
    assert rows[0].scrip == "SONALILIFE"
    assert rows[0].full_name == "Sonali Life Insurance PLC"
    assert rows[0].close == Decimal("12.7")
    assert rows[0].free_float == Decimal("60")
    assert rows[0].raw["ClosePrice"] == 12.7
    assert rows[0].raw["AuditedPE"] == 10.5
    source._client.fetch_structured.assert_awaited_once_with(  # type: ignore[attr-defined]
        "https://www.amarstock.com/823af3f1ebdd",
        source_name="AMARSTOCK_LATEST_PRICE_API",
    )


def test_current_market_snapshot_rejects_unequal_column_lengths() -> None:
    with pytest.raises(ValueError, match="unequal lengths"):
        _decode_columnar_rows({"aa": ["ONE", "TWO"], "ab": ["One"]})
