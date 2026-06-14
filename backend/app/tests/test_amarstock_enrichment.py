"""Unit tests for AmarStock News / LatestPrice enrichment helpers."""

from decimal import Decimal

from app.core.enums import MarketEventType
from datetime import date

from app.jobs.ingestion.amarstock_latest_price_api_source import (
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
