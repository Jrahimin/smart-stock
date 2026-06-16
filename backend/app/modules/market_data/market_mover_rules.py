from __future__ import annotations

from datetime import date

from app.modules.stock_details.decision.technical import TechnicalSnapshot


def is_eligible_session_mover(snapshot: TechnicalSnapshot, session_trade_date: date | None) -> bool:
    if session_trade_date is None or snapshot.latest_trade_date is None:
        return False

    try:
        latest_trade_date = date.fromisoformat(snapshot.latest_trade_date)
    except ValueError:
        return False

    if latest_trade_date != session_trade_date:
        return False
    if snapshot.latest_price is None or snapshot.latest_price <= 0:
        return False
    if snapshot.volume <= 0:
        return False
    return snapshot.price_change_percent is not None
