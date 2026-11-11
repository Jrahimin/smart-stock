"""Exchange-aware knowledge boundary shared by replay, features and evidence."""
from bisect import bisect_right
from datetime import datetime, time
from zoneinfo import ZoneInfo

from app.modules.stock_details.decision.event_availability import utc_instant


def next_verified_open(day, session_dates, config, observed_session_dates=()):
    """Only supplied verified session dates establish the next session; never weekdays."""
    index = bisect_right(session_dates, day)
    if index >= len(session_dates):
        return None
    next_day = session_dates[index]
    # A known traded date without finalized index evidence is a calendar gap,
    # never permission to move the deadline to a later finalized date.
    if any(day < observed < next_day for observed in observed_session_dates):
        return None
    opening = dict(config.session_open_overrides).get(next_day.isoformat(), config.session_open_time)
    return datetime.combine(next_day, time.fromisoformat(opening), tzinfo=ZoneInfo("Asia/Dhaka"))


def capture_availability(capture, day, session_dates, config, observed_session_dates=()):
    deadline = next_verified_open(day, session_dates, config, observed_session_dates)
    observed = utc_instant(capture["observed_at"])
    calculated = utc_instant(capture["input"]["calculated_at"])
    selected = utc_instant(capture.get("selection_at") or capture["observed_at"])
    if calculated > selected or observed > selected:
        return "UNAVAILABLE", "INPUT_NOT_KNOWN_AT_SELECTION", deadline
    sources = capture["input"].get("source_observations", ())
    if any(row.get("observed_at") and utc_instant(row["observed_at"]) > min(calculated, selected) for row in sources):
        return "UNAVAILABLE", "SOURCE_NOT_KNOWN_AT_SELECTION", deadline
    for event in capture["input"].get("event_observations", ()):
        known = event.get("known_at")
        revision = event.get("revision_observed_at") or known
        if not known or not revision or utc_instant(known) > min(calculated, selected) or utc_instant(revision) > min(calculated, selected):
            return "UNAVAILABLE", "EVENT_NOT_KNOWN_AT_SELECTION", deadline
    price_sessions = {row["trade_date"] for row in capture["input"].get("prices", ())}
    source_sessions = {row.get("session") for row in sources}
    if not sources or any(not row.get("observed_at") for row in sources) or (price_sessions and not price_sessions <= source_sessions):
        return "UNAVAILABLE", "SOURCE_OBSERVATION_UNKNOWN", deadline
    if deadline is None:
        return "UNAVAILABLE", "NEXT_OPEN_UNVERIFIED", None
    if observed >= deadline or calculated >= deadline or selected >= deadline:
        return "LATE_CAPTURED", "AT_OR_AFTER_NEXT_OPEN", deadline
    return "TIMELY_CAPTURED", "BEFORE_NEXT_VERIFIED_OPEN", deadline


def knowledge_instant(item, config):
    if item.selection_at is not None:
        return utc_instant(item.selection_at)
    # A reconstruction has no historical selection receipt. The configured close
    # is an explicit diagnostic instant, never evidence of prospective selection.
    return datetime.combine(item.as_of_date, time.fromisoformat(config.session_close_time), tzinfo=ZoneInfo("Asia/Dhaka"))
