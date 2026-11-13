"""One same-session eligible cohort and exact equal-weight leadership measure."""
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from fractions import Fraction
from math import isfinite


def is_eligible_session_candidate(row, decision_date=None) -> bool:
    if row.decision is None or row.eligibility is None or row.eligibility.status != "ELIGIBLE":
        return False
    day = decision_date or row.eligibility.exchange_session_date
    return bool(day and row.eligibility.exchange_session_date == day
        and row.eligibility.latest_trade_date == day and row.session.latest_trade_date == day
        and row.technical_snapshot.latest_trade_date == day.isoformat())


def sector_name(stock):
    return (getattr(stock, "sector", None) or getattr(stock, "category", None) or "Unclassified").strip() or "Unclassified"


def eligible_sector_returns(stock_changes):
    """Omit incomplete sectors without suppressing another complete sector."""
    buckets = defaultdict(list)
    for stock, change in stock_changes:
        buckets[sector_name(stock)].append(change)
    measured = [(name, sum(changes, Fraction()) / len(changes), len(changes))
        for name, changes in buckets.items() if len(changes) >= 3 and all(change is not None for change in changes)]
    measured.sort(key=lambda item: (-item[1], item[0]))
    return measured, len(buckets) - len(measured)


def measured_price_change(snapshot, session=None) -> Fraction | None:
    """Prefer the same-session stored decimal; never quantize a represented fallback."""
    stored = getattr(session, "change_percent", None)
    same_session = str(getattr(session, "latest_trade_date", None)) == str(snapshot.latest_trade_date)
    ratio = getattr(snapshot, "price_change_percent_ratio", None)
    if same_session and stored is not None:
        value = stored
    elif ratio is not None:
        return ratio if isinstance(ratio, Fraction) else ratio.as_fraction()
    elif session is not None and hasattr(session, "change_percent"):
        return None  # An old canonical row cannot recover an absent exact source basis.
    else:
        value = snapshot.price_change_percent
    if value is None:
        return None
    try:
        if isinstance(value, Fraction):
            return value
        decimal = value if isinstance(value, Decimal) else Decimal(str(value))
        return Fraction(decimal) if decimal.is_finite() else None
    except (ValueError, InvalidOperation):
        return None



def measured_price_leader(candidates):
    """Select only observed price changes, including when every observed move is negative."""
    known = ((row, change) for row, change in candidates if change is not None and isfinite(change))
    selected = max(known, key=lambda item: item[1], default=None)
    return selected[0] if selected else None

