"""One short PostgreSQL transaction lock per exchange/session publication."""
from hashlib import blake2b

from sqlalchemy import func, select


async def lock_session_publication(session, *, exchange, session_date):
    key = int.from_bytes(blake2b(
        f"market-publication:{exchange.value}:{session_date.isoformat()}".encode(), digest_size=8,
    ).digest(), "big", signed=True)
    await session.execute(select(func.pg_advisory_xact_lock(key)))
