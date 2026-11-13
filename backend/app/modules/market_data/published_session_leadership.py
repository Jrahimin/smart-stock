"""Compact display projection built once for each immutable decision publication."""
from decimal import Decimal

from app.modules.market_data.session_leadership import (
    eligible_sector_returns,
    is_eligible_session_candidate,
    measured_price_change,
    measured_price_leader,
)


def leadership_cache_key(exchange, generation_id):
    return f"session-leaders:eligible-v3:{exchange.value}:{generation_id}"


def build_published_session_leadership(canonical):
    rows = [row for row in canonical.rows if is_eligible_session_candidate(row, canonical.session_trade_date)]
    changes = [(row, measured_price_change(row.technical_snapshot, row.session)) for row in rows]
    sectors, excluded = eligible_sector_returns((row.stock, change) for row, change in changes)
    leader = measured_price_leader(changes)
    change = measured_price_change(leader.technical_snapshot, leader.session) if leader else None
    return {
        "sectors": [{"name": name, "change_percent": str(Decimal(value.numerator) / Decimal(value.denominator)),
            "stock_count": count} for name, value, count in sectors],
        "top_gainer": {"symbol": leader.stock.symbol, "name": leader.stock.name,
            "change_percent": str(Decimal(change.numerator) / Decimal(change.denominator))} if leader else None,
        "decision_generation_id": canonical.market_sync_id,
        "decision_session_date": canonical.session_trade_date.isoformat(),
        "excluded_sector_count": excluded,
        "leadership_status": "UNAVAILABLE" if not sectors else "MEASURED" if any(value > 0 for _, value, _ in sectors) else "NO_ADVANCING_SECTOR",
    }
