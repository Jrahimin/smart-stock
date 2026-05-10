import asyncio
import logging
from datetime import date
from decimal import Decimal, InvalidOperation
from urllib.error import URLError
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup
from bs4.element import Tag
from pydantic import ValidationError

from app.core.enums import DataQualityFlag
from app.jobs.ingestion.ingestion_source_base import IngestedDailyPrice, MarketDataSource

logger = logging.getLogger(__name__)


class AmarStockMarketDataSource(MarketDataSource):
    source_name = "AMARSTOCK"
    latest_price_url = "https://www.amarstock.com/latest-share-price"

    _REQUIRED_HEADERS = ("TRADING CODE", "LTP")

    def __init__(self, *, max_retries: int = 3, retry_delay_seconds: float = 1.0) -> None:
        self.max_retries = max_retries
        self.retry_delay_seconds = retry_delay_seconds

    async def fetch_daily_prices(self, trade_date: date) -> list[IngestedDailyPrice]:
        html = await self._fetch_with_retry()
        return self._parse_latest_price_html(html, trade_date)

    async def _fetch_with_retry(self) -> str:
        last_error: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                return await asyncio.to_thread(self._fetch_latest_price_html)
            except (TimeoutError, URLError, OSError) as exc:
                last_error = exc
                logger.warning(
                    "AmarStock fetch attempt %s/%s failed: %s",
                    attempt,
                    self.max_retries,
                    exc,
                )
                if attempt < self.max_retries:
                    await asyncio.sleep(self.retry_delay_seconds * attempt)

        raise RuntimeError("AmarStock latest price fetch failed") from last_error

    def _fetch_latest_price_html(self) -> str:
        request = Request(
            self.latest_price_url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )
        with urlopen(request, timeout=20) as response:
            return response.read().decode("utf-8", errors="replace")

    def _parse_latest_price_html(self, html: str, trade_date: date) -> list[IngestedDailyPrice]:
        soup = BeautifulSoup(html, "lxml")
        table_data = self._find_latest_price_rows(soup)
        if table_data is None:
            logger.error("AmarStock latest price table was not found")
            return []

        header_map, rows = table_data
        if not rows:
            logger.error("AmarStock latest price table was found but contained no rows")
            return []

        parsed_prices: list[IngestedDailyPrice] = []
        failed_rows = 0
        for row_number, row in enumerate(rows, start=1):
            cells = [cell.get_text(" ", strip=True) for cell in row.find_all(["td", "th"])]
            mapped_row = self._map_latest_price_row(cells, header_map, trade_date, row_number)
            if mapped_row is None:
                failed_rows += 1
                continue
            parsed_prices.append(mapped_row)

        logger.info(
            "Parsed AmarStock market data: total_rows=%s success=%s failed_rows=%s",
            len(rows),
            len(parsed_prices),
            failed_rows,
        )
        if not parsed_prices:
            logger.error("AmarStock latest price parsing produced no valid rows")
            return []
        return parsed_prices

    def _find_latest_price_rows(self, soup: BeautifulSoup) -> tuple[dict[str, int], list[Tag]] | None:
        inspected_headers: list[list[str]] = []
        for table in soup.find_all("table"):
            header_cells = [
                self._normalize_header(cell.get_text(" ", strip=True))
                for cell in table.select("thead tr th")
            ]
            if not header_cells:
                continue

            inspected_headers.append(header_cells)
            header_map = {name: index for index, name in enumerate(header_cells) if name}
            if all(header in header_map for header in self._REQUIRED_HEADERS):
                rows = list(table.select("tbody > tr"))
                logger.info("AmarStock header map detected: %s", header_map)
                logger.debug(
                    "Matched AmarStock latest price table: headers=%s row_count=%s",
                    header_cells,
                    len(rows),
                )
                return header_map, rows

        logger.debug("AmarStock latest price table headers inspected: %s", inspected_headers[:10])
        return None

    def _normalize_header(self, value: str) -> str:
        return " ".join(value.upper().split())

    def _map_latest_price_row(
        self,
        row: list[str],
        header_map: dict[str, int],
        trade_date: date,
        row_number: int,
    ) -> IngestedDailyPrice | None:
        symbol = self._cell(row, header_map, "TRADING CODE").strip()
        if not symbol or symbol.upper() == "TRADING CODE":
            logger.debug("Skipping AmarStock row %s without symbol: %s", row_number, row)
            return None

        try:
            close_price = self._to_decimal(self._cell(row, header_map, "LTP"))
            if close_price is None:
                logger.warning("Skipping AmarStock row %s with missing LTP: %s", row_number, row)
                return None

            high_price = self._to_decimal(self._optional_cell(row, header_map, "HIGH"))
            low_price = self._to_decimal(self._optional_cell(row, header_map, "LOW"))
            previous_close_price = self._to_decimal(self._optional_cell(row, header_map, "YCP"))
            volume = self._to_int(self._optional_cell(row, header_map, "VOLUME"))
            trade_count = self._to_int(self._optional_cell(row, header_map, "TRADE"))
            turnover = self._normalize_turnover(self._optional_cell(row, header_map, "VALUE"))
            source_open_price = self._to_decimal(self._optional_cell(row, header_map, "OPEN"))

            is_partial = any(
                value is None
                for value in (
                    source_open_price,
                    high_price,
                    low_price,
                    previous_close_price,
                    volume,
                    trade_count,
                    turnover,
                )
            )
            high_price = high_price or close_price
            low_price = low_price or close_price
            open_price = source_open_price or previous_close_price or close_price

            return IngestedDailyPrice(
                symbol=symbol,
                trade_date=trade_date,
                open_price=open_price,
                high_price=high_price,
                low_price=low_price,
                close_price=close_price,
                adjusted_close_price=None,
                previous_close_price=previous_close_price,
                volume=volume or 0,
                trade_count=trade_count,
                turnover=turnover,
                source=self.source_name,
                data_quality_flag=DataQualityFlag.PARTIAL if is_partial else DataQualityFlag.OK,
            )
        except (InvalidOperation, TypeError, ValueError, ValidationError):
            logger.exception("Row %s failed for symbol %s: %s", row_number, symbol, row)
            return None

    def _cell(self, row: list[str], header_map: dict[str, int], header: str) -> str:
        index = header_map[header]
        if index >= len(row):
            return ""
        return row[index]

    def _optional_cell(self, row: list[str], header_map: dict[str, int], header: str) -> str:
        index = header_map.get(header)
        if index is None or index >= len(row):
            return ""
        return row[index]

    def _to_decimal(self, value: str) -> Decimal | None:
        normalized_value = value.replace(",", "").replace("%", "").strip()
        if normalized_value in {"", "-", "--", "N/A"}:
            return None
        return Decimal(normalized_value)

    def _to_int(self, value: str) -> int | None:
        parsed_value = self._to_number_with_suffix(value)
        if parsed_value is None:
            return None
        return int(parsed_value)

    def _normalize_turnover(self, value: str) -> Decimal | None:
        parsed_value = self._to_number_with_suffix(value)
        if parsed_value is None:
            return None
        if value.strip().upper().endswith(("K", "M")):
            return parsed_value

        # Assumption: AmarStock VALUE is in million if no suffix.
        return parsed_value * Decimal("1000000")

    def _to_number_with_suffix(self, value: str) -> Decimal | None:
        normalized_value = value.replace(",", "").strip().upper()
        if normalized_value in {"", "-", "--", "N/A"}:
            return None

        multiplier = Decimal("1")
        if normalized_value.endswith("K"):
            multiplier = Decimal("1000")
            normalized_value = normalized_value[:-1]
        elif normalized_value.endswith("M"):
            multiplier = Decimal("1000000")
            normalized_value = normalized_value[:-1]

        return Decimal(normalized_value.strip()) * multiplier
