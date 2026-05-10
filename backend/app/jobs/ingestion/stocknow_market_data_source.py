import asyncio
import logging
from datetime import date
from decimal import Decimal, InvalidOperation
from urllib.error import URLError
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup
from pydantic import ValidationError

from app.core.enums import DataQualityFlag
from app.jobs.ingestion.ingestion_source_base import IngestedDailyPrice, MarketDataSource

logger = logging.getLogger(__name__)


class StockNowMarketDataSource(MarketDataSource):
    source_name = "STOCKNOW"
    market_price_url = "https://stocknow.com.bd/"

    def __init__(self, *, max_retries: int = 2, retry_delay_seconds: float = 1.0) -> None:
        self.max_retries = max_retries
        self.retry_delay_seconds = retry_delay_seconds

    async def fetch_daily_prices(self, trade_date: date) -> list[IngestedDailyPrice]:
        html = await self._fetch_with_retry()
        return self._parse_market_price_html(html, trade_date)

    async def _fetch_with_retry(self) -> str:
        last_error: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                return await asyncio.to_thread(self._fetch_market_price_html)
            except (TimeoutError, URLError, OSError) as exc:
                last_error = exc
                logger.warning(
                    "StockNow fetch attempt %s/%s failed: %s",
                    attempt,
                    self.max_retries,
                    exc,
                )
                if attempt < self.max_retries:
                    await asyncio.sleep(self.retry_delay_seconds * attempt)

        raise RuntimeError("StockNow market price fetch failed") from last_error

    def _fetch_market_price_html(self) -> str:
        request = Request(
            self.market_price_url,
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

    def _parse_market_price_html(self, html: str, trade_date: date) -> list[IngestedDailyPrice]:
        soup = BeautifulSoup(html, "lxml")
        code_by_row = self._grid_column_by_row(soup, "code")
        price_by_row = self._grid_column_by_row(soup, "avg") or self._grid_column_by_row(soup, "ltp")

        if not code_by_row or not price_by_row:
            logger.error(
                "StockNow grid data was not found: code_rows=%s price_rows=%s",
                len(code_by_row),
                len(price_by_row),
            )
            return []

        parsed_prices: list[IngestedDailyPrice] = []
        failed_rows = 0
        for row_index, symbol in code_by_row.items():
            price_value = price_by_row.get(row_index, "")
            mapped_row = self._map_grid_row(symbol, price_value, trade_date, row_index)
            if mapped_row is None:
                failed_rows += 1
                continue
            parsed_prices.append(mapped_row)

        logger.info(
            "Parsed StockNow validation data: total_rows=%s success=%s failed_rows=%s",
            len(code_by_row),
            len(parsed_prices),
            failed_rows,
        )
        return parsed_prices

    def _grid_column_by_row(self, soup: BeautifulSoup, column_id: str) -> dict[int, str]:
        cells_by_row: dict[int, str] = {}
        for cell in soup.select(f'[role="gridcell"][col-id="{column_id}"]'):
            row = cell.find_parent(attrs={"role": "row"})
            if row is None:
                continue

            raw_row_index = row.get("row-index")
            if raw_row_index is None:
                continue

            try:
                row_index = int(raw_row_index)
            except ValueError:
                continue

            cells_by_row[row_index] = cell.get_text(" ", strip=True)
        return cells_by_row

    def _map_grid_row(
        self,
        symbol: str,
        close_price_value: str,
        trade_date: date,
        row_index: int,
    ) -> IngestedDailyPrice | None:
        symbol = symbol.strip()
        if not symbol:
            logger.debug("Skipping StockNow row %s without symbol", row_index)
            return None

        try:
            close_price = self._to_decimal(close_price_value)
            if close_price is None:
                logger.warning(
                    "Skipping StockNow row %s for symbol %s with missing price: %s",
                    row_index,
                    symbol,
                    close_price_value,
                )
                return None

            return IngestedDailyPrice(
                symbol=symbol,
                trade_date=trade_date,
                open_price=close_price,
                high_price=close_price,
                low_price=close_price,
                close_price=close_price,
                adjusted_close_price=None,
                previous_close_price=None,
                volume=0,
                trade_count=None,
                turnover=None,
                source=self.source_name,
                data_quality_flag=DataQualityFlag.PARTIAL,
            )
        except (InvalidOperation, TypeError, ValueError, ValidationError):
            logger.exception("StockNow row %s failed for symbol %s", row_index, symbol)
            return None

    def _to_decimal(self, value: str) -> Decimal | None:
        normalized_value = value.replace(",", "").strip()
        if normalized_value in {"", "-", "--", "N/A"}:
            return None
        return Decimal(normalized_value)
