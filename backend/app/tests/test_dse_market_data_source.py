"""Tests for DSE day-end archive parsing."""

from datetime import date
from decimal import Decimal

from app.jobs.ingestion.dse_market_data_source import DseMarketDataSource


def test_map_modern_archive_row() -> None:
    source = DseMarketDataSource(ssl_verify=False)
    row = [
        "165",
        "2026-06-11",
        "GP",
        "247.8",
        "251",
        "247.5",
        "251",
        "247.8",
        "249.9",
        "1,040",
        "18.145",
        "73,005",
    ]
    mapped = source._map_archive_row(row, date(2026, 6, 11))
    assert mapped is not None
    assert mapped.symbol == "GP"
    assert mapped.trade_date == date(2026, 6, 11)
    assert mapped.close_price == Decimal("247.8")
    assert mapped.high_price == Decimal("251")
    assert mapped.volume == 73005
    assert mapped.turnover == Decimal("18145000")


def test_skips_header_row() -> None:
    source = DseMarketDataSource(ssl_verify=False)
    header = ["#", "DATE", "TRADING CODE", "LTP*", "HIGH", "LOW", "OPENP*", "CLOSEP*", "YCP", "TRADE", "VALUE (mn)", "VOLUME"]
    assert source._map_archive_row(header, date(2026, 6, 11)) is None
