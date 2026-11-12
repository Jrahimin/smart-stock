"""Read-time permission for a *new* long entry, separate from an immutable thesis.

The evaluator never changes the dated action, levels, holder guidance or identity.
Session dates are verified exchange dates, not a weekday approximation.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from math import isfinite

from pydantic import BaseModel, Field
from typing import Literal


EntryApplicabilityReasonCode = Literal[
    "PUBLICATION_INVALIDATED",
    "ACTION_NOT_PERMITTED",
    "ELIGIBILITY_BLOCKED",
    "NO_ENTRY_PLAN",
    "STOP_BREACHED",
    "PRICE_BASIS_CHANGED",
    "PLAN_EXPIRED",
    "COVERAGE_UNKNOWN",
    "QUOTE_UNUSABLE",
    "PATH_INCOMPLETE",
    "TERMS_UNKNOWN",
    "TARGET_REACHED",
    "BELOW_ENTRY_ZONE",
    "ABOVE_ENTRY_ZONE",
    "COMPLETED_BREAKOUT_REQUIRED",
    "ENTRY_SESSION_PENDING",
    "ENTRY_TERMS_MET",
    "MARKET_CLOSED",
    "SESSION_SETTLING",
]


class EntryApplicabilityRead(BaseModel):
    status: Literal["NOT_APPLICABLE", "INVALIDATED", "EXPIRED", "UNVERIFIED", "OUTSIDE_ZONE", "AWAITING_CONFIRMATION", "APPLICABLE"]
    reason_code: EntryApplicabilityReasonCode
    controlling_blocker: str | None = None
    quote_timing_status: Literal["FETCH_ONLY", "UNKNOWN"] | None = Field(default=None, exclude_if=lambda value: value is None)
    batch_fetched_at: datetime | None = Field(default=None, exclude_if=lambda value: value is None)
    assessed_at: datetime
    quote_session_date: date | None = None
    source_observed_at: datetime | None = None
    publication_observed_at: datetime | None = None
    recheck_at: datetime | None = None
    price_basis: Literal["CURRENT", "LAST_CLOSE"] = "CURRENT"


@dataclass(frozen=True)
class PriceBasisEvent:
    effective_date: date
    kind: str
    verified: bool = True


_PRICE_BASIS_KINDS = {"SPLIT", "BONUS", "RIGHTS", "MERGER", "EX_DIVIDEND"}


@dataclass(frozen=True)
class EntryPathFacts:
    sessions: tuple[date, ...] = ()
    completed_sessions: frozenset[date] = frozenset()
    reliable_lows: tuple[tuple[date, float], ...] = ()
    complete: bool = False
    basis_changed: bool = False
    confirmed_on: date | None = None
    ended_sessions: frozenset[date] | None = None


def evaluate_entry_applicability(
    *, decision, plan, eligibility, quote, reference_date: date,
    now: datetime, market_open: bool, coverage_verified: bool,
    path: EntryPathFacts = EntryPathFacts(), withdrawn: bool = False,
    publication_observed_at: datetime | None = None,
    recheck_at: datetime | None = None,
    session_open_at: datetime | None = None,
    session_close_at: datetime | None = None,
) -> EntryApplicabilityRead:
    """Stable precedence: withdrawal; permission; invalidation; expiry; evidence; zone; timing."""
    closing_basis = not market_open and session_close_at is not None
    def result(status, code):
        return EntryApplicabilityRead(
            status=status, reason_code=code, assessed_at=now,
            quote_timing_status=(("FETCH_ONLY" if getattr(quote, "batch_fetched_at", None) else "UNKNOWN") if code == "QUOTE_UNUSABLE" and not getattr(quote, "source_observed_at", None) else None),
            batch_fetched_at=getattr(quote, "batch_fetched_at", None),
            controlling_blocker=(decision.blocker_codes[0] if decision and decision.blocker_codes else None),
            quote_session_date=date.fromisoformat(quote.as_of_trade_date) if quote and quote.as_of_trade_date else None,
            source_observed_at=getattr(quote, "source_observed_at", None),
            publication_observed_at=publication_observed_at,
            recheck_at=recheck_at if closing_basis else None,
            price_basis="LAST_CLOSE" if closing_basis else "CURRENT",
        )

    if withdrawn:
        return result("INVALIDATED", "PUBLICATION_INVALIDATED")
    if decision is None or decision.display_action != "POTENTIAL_BUY":
        return result("NOT_APPLICABLE", "ACTION_NOT_PERMITTED")
    if eligibility is None or eligibility.status != "ELIGIBLE":
        return result("NOT_APPLICABLE", "ELIGIBILITY_BLOCKED")
    if plan is None or plan.status != "VALID_ENTRY_PLAN":
        return result("NOT_APPLICABLE", "NO_ENTRY_PLAN")

    sessions = tuple(sorted(day for day in path.sessions if day > reference_date))
    expiry = plan.expiry_sessions
    permitted = sessions[:expiry] if expiry and expiry > 0 else sessions
    stop = plan.invalidation_price if plan.invalidation_price is not None else plan.stop_loss
    if stop is not None and any(day in permitted and low <= stop for day, low in path.reliable_lows):
        return result("INVALIDATED", "STOP_BREACHED")
    if path.basis_changed:
        return result("INVALIDATED", "PRICE_BASIS_CHANGED")
    if expiry and (len(sessions) > expiry or (
        len(sessions) == expiry and sessions[-1] in (path.ended_sessions if path.ended_sessions is not None else path.completed_sessions)
    )):
        return result("EXPIRED", "PLAN_EXPIRED")
    if not coverage_verified:
        return result("UNVERIFIED", "COVERAGE_UNKNOWN")
    price = quote.current_price if quote else None
    observed_at = getattr(quote, "source_observed_at", None)
    expected_day = session_close_at.date() if closing_basis else now.date()
    quote_timing_valid = bool(observed_at and observed_at <= now and (
        abs((observed_at - session_close_at).total_seconds()) <= getattr(quote, "max_age_seconds", 1800)
        if closing_basis else (session_open_at is None or observed_at >= session_open_at)
        and (now - observed_at).total_seconds() <= getattr(quote, "max_age_seconds", 1800)))
    if (price is None or not isfinite(price) or price <= 0 or quote.observation_status not in {"FINALIZED", "PROVISIONAL"}
        or getattr(quote, "data_quality", None) == "SUSPICIOUS"
        or not quote_timing_valid
        or quote.as_of_trade_date != expected_day.isoformat()):
        return result("UNVERIFIED", "QUOTE_UNUSABLE")
    if not path.complete:
        return result("UNVERIFIED", "PATH_INCOMPLETE")
    low = plan.preferred_entry_zone_low if plan.preferred_entry_zone_low is not None else plan.entry_zone_low
    high = plan.preferred_entry_zone_high if plan.preferred_entry_zone_high is not None else plan.entry_zone_high
    if (low is None or high is None or stop is None or expiry is None or expiry <= 0
        or not all(isfinite(value) and value > 0 for value in (low, high, stop))
        or not stop < low <= high
        or plan.entry_timing == "BREAKOUT" and (plan.trigger_price is None or plan.trigger_price <= 0)):
        return result("UNVERIFIED", "TERMS_UNKNOWN")
    if plan.target_low is not None and price >= plan.target_low:
        return result("OUTSIDE_ZONE", "TARGET_REACHED")
    if price < low:
        return result("OUTSIDE_ZONE", "BELOW_ENTRY_ZONE")
    if price > high:
        return result("OUTSIDE_ZONE", "ABOVE_ENTRY_ZONE")
    if plan.entry_timing == "BREAKOUT" and path.confirmed_on is None:
        return result("AWAITING_CONFIRMATION", "COMPLETED_BREAKOUT_REQUIRED")
    if not closing_basis and (not market_open or not sessions or now.date() not in permitted
        or now.date() <= reference_date
        or path.confirmed_on is not None and now.date() <= path.confirmed_on):
        return result("AWAITING_CONFIRMATION", "ENTRY_SESSION_PENDING")
    return result("APPLICABLE", "ENTRY_TERMS_MET")


def build_entry_path_facts(*, prices, revisions, sessions, completed_sessions,
                           reference_date, published_at, journal_started_at,
                           basis_events=(), plan=None, average_volume=None, ended_sessions=None):
    """Recover overwritten traded lows, while retaining continuity uncertainty."""
    from types import SimpleNamespace
    from zoneinfo import ZoneInfo
    from app.modules.stock_details.decision.technical import is_valid_ohlc_row
    expected = tuple(day for day in sessions if day > reference_date)
    expiry = plan.expiry_sessions if plan else None
    relevant = expected[:expiry] if expiry and expiry > 0 else expected
    publication_day = published_at.astimezone(ZoneInfo("Asia/Dhaka")).date() if published_at else None
    complete = bool(published_at and journal_started_at and journal_started_at <= published_at)
    def within_permitted_interval(event):
        # Effective dates may fall on holidays/weekends between trading bars.
        return bool(relevant and reference_date < event.effective_date <= relevant[-1])
    basis_dates = sorted(event.effective_date for event in basis_events
        if event.verified and event.kind in _PRICE_BASIS_KINDS and within_permitted_interval(event))
    changed_on = basis_dates[0] if basis_dates else None
    uncertain_basis = sorted(event.effective_date for event in basis_events
        if not event.verified and event.kind in _PRICE_BASIS_KINDS and within_permitted_interval(event))
    if uncertain_basis:
        complete = False
    comparable_until = min(basis_dates + uncertain_basis) if basis_dates or uncertain_basis else None
    # Raw lows from the action session onward are in incompatible price units.
    comparable = tuple(day for day in relevant if comparable_until is None or day < comparable_until)
    by_day = {price.trade_date: price for price in prices}
    lows = []
    confirmed = None
    def valid(row):
        return row.data_quality_flag != "SUSPICIOUS" and is_valid_ohlc_row(row)
    for day in comparable:
        row = by_day.get(day)
        ordered = publication_day is not None and day > publication_day
        if not ordered or row is None or (row.volume > 0 and not valid(row)):
            complete = False
        if ordered and row is not None and row.volume > 0 and valid(row):
            lows.append((day, float(row.low_price)))
            if (day in completed_sessions and plan and plan.entry_timing == "BREAKOUT"
                and plan.trigger_price is not None and float(row.close_price) > plan.trigger_price
                and average_volume and row.volume >= average_volume and confirmed is None):
                confirmed = day
    for revision in revisions:
        if published_at is None or revision.observed_at < published_at:
            continue
        day = revision.session_date
        if day not in comparable or publication_day is None or day <= publication_day:
            continue
        for payload in (revision.payload, revision.previous_payload):
            if not payload or payload.get("trade_date") != day.isoformat():
                continue
            try:
                row = SimpleNamespace(**{key: (float(payload[key]) if payload.get(key) is not None else None)
                    for key in ("open_price", "high_price", "low_price", "close_price")},
                    data_quality_flag=payload.get("data_quality_flag"), volume=payload.get("volume", 0))
                if row.volume > 0 and valid(row):
                    lows.append((day, row.low_price))
            except (ValueError, TypeError, KeyError):
                complete = False
    return EntryPathFacts(
        sessions=expected, completed_sessions=frozenset(completed_sessions), reliable_lows=tuple(lows),
        complete=complete, confirmed_on=confirmed,
        basis_changed=changed_on is not None,
        ended_sessions=frozenset(ended_sessions) if ended_sessions is not None else None,
    )
