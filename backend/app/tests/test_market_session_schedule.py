"""Unit tests for trading session schedule helpers."""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.core_config import Settings
from app.core.enums import MarketSessionStatus
from app.jobs.market_session_schedule import (
    is_trading_weekday,
    next_snapshot_sync_at,
    resolve_market_status,
)

DHAKA = ZoneInfo("Asia/Dhaka")


def _settings() -> Settings:
    return Settings(
        market_open_time="10:00",
        market_close_time="15:00",
        market_snapshot_interval_minutes=15,
        daily_market_sync_time="15:15",
    )


def _dhaka(year: int, month: int, day: int, hour: int, minute: int) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=DHAKA)


def test_is_trading_weekday_sun_thu() -> None:
    assert is_trading_weekday(6) is True  # Sunday
    assert is_trading_weekday(0) is True  # Monday
    assert is_trading_weekday(4) is False  # Friday
    assert is_trading_weekday(5) is False  # Saturday


def test_resolve_market_status_holiday_friday() -> None:
    settings = _settings()
    now = _dhaka(2026, 6, 12, 11, 0)  # Friday
    assert resolve_market_status(now, settings) == MarketSessionStatus.HOLIDAY


def test_resolve_market_status_pre_open() -> None:
    settings = _settings()
    now = _dhaka(2026, 6, 11, 9, 30)  # Thursday
    assert resolve_market_status(now, settings) == MarketSessionStatus.PRE_OPEN


def test_resolve_market_status_open() -> None:
    settings = _settings()
    now = _dhaka(2026, 6, 11, 12, 0)
    assert resolve_market_status(now, settings) == MarketSessionStatus.OPEN


def test_resolve_market_status_post_close() -> None:
    settings = _settings()
    now = _dhaka(2026, 6, 11, 16, 0)
    assert resolve_market_status(now, settings) == MarketSessionStatus.POST_CLOSE


def test_next_snapshot_sync_at_pre_open_returns_open() -> None:
    settings = _settings()
    now = _dhaka(2026, 6, 11, 9, 45)
    nxt = next_snapshot_sync_at(now, settings)
    assert nxt == _dhaka(2026, 6, 11, 10, 0)


def test_next_snapshot_sync_at_open_aligns_to_interval() -> None:
    settings = _settings()
    now = _dhaka(2026, 6, 11, 10, 7)
    nxt = next_snapshot_sync_at(now, settings)
    assert nxt == _dhaka(2026, 6, 11, 10, 15)


def test_next_snapshot_sync_at_after_close_returns_next_trading_day_open() -> None:
    settings = _settings()
    now = _dhaka(2026, 6, 11, 15, 30)  # Thursday post-close
    nxt = next_snapshot_sync_at(now, settings)
    assert nxt == _dhaka(2026, 6, 14, 10, 0)  # Sunday session open
