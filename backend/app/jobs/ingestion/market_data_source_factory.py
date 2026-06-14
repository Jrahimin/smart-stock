"""Build market data ingestion sources from application settings."""

from __future__ import annotations

from app.core.core_config import Settings
from app.core.enums import DailyMarketPrimarySource
from app.jobs.ingestion.amarstock_latest_price_market_data_source import AmarStockLatestPriceMarketDataSource
from app.jobs.ingestion.amarstock_market_data_source import AmarStockMarketDataSource
from app.jobs.ingestion.ingestion_source_base import MarketDataSource
from app.jobs.ingestion.stocknow_market_data_source import StockNowMarketDataSource


def build_primary_market_data_source(settings: Settings) -> MarketDataSource:
    source_key = settings.daily_market_primary_source.strip().lower()
    if source_key == DailyMarketPrimarySource.AMARSTOCK_HTML:
        return AmarStockMarketDataSource()
    return AmarStockLatestPriceMarketDataSource.from_settings(settings)


def resolve_validation_source(settings: Settings) -> MarketDataSource | None:
    if not settings.daily_market_stocknow_validation_enabled:
        return None
    return StockNowMarketDataSource()


def should_attempt_stocknow_fallback(
    settings: Settings,
    *,
    primary_count: int,
    primary_error: BaseException | None,
) -> bool:
    if not settings.daily_market_stocknow_fallback_enabled:
        return False
    return primary_error is not None or primary_count == 0
