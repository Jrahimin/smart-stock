from __future__ import annotations

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
from app.jobs.market_session_schedule import current_cache_ttl_seconds
from app.modules.market_pulse.market_pulse_session import is_pulse_degraded_empty_state

PULSE_CACHE_REVISION = "decision-date-v1"
PULSE_EMPTY_CACHE_TTL_SECONDS = 300
PULSE_CACHE_KEY_NAMES: tuple[str, ...] = ("response", "summary")


def pulse_cache_key(section: str, exchange: ExchangeCode, decision_date: date | None) -> str:
    date_token = decision_date.isoformat() if decision_date is not None else "none"
    return (
        f"pulse:{section}:{exchange.value}:{date_token}:"
        f"{PULSE_CACHE_REVISION}:"
        f"{TRADING_STRATEGY_VERSION}:{TRADING_THRESHOLD_VERSION}:"
        f"{TRADING_INPUT_SCHEMA_VERSION}:{PULSE_SCORE_VERSION}:"
        f"{DECISION_TAXONOMY_VERSION}"
    )


def pulse_cache_invalidation_pattern(exchange: ExchangeCode) -> str:
    return f"pulse:*:{exchange.value}:*"


def pulse_cache_ttl_seconds(settings: Settings, *, empty_state: str) -> int:
    if is_pulse_degraded_empty_state(empty_state):
        return PULSE_EMPTY_CACHE_TTL_SECONDS
    return current_cache_ttl_seconds(settings)
