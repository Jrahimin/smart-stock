"""Instrument price evidence from source clocks and immutable published members.

Transaction-start timestamps cannot order price writes against publication.
Only producer-attested membership authenticates an undated published version.
"""
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from app.modules.stock_details.decision.technical import is_valid_ohlc_row


def _time(value):
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return value if isinstance(value, datetime) and value.tzinfo is not None else None


def _row(value):
    if not isinstance(value, dict):
        return value
    try:
        return SimpleNamespace(**value)
    except TypeError:
        return None


def _day(row):
    value = getattr(row, "trade_date", None)
    try:
        return date.fromisoformat(value) if isinstance(value, str) else value if type(value) is date else None
    except ValueError:
        return None


def _valid(row):
    try:
        return row.volume > 0 and row.data_quality_flag in {"OK", "PARTIAL"} and is_valid_ohlc_row(row)
    except (AttributeError, TypeError, ValueError):
        return False


def _signature(row):
    try:
        # Receipt/source clocks and non-price metadata do not create a new
        # OHLCV version. A later price reversion still starts a new lifetime.
        return (str(getattr(row, "id", None)),) + tuple(Decimal(str(getattr(row, key))) for key in ("open_price", "high_price", "low_price", "close_price", "volume")) + (str(row.data_quality_flag),)
    except (AttributeError, TypeError, ValueError, ArithmeticError):
        return None


def published_price_matches(row, captured):
    """Exact published price state; receipt-only refreshes cannot change it."""
    if _signature(row) != _signature(captured) or _time(getattr(row, "updated_at", None)) != _time(getattr(captured, "updated_at", None)):
        return False
    for key in ("previous_close_price", "price_change", "price_change_percent"):
        left, right = getattr(row, key, None), getattr(captured, key, None)
        try:
            if (None if left is None else Decimal(str(left))) != (None if right is None else Decimal(str(right))):
                return False
        except (ValueError, ArithmeticError):
            return False
    return True


def _source_proven(row, day, known_at, assessed_at):
    updated = _time(getattr(row, "updated_at", None))
    if updated is not None and updated > assessed_at:
        return False
    supplied = getattr(row, "source_observed_at", None)
    source = _time(supplied)
    if supplied is None and getattr(row, "session_date_verified", None) is True:
        source = _time(getattr(row, "batch_fetched_at", None))
    return bool(source and source <= min(known_at, assessed_at)
        and source.astimezone(ZoneInfo("Asia/Dhaka")).date() == day)


@dataclass(frozen=True)
class PricePathObservation:
    day: date
    row: object
    published: bool = False
    current: bool = False


@dataclass(frozen=True)
class EntryPriceEvidence:
    observations: tuple[PricePathObservation, ...] = ()
    complete_days: frozenset[date] = frozenset()

    @property
    def session_dates(self):
        return frozenset(item.day for item in self.observations)


def build_entry_price_evidence(*, prices, revisions, publications, assessed_at, stock_id=None):
    """Collect per-instrument evidence before the mutable-row calendar is chosen.

    Callers supply one instrument's rows/revisions. Missing/ambiguous journal
    ordering withholds positive path completeness; proven lows remain evidence.
    """
    assessed_at = _time(assessed_at)
    if assessed_at is None:
        return EntryPriceEvidence()
    if stock_id is None:
        identities = {str(getattr(row, "stock_id")) for row in prices if getattr(row, "stock_id", None) is not None}
        identities |= {str(item.payload["stock_id"]) for item in revisions if item.payload.get("stock_id") is not None}
        if len(identities) == 1:
            stock_id = identities.pop()
        elif len(identities) > 1:
            return EntryPriceEvidence()
    def belongs(row):
        return row is not None and (stock_id is None or str(getattr(row, "stock_id", None)) == str(stock_id))
    captured_versions = defaultdict(list)
    for publication in publications:
        known = _time(getattr(publication, "evidence_observed_at", None))
        if known is None or known > assessed_at:
            continue  # Old transaction-start clocks do not attest membership.
        for payload in getattr(publication, "price_versions", ()):
            row = _row(payload)
            updated = _time(getattr(row, "updated_at", None))
            if (belongs(row) and _day(row) == publication.trade_date and _valid(row)
                and updated is not None and updated <= publication.source_last_synced_at and updated <= assessed_at):
                captured_versions[publication.trade_date].append(row)
    raw = {_day(row): row for row in prices if _day(row) is not None and belongs(row)}
    grouped = defaultdict(list)
    observations = []
    for day, rows in captured_versions.items():
        observations.extend(PricePathObservation(day, row, published=True) for row in rows)
    for revision in revisions:
        observed = _time(revision.observed_at)
        if observed is None or observed > assessed_at:
            continue
        day = revision.session_date
        grouped[day].append((observed, revision))
        # A DELETE's OLD can retain genuine source evidence, but it never
        # starts a price lifetime and cannot authenticate a later publication.
        operation = getattr(revision, "operation", None)
        payloads = (revision.payload, revision.previous_payload) if operation == "UPDATE" else (revision.payload,) if operation in {"INSERT", "DELETE"} else ()
        for payload in payloads:
            row = _row(payload) if payload else None
            if (row is not None and getattr(row, "id", None) is not None and getattr(revision, "source_row_id", None) is not None
                and str(row.id) != str(revision.source_row_id)):
                continue
            if belongs(row) and _day(row) == day and _valid(row) and _source_proven(row, day, observed, assessed_at):
                observations.append(PricePathObservation(day, row))
    complete = set()
    for day in set(raw) | set(grouped) | set(captured_versions):
        active = None
        uncertain = False
        events = defaultdict(list)
        for observed, revision in grouped[day]:
            events[observed].append(revision)
        for observed, changes in sorted(events.items()):
            if len(changes) != 1:
                uncertain = True
                # Tied writes cannot be sequenced by UUID or query order.
                active = None
                continue
            change = changes[0]
            operation = getattr(change, "operation", None)
            body, prior = _row(change.payload), _row(change.previous_payload) if change.previous_payload else None
            if (not belongs(body) or _day(body) != day or not getattr(body, "id", None)
                or str(body.id) != str(getattr(change, "source_row_id", None))):
                uncertain = True
                active = None
                continue
            if operation not in {"INSERT", "UPDATE", "DELETE"}:
                uncertain = True
                active = None
                continue
            if operation == "UPDATE" and (active is None or not belongs(prior)):
                # NEW establishes a subsequent known version, but does not
                # prove the missing earlier path was safe for a fresh entry.
                uncertain = True
            if operation == "UPDATE" and active and prior and _signature(active) == _signature(prior):
                if _signature(body) == _signature(active):
                    continue
            elif active:
                if operation != "DELETE" or _signature(body) != _signature(active):
                    uncertain = True
            active = None
            if operation in {"INSERT", "UPDATE"}:
                active = body
        current = raw.get(day)
        if current is not None and grouped[day] and active is None:
            uncertain = True
        if active and (current is None or _signature(current) != _signature(active)):
            # A missing replacement/deletion boundary is not an infinite life.
            active = None
            uncertain = True
        current_published = current is not None and any(published_price_matches(current, row) for row in captured_versions[day])
        if current is not None and _valid(current):
            source = _source_proven(current, day, assessed_at, assessed_at)
            if source or current_published:
                observations.append(PricePathObservation(day, current, published=current_published, current=True))
                if not uncertain:
                    complete.add(day)
    return EntryPriceEvidence(tuple(observations), frozenset(complete))
