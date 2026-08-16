import asyncio
import inspect
import logging
import time
from collections.abc import AsyncGenerator
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, MetaData, func
from sqlalchemy.dialects.postgresql import UUID as PostgresUUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.core_config import get_settings

logger = logging.getLogger(__name__)

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

# AsyncSession is not safe for concurrent awaitables. Concurrent asyncio.gather()
# on one request session leaves asyncpg in "manually started transaction" state,
# and that poisoned connection is returned to the pool for later requests
# (including /auth/me and /health/ready).
_POISONED_CONNECTION_MARKERS = (
    "cannot use Connection.transaction() in a manually started transaction",
    "This session is provisioning a new connection; concurrent operations are not permitted",
    "concurrent operations are not permitted",
)
_POOL_DISPOSE_COOLDOWN_SECONDS = 5.0
_cleanup_tasks: set[asyncio.Task[None]] = set()
_pool_dispose_lock: asyncio.Lock | None = None
_last_pool_dispose_at = 0.0


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class UUIDPrimaryKeyMixin:
    id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )


settings = get_settings()
async_engine = create_async_engine(
    settings.async_database_url,
    pool_pre_ping=True,
    pool_recycle=1800,
    pool_reset_on_return="rollback",
)
AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


def is_poisoned_connection_error(exc: BaseException) -> bool:
    """True when asyncpg/SQLAlchemy left a connection in a nested-transaction state."""
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        message = str(current)
        if any(marker in message for marker in _POISONED_CONNECTION_MARKERS):
            return True
        current = current.__cause__ or current.__context__
    return False


def _pool_dispose_lock_for_loop() -> asyncio.Lock:
    global _pool_dispose_lock
    if _pool_dispose_lock is None:
        _pool_dispose_lock = asyncio.Lock()
    return _pool_dispose_lock


async def discard_unusable_session(session: AsyncSession) -> None:
    """Rollback and invalidate so a failed/cancelled request cannot poison the pool."""
    try:
        await session.rollback()
    except Exception:
        logger.debug("Session rollback failed while discarding connection", exc_info=True)

    invalidate = getattr(session, "invalidate", None)
    if callable(invalidate):
        try:
            result = invalidate()
            if inspect.isawaitable(result):
                await result
            return
        except Exception:
            logger.debug("Session invalidate failed while discarding connection", exc_info=True)

    try:
        await session.close()
    except Exception:
        logger.debug("Session close failed while discarding connection", exc_info=True)


async def recycle_pool_after_poisoned_connection(exc: BaseException) -> None:
    """Drop checked-in pool connections after asyncpg nested-transaction errors."""
    if not is_poisoned_connection_error(exc):
        return

    global _last_pool_dispose_at
    async with _pool_dispose_lock_for_loop():
        now = time.monotonic()
        if now - _last_pool_dispose_at < _POOL_DISPOSE_COOLDOWN_SECONDS:
            return
        logger.warning(
            "Disposing SQLAlchemy connection pool after poisoned asyncpg transaction state"
        )
        await async_engine.dispose()
        _last_pool_dispose_at = time.monotonic()


async def _protected_discard(session: AsyncSession) -> None:
    task = asyncio.create_task(discard_unusable_session(session), name="discard-db-session")
    _cleanup_tasks.add(task)
    task.add_done_callback(_cleanup_tasks.discard)
    try:
        await asyncio.shield(task)
    except asyncio.CancelledError:
        return
    except Exception:
        logger.debug("Failed to discard unusable DB session", exc_info=True)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except BaseException as exc:
            # CancelledError is BaseException in 3.9+. Ordinary HTTP/app errors
            # must not invalidate a healthy connection; only cancellation and
            # nested-transaction poison need the connection dropped.
            if not isinstance(exc, Exception) or is_poisoned_connection_error(exc):
                await _protected_discard(session)
            raise
