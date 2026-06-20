"""Session-aware dashboard cache TTL."""

from app.core.core_config import Settings
from app.core.enums import MarketSessionStatus
from app.jobs.market_session_schedule import (
    CLOSED_MARKET_CACHE_TTL_SECONDS,
    current_cache_ttl_seconds,
    resolve_cache_ttl_seconds,
)


def _settings(**overrides: object) -> Settings:
    return Settings(market_snapshot_interval_minutes=15, **overrides)


def test_resolve_cache_ttl_seconds_open_uses_sync_interval_capped_at_600() -> None:
    settings = Settings(market_snapshot_interval_minutes=1)
    assert resolve_cache_ttl_seconds(MarketSessionStatus.OPEN, settings) == 60

    settings = Settings(market_snapshot_interval_minutes=5)
    assert resolve_cache_ttl_seconds(MarketSessionStatus.OPEN, settings) == 300

    settings = Settings(market_snapshot_interval_minutes=15)
    assert resolve_cache_ttl_seconds(MarketSessionStatus.OPEN, settings) == 600

    settings = Settings(market_snapshot_interval_minutes=120)
    assert resolve_cache_ttl_seconds(MarketSessionStatus.OPEN, settings) == 600


def test_resolve_cache_ttl_seconds_non_open_sessions_use_eight_hours() -> None:
    settings = _settings()
    for status in (
        MarketSessionStatus.PRE_OPEN,
        MarketSessionStatus.POST_CLOSE,
        MarketSessionStatus.HOLIDAY,
    ):
        assert resolve_cache_ttl_seconds(status, settings) == CLOSED_MARKET_CACHE_TTL_SECONDS


def test_current_cache_ttl_seconds_delegates_to_market_status() -> None:
    from datetime import datetime
    from zoneinfo import ZoneInfo

    settings = _settings()
    dhaka = ZoneInfo("Asia/Dhaka")
    open_moment = datetime(2026, 6, 11, 12, 0, tzinfo=dhaka)
    closed_moment = datetime(2026, 6, 11, 16, 0, tzinfo=dhaka)

    assert current_cache_ttl_seconds(settings, now=open_moment) == 600
    assert current_cache_ttl_seconds(settings, now=closed_moment) == CLOSED_MARKET_CACHE_TTL_SECONDS
