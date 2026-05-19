"""Unit tests for AmarStock News / LatestPrice enrichment helpers."""

from decimal import Decimal

from app.core.enums import MarketEventType
from app.jobs.ingestion.amarstock_latest_price_api_source import _parse_row
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
