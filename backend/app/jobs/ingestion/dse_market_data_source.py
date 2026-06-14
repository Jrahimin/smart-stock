from __future__ import annotations

import asyncio
from datetime import date
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
from urllib.parse import urlencode

from pydantic import ValidationError

from app.core.core_config import Settings, get_settings
from app.core.enums import DataQualityFlag
from app.jobs.ingestion.http_fetch import fetch_text
from app.jobs.ingestion.ingestion_source_base import IngestedDailyPrice, MarketDataSource


class _TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self._current_row: list[str] | None = None
        self._current_cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        _ = attrs
        if tag == "tr":
            self._current_row = []
        elif tag in {"td", "th"} and self._current_row is not None:
            self._current_cell = []

    def handle_data(self, data: str) -> None:
        if self._current_cell is not None:
            self._current_cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._current_cell is not None and self._current_row is not None:
            cell_text = " ".join("".join(self._current_cell).split())
            self._current_row.append(cell_text)
            self._current_cell = None
        elif tag == "tr" and self._current_row is not None:
            if any(cell for cell in self._current_row):
                self.rows.append(self._current_row)
            self._current_row = None


class DseMarketDataSource(MarketDataSource):
    source_name = "DSE"
    archive_url = "https://www.dsebd.org/day_end_archive.php"

    def __init__(self, *, ssl_verify: bool = False) -> None:
        self._ssl_verify = ssl_verify

    @classmethod
    def from_settings(cls, settings: Settings | None = None) -> DseMarketDataSource:
        resolved = settings or get_settings()
        return cls(ssl_verify=resolved.dse_archive_ssl_verify)

    async def fetch_daily_prices(self, trade_date: date) -> list[IngestedDailyPrice]:
        query = urlencode(
            {
                "startDate": trade_date.isoformat(),
                "endDate": trade_date.isoformat(),
                "inst": "All Instrument",
                "archive": "data",
            }
        )
        html = await asyncio.to_thread(self._fetch_archive_html, f"{self.archive_url}?{query}")
        return self._parse_archive_html(html, trade_date)

    def _fetch_archive_html(self, url: str) -> str:
        return fetch_text(url, timeout=60, verify_ssl=self._ssl_verify)

    def _parse_archive_html(self, html: str, trade_date: date) -> list[IngestedDailyPrice]:
        parser = _TableParser()
        parser.feed(html)

        parsed_prices: list[IngestedDailyPrice] = []
        for row in parser.rows:
            mapped_row = self._map_archive_row(row, trade_date)
            if mapped_row is not None:
                parsed_prices.append(mapped_row)
        return parsed_prices

    def _is_header_row(self, row: list[str]) -> bool:
        if not row:
            return True
        first = row[0].strip().upper()
        if first in {"TRADING CODE", "SCRIP", "#", "DATE"}:
            return True
        return any(cell.strip().upper() == "TRADING CODE" for cell in row)

    def _map_archive_row(self, row: list[str], requested_trade_date: date) -> IngestedDailyPrice | None:
        if len(row) < 10 or self._is_header_row(row):
            return None

        # Current DSE archive: #, DATE, TRADING CODE, LTP, HIGH, LOW, OPEN, CLOSE, YCP, TRADE, VALUE(mn), VOLUME
        if len(row) >= 12 and self._looks_like_iso_date(row[1]):
            return self._map_modern_archive_row(row)

        # Legacy rows without leading serial/date columns.
        has_trade_date_column = self._looks_like_iso_date(row[0])
        symbol_index = 1 if has_trade_date_column else 0
        if len(row) < symbol_index + 10:
            return None

        try:
            previous_close_price = self._to_decimal(row[symbol_index + 6])
            return IngestedDailyPrice(
                symbol=row[symbol_index].strip().upper(),
                trade_date=self._parse_trade_date(row, requested_trade_date),
                open_price=self._to_decimal(row[symbol_index + 4]),
                high_price=self._to_decimal(row[symbol_index + 2]),
                low_price=self._to_decimal(row[symbol_index + 3]),
                close_price=self._to_decimal(row[symbol_index + 5])
                or self._to_decimal(row[symbol_index + 1]),
                adjusted_close_price=None,
                previous_close_price=previous_close_price,
                volume=self._to_int(row[symbol_index + 9]) or 0,
                trade_count=self._to_int(row[symbol_index + 7]),
                turnover=self._to_turnover(row[symbol_index + 8]),
                source=self.source_name,
                data_quality_flag=(
                    DataQualityFlag.OK if previous_close_price is not None else DataQualityFlag.PARTIAL
                ),
            )
        except (IndexError, InvalidOperation, TypeError, ValueError, ValidationError):
            return None

    def _map_modern_archive_row(self, row: list[str]) -> IngestedDailyPrice | None:
        try:
            symbol = row[2].strip().upper()
            if not symbol or symbol in {"TRADING CODE", "SCRIP"}:
                return None

            close_price = self._to_decimal(row[7]) or self._to_decimal(row[3])
            open_price = self._to_decimal(row[6]) or self._to_decimal(row[3])
            high_price = self._to_decimal(row[4]) or close_price
            low_price = self._to_decimal(row[5]) or close_price
            previous_close_price = self._to_decimal(row[8])
            if close_price is None or open_price is None or high_price is None or low_price is None:
                return None

            return IngestedDailyPrice(
                symbol=symbol,
                trade_date=date.fromisoformat(row[1]),
                open_price=open_price,
                high_price=high_price,
                low_price=low_price,
                close_price=close_price,
                adjusted_close_price=None,
                previous_close_price=previous_close_price,
                volume=self._to_int(row[11]) or 0,
                trade_count=self._to_int(row[9]),
                turnover=self._to_turnover(row[10]),
                source=self.source_name,
                data_quality_flag=(
                    DataQualityFlag.OK if previous_close_price is not None else DataQualityFlag.PARTIAL
                ),
            )
        except (IndexError, InvalidOperation, TypeError, ValueError, ValidationError):
            return None

    def _looks_like_iso_date(self, value: str) -> bool:
        try:
            date.fromisoformat(value)
        except ValueError:
            return False
        return True

    def _parse_trade_date(self, row: list[str], default_trade_date: date) -> date:
        for cell in row:
            try:
                return date.fromisoformat(cell)
            except ValueError:
                continue
        return default_trade_date

    def _to_decimal(self, value: str) -> Decimal | None:
        normalized_value = value.replace(",", "").strip()
        if normalized_value in {"", "-", "--"}:
            return None
        return Decimal(normalized_value)

    def _to_int(self, value: str) -> int | None:
        parsed_value = self._to_decimal(value)
        if parsed_value is None:
            return None
        return int(parsed_value)

    def _to_turnover(self, value: str) -> Decimal | None:
        parsed_value = self._to_decimal(value)
        if parsed_value is None:
            return None
        return parsed_value * Decimal("1000000")

