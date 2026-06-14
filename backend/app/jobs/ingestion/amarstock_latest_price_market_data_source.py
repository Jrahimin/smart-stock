"""AmarStock LatestPrice JSON as a primary daily market data source."""

from __future__ import annotations

from datetime import date

from app.core.core_config import Settings
from app.jobs.ingestion.amarstock_latest_price_api_source import (
    AmarStockLatestPriceApiSource,
    row_to_ingested_daily_price,
)
from app.jobs.ingestion.ingestion_source_base import IngestedDailyPrice, MarketDataSource


class AmarStockLatestPriceMarketDataSource(MarketDataSource):
    source_name = AmarStockLatestPriceApiSource.source_name

    def __init__(self, api_source: AmarStockLatestPriceApiSource) -> None:
        self._api = api_source

    @classmethod
    def from_settings(cls, settings: Settings) -> AmarStockLatestPriceMarketDataSource:
        return cls(AmarStockLatestPriceApiSource.from_settings(settings))

    async def fetch_daily_prices(self, trade_date: date) -> list[IngestedDailyPrice]:
        rows = await self._api.fetch_all_rows()
        parsed: list[IngestedDailyPrice] = []
        for row in rows:
            mapped = row_to_ingested_daily_price(row, trade_date=trade_date, source_name=self.source_name)
            if mapped is not None:
                parsed.append(mapped)
        return parsed
