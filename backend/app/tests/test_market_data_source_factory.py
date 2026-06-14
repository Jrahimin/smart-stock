"""Unit tests for market data source factory and fallback rules."""

from app.core.core_config import Settings
from app.core.enums import DailyMarketPrimarySource
from app.jobs.ingestion.amarstock_latest_price_market_data_source import AmarStockLatestPriceMarketDataSource
from app.jobs.ingestion.amarstock_market_data_source import AmarStockMarketDataSource
from app.jobs.ingestion.market_data_source_factory import (
    build_primary_market_data_source,
    resolve_validation_source,
    should_attempt_stocknow_fallback,
)


def test_build_primary_defaults_to_latest_price_json() -> None:
    settings = Settings(daily_market_primary_source=DailyMarketPrimarySource.AMARSTOCK_LATEST_PRICE_JSON)
    source = build_primary_market_data_source(settings)
    assert isinstance(source, AmarStockLatestPriceMarketDataSource)


def test_build_primary_html_when_configured() -> None:
    settings = Settings(daily_market_primary_source=DailyMarketPrimarySource.AMARSTOCK_HTML)
    source = build_primary_market_data_source(settings)
    assert isinstance(source, AmarStockMarketDataSource)


def test_validation_source_disabled_by_default() -> None:
    settings = Settings(daily_market_stocknow_validation_enabled=False)
    assert resolve_validation_source(settings) is None


def test_stocknow_fallback_only_when_enabled_and_empty() -> None:
    settings = Settings(daily_market_stocknow_fallback_enabled=True)
    assert should_attempt_stocknow_fallback(settings, primary_count=0, primary_error=None) is True
    assert should_attempt_stocknow_fallback(settings, primary_count=10, primary_error=None) is False

    settings_disabled = Settings(daily_market_stocknow_fallback_enabled=False)
    assert should_attempt_stocknow_fallback(settings_disabled, primary_count=0, primary_error=None) is False
