from __future__ import annotations

import logging
from datetime import date

from app.core.constants.trading_constants import (
    DECISION_TAXONOMY_VERSION,
    PULSE_SCORE_VERSION,
    TRADING_INPUT_SCHEMA_VERSION,
    TRADING_STRATEGY_VERSION,
    TRADING_THRESHOLD_VERSION,
)
from app.core.core_config import Settings
from app.core.enums import ExchangeCode
from app.core.redis_client import OptionalRedisClient
from app.jobs.market_session_schedule import current_cache_ttl_seconds
from app.modules.market_pulse.market_pulse_session import is_pulse_degraded_empty_state

PULSE_CACHE_REVISION = "market-generation-v1"
PULSE_EMPTY_CACHE_TTL_SECONDS = 300
PULSE_CACHE_KEY_NAMES: tuple[str, ...] = ("response", "summary")
logger = logging.getLogger(__name__)


def pulse_cache_key(
    section: str,
    exchange: ExchangeCode,
    decision_date: date | None,
    market_sync_id: str | None = None,
) -> str:
    date_token = decision_date.isoformat() if decision_date is not None else "none"
    generation_prefix = f"{market_sync_id}:" if market_sync_id else ""
    return (
        f"pulse:{section}:{exchange.value}:{date_token}:{generation_prefix}"
        f"{PULSE_CACHE_REVISION}:"
        f"{TRADING_STRATEGY_VERSION}:{TRADING_THRESHOLD_VERSION}:"
        f"{TRADING_INPUT_SCHEMA_VERSION}:{PULSE_SCORE_VERSION}:"
        f"{DECISION_TAXONOMY_VERSION}"
    )


def pulse_cache_invalidation_pattern(exchange: ExchangeCode) -> str:
    return f"pulse:*:{exchange.value}:*"


async def invalidate_pulse_cache(redis: OptionalRedisClient, exchange: ExchangeCode) -> int:
    """Best-effort targeted invalidation after a persisted session observation."""

    deleted = await redis.delete_by_pattern(pulse_cache_invalidation_pattern(exchange))
    if deleted:
        logger.info("Deleted %s pulse cache keys for %s", deleted, exchange.value)
    return deleted


def pulse_cache_ttl_seconds(settings: Settings, *, empty_state: str) -> int:
    if is_pulse_degraded_empty_state(empty_state):
        return PULSE_EMPTY_CACHE_TTL_SECONDS
    return current_cache_ttl_seconds(settings)
