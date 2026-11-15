"""One short PostgreSQL transaction lock per exchange/session publication."""
from hashlib import blake2b

from sqlalchemy import func, select


async def lock_session_publication(session, *, exchange, session_date):
    key = int.from_bytes(blake2b(
        f"market-publication:{exchange.value}:{session_date.isoformat()}".encode(), digest_size=8,
    ).digest(), "big", signed=True)
    await session.execute(select(func.pg_advisory_xact_lock(key)))


def market_event_delivery_order(*, stock_id, event_date, title, source):
    """The shared natural-key acquisition order for multi-event transactions."""
    return (str(stock_id), event_date.isoformat(), title, source)


async def lock_market_event_delivery(session, *, stock_id, event_date, title, source):
    # The natural-key lock also serializes first inserts before a row exists.
    key = int.from_bytes(blake2b(
        repr(("market-event", *market_event_delivery_order(stock_id=stock_id,
            event_date=event_date, title=title, source=source))).encode(), digest_size=8,
    ).digest(), "big", signed=True)
    await session.execute(select(func.pg_advisory_xact_lock(key)))
