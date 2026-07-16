from __future__ import annotations

from datetime import date

from app.modules.market_data.market_data_schemas import MarketFreshnessRead

PULSE_DEGRADED_EMPTY_STATES = frozenset(
    {"waiting-snapshot", "insufficient-history", "no-attention"},
)


def resolve_pulse_decision_date(freshness: MarketFreshnessRead) -> date | None:
    """Canonical decision session date for pulse eligibility and cache identity."""
    return freshness.decision_session_date or freshness.trade_date


def is_pulse_degraded_empty_state(empty_state: str) -> bool:
    return empty_state in PULSE_DEGRADED_EMPTY_STATES
