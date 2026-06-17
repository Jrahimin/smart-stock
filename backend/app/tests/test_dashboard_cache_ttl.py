"""Dashboard cache TTL derived from market sync interval."""

from app.core.core_config import Settings


def test_market_dashboard_cache_ttl_seconds_clamps_to_bounds() -> None:
    settings = Settings(market_snapshot_interval_minutes=1)
    assert settings.market_sync_interval_seconds == 60
    assert settings.market_dashboard_cache_ttl_seconds == 60

    settings = Settings(market_snapshot_interval_minutes=5)
    assert settings.market_dashboard_cache_ttl_seconds == 300

    settings = Settings(market_snapshot_interval_minutes=15)
    assert settings.market_dashboard_cache_ttl_seconds == 600

    settings = Settings(market_snapshot_interval_minutes=120)
    assert settings.market_dashboard_cache_ttl_seconds == 600
