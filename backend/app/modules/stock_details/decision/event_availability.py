from datetime import UTC, date, datetime


def utc_instant(value: datetime | str) -> datetime:
    """Legacy naive database timestamps are UTC; aware values keep their instant."""
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def available_event_revisions(
    events: tuple[dict, ...],
    *,
    cutoff: datetime,
) -> tuple[tuple[dict, ...], bool]:
    """Select revisions known at cutoff and report gaps in already-known events."""
    cutoff = utc_instant(cutoff)
    selected: dict[tuple, tuple[datetime, dict]] = {}
    known_keys = set()
    for index, event in enumerate(events):
        key = (event.get("kind"), event.get("event_id") or index)
        known_at = event.get("known_at")
        if not known_at or utc_instant(known_at) > cutoff:
            continue
        known_keys.add(key)
        revision = utc_instant(event.get("revision_observed_at") or known_at)
        if revision <= cutoff and (key not in selected or revision > selected[key][0]):
            selected[key] = (revision, event)
    return tuple(event for _, event in selected.values()), bool(known_keys - selected.keys())


def effective_event_dates(events: tuple[dict, ...]) -> set[date]:
    return {
        date.fromisoformat(str(event["effective_date"]))
        for event in events
        if event.get("effective_date")
    }
