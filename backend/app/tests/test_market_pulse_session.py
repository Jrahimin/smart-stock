from __future__ import annotations

from datetime import date, datetime

import pytest

from app.core.core_config import Settings
from app.core.enums import ExchangeCode, MarketSessionStatus
from app.modules.market_data.market_data_schemas import MarketFreshnessRead
from app.modules.market_pulse.market_pulse_cache import (
    PULSE_CACHE_REVISION,
    PULSE_EMPTY_CACHE_TTL_SECONDS,
    pulse_cache_invalidation_pattern,
    pulse_cache_key,
    pulse_cache_ttl_seconds,
)
from app.modules.market_pulse.market_pulse_session import (
    is_pulse_degraded_empty_state,
    resolve_pulse_decision_date,
)
from app.modules.market_pulse.market_pulse_service import is_eligible_pulse_candidate
from app.tests.test_market_pulse_alignment import _universe_row


def _freshness(
    *,
    trade_date: date | None,
    decision_session_date: date | None = None,
    market_status: MarketSessionStatus = MarketSessionStatus.PRE_OPEN,
) -> MarketFreshnessRead:
    return MarketFreshnessRead(
        exchange=ExchangeCode.DSE,
        trade_date=trade_date,
        last_synced_at=datetime(2026, 7, 15, 9, 0),
        decision_session_date=decision_session_date,
        live_data_as_of=datetime(2026, 7, 15, 9, 0) if trade_date else None,
        is_live_session=trade_date is not None,
        next_sync_at=None,
        snapshot_interval_minutes=15,
        market_sync_interval_seconds=900,
        dashboard_cache_ttl_seconds=28_800,
        expected_delay_minutes=15,
        market_open_time="10:00",
        market_close_time="15:00",
        market_status=market_status,
        freshness_label="Snapshot prices",
    )


def test_resolve_pulse_decision_date_prefers_decision_session_over_live_trade_date() -> None:
    completed = date(2026, 7, 14)
    live = date(2026, 7, 15)
    freshness = _freshness(trade_date=live, decision_session_date=completed)

    assert resolve_pulse_decision_date(freshness) == completed


def test_resolve_pulse_decision_date_falls_back_to_trade_date() -> None:
    live = date(2026, 7, 15)
    freshness = _freshness(trade_date=live, decision_session_date=None)

    assert resolve_pulse_decision_date(freshness) == live


def test_pre_open_candidates_are_not_filtered_when_live_trade_date_is_newer() -> None:
    completed = date(2026, 7, 14)
    live = date(2026, 7, 15)
    row = _universe_row(stock_date=completed, exchange_date=completed)
    decision_date = resolve_pulse_decision_date(
        _freshness(trade_date=live, decision_session_date=completed),
    )

    assert is_eligible_pulse_candidate(row, decision_date)
    assert not is_eligible_pulse_candidate(row, live)


def test_holiday_weekend_uses_last_decision_session_date() -> None:
    completed = date(2026, 7, 11)  # Friday session before weekend
    live = date(2026, 7, 11)
    freshness = _freshness(
        trade_date=live,
        decision_session_date=completed,
        market_status=MarketSessionStatus.HOLIDAY,
    )
    row = _universe_row(stock_date=completed, exchange_date=completed)

    assert resolve_pulse_decision_date(freshness) == completed
    assert is_eligible_pulse_candidate(row, resolve_pulse_decision_date(freshness))


def test_pulse_cache_key_includes_decision_date_and_revision() -> None:
    decision_date = date(2026, 7, 14)
    key = pulse_cache_key("summary", ExchangeCode.DSE, decision_date)

    assert "2026-07-14" in key
    assert PULSE_CACHE_REVISION in key
    assert pulse_cache_key("summary", ExchangeCode.DSE, date(2026, 7, 15)) != key


def test_pulse_cache_invalidation_pattern_matches_dated_keys() -> None:
    pattern = pulse_cache_invalidation_pattern(ExchangeCode.DSE)
    key = pulse_cache_key("summary", ExchangeCode.DSE, date(2026, 7, 14))

    assert pattern == "pulse:*:DSE:*"
    assert key.startswith("pulse:summary:DSE:")


def test_pulse_degraded_empty_states_use_shorter_ttl() -> None:
    settings = Settings()

    assert is_pulse_degraded_empty_state("insufficient-history")
    assert is_pulse_degraded_empty_state("waiting-snapshot")
    assert not is_pulse_degraded_empty_state("none")

    assert pulse_cache_ttl_seconds(settings, empty_state="insufficient-history") == PULSE_EMPTY_CACHE_TTL_SECONDS
    assert (
        pulse_cache_ttl_seconds(settings, empty_state="none")
        > PULSE_EMPTY_CACHE_TTL_SECONDS
    )
