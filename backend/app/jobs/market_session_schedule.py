"""Trading session schedule helpers (Asia/Dhaka) for snapshot/daily jobs and freshness API."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.core.core_config import Settings
from app.core.enums import MarketSessionStatus

DHAKA_TZ = ZoneInfo("Asia/Dhaka")
WEEKEND_WEEKDAYS = {4, 5}  # Friday=4, Saturday=5 (Monday=0)
OPEN_MARKET_CACHE_TTL_CAP_SECONDS = 600
CLOSED_MARKET_CACHE_TTL_SECONDS = 28_800  # 8 hours — POST_CLOSE, HOLIDAY, PRE_OPEN


def parse_hh_mm(value: str) -> time:
    parts = value.strip().split(":")
    if len(parts) != 2:
        raise ValueError(f"Invalid time {value!r}; expected HH:MM")
    hour, minute = int(parts[0]), int(parts[1])
    return time(hour=hour, minute=minute, tzinfo=DHAKA_TZ)


def is_trading_weekday(weekday: int) -> bool:
    return weekday not in WEEKEND_WEEKDAYS


def _minutes_since_midnight(moment: datetime) -> int:
    return moment.hour * 60 + moment.minute


def _combine_date_time(day: date, clock: time) -> datetime:
    return datetime.combine(day, clock.replace(tzinfo=None), tzinfo=DHAKA_TZ)


def is_within_snapshot_window(now: datetime, settings: Settings) -> bool:
    if now.tzinfo is None:
        now = now.replace(tzinfo=DHAKA_TZ)
    else:
        now = now.astimezone(DHAKA_TZ)
    if not is_trading_weekday(now.weekday()):
        return False
    open_min = _minutes_since_midnight(parse_hh_mm(settings.market_open_time))
    close_min = _minutes_since_midnight(parse_hh_mm(settings.market_close_time))
    current = _minutes_since_midnight(now)
    return open_min <= current <= close_min


def resolve_cache_ttl_seconds(market_status: MarketSessionStatus, settings: Settings) -> int:
    """Redis / freshness TTL fallback; invalidation on sync remains primary."""
    if market_status == MarketSessionStatus.OPEN:
        return min(OPEN_MARKET_CACHE_TTL_CAP_SECONDS, settings.market_sync_interval_seconds)
    return CLOSED_MARKET_CACHE_TTL_SECONDS


def current_cache_ttl_seconds(settings: Settings, *, now: datetime | None = None) -> int:
    moment = now if now is not None else datetime.now(DHAKA_TZ)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=DHAKA_TZ)
    else:
        moment = moment.astimezone(DHAKA_TZ)
    return resolve_cache_ttl_seconds(resolve_market_status(moment, settings), settings)


def resolve_market_status(now: datetime, settings: Settings) -> MarketSessionStatus:
    if now.tzinfo is None:
        now = now.replace(tzinfo=DHAKA_TZ)
    else:
        now = now.astimezone(DHAKA_TZ)
    if not is_trading_weekday(now.weekday()):
        return MarketSessionStatus.HOLIDAY

    open_min = _minutes_since_midnight(parse_hh_mm(settings.market_open_time))
    close_min = _minutes_since_midnight(parse_hh_mm(settings.market_close_time))
    current = _minutes_since_midnight(now)

    if current < open_min:
        return MarketSessionStatus.PRE_OPEN
    if current <= close_min:
        return MarketSessionStatus.OPEN
    return MarketSessionStatus.POST_CLOSE


def _align_to_interval(moment: datetime, interval_minutes: int) -> datetime:
    minute = (moment.minute // interval_minutes) * interval_minutes
    return moment.replace(minute=minute, second=0, microsecond=0)


def _next_interval_slot_after(moment: datetime, interval_minutes: int) -> datetime:
    aligned = _align_to_interval(moment, interval_minutes)
    if aligned <= moment:
        aligned += timedelta(minutes=interval_minutes)
    return aligned


def next_snapshot_sync_at(now: datetime, settings: Settings) -> datetime | None:
    if now.tzinfo is None:
        now = now.replace(tzinfo=DHAKA_TZ)
    else:
        now = now.astimezone(DHAKA_TZ)

    interval = settings.market_snapshot_interval_minutes
    open_time = parse_hh_mm(settings.market_open_time)
    close_time = parse_hh_mm(settings.market_close_time)
    open_min = _minutes_since_midnight(open_time)
    close_min = _minutes_since_midnight(close_time)

    day = now.date()
    for _ in range(14):
        if is_trading_weekday(day.weekday()):
            window_start = _combine_date_time(day, open_time)
            window_end = _combine_date_time(day, close_time)
            if now < window_start:
                return window_start
            if now <= window_end:
                candidate = _next_interval_slot_after(max(now, window_start), interval)
                if candidate <= window_end:
                    return candidate
                return None
        day += timedelta(days=1)
        now = _combine_date_time(day, open_time) - timedelta(seconds=1)
    return None


def next_daily_sync_at(now: datetime, settings: Settings) -> datetime | None:
    if now.tzinfo is None:
        now = now.replace(tzinfo=DHAKA_TZ)
    else:
        now = now.astimezone(DHAKA_TZ)

    daily_time = parse_hh_mm(settings.daily_market_sync_time)
    day = now.date()
    for _ in range(14):
        if is_trading_weekday(day.weekday()):
            run_at = _combine_date_time(day, daily_time)
            if run_at > now:
                return run_at
        day += timedelta(days=1)
    return None


def build_freshness_label(settings: Settings, status: MarketSessionStatus) -> str:
    interval = settings.market_snapshot_interval_minutes
    if status == MarketSessionStatus.HOLIDAY:
        return "Market closed for the weekend; showing the latest stored snapshot."
    if status == MarketSessionStatus.POST_CLOSE:
        return f"Post-close snapshot; prices refresh about every {interval} minutes during the session."
    return f"Snapshot prices; updates about every {interval} minutes"
