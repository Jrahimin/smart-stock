from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.core.core_config import Settings
from app.core.enums import ExchangeCode
from app.modules.market_pulse.market_pulse_history import compute_pulse_opportunity_aggregate
from app.modules.market_pulse.market_pulse_service import MarketPulseService
from app.modules.market_pulse.market_pulse_snapshot_repository import PulseSnapshotIdentity


def _row(score: int, *, stock_id=None):
    return SimpleNamespace(
        stock=SimpleNamespace(id=stock_id or uuid4()),
        snapshot=SimpleNamespace(latest_trade_date="2026-07-21"),
        decision=SimpleNamespace(canonical=SimpleNamespace(shared_decision_id="decision", input_hash="a" * 64)),
        score=SimpleNamespace(total=score),
    )


def test_aggregate_fingerprint_is_independent_of_input_order() -> None:
    first, second = _row(60), _row(70)

    assert compute_pulse_opportunity_aggregate([first, second]) == compute_pulse_opportunity_aggregate(
        [second, first]
    )


@pytest.mark.asyncio
async def test_history_requires_contiguous_current_snapshot_and_calculates_five_day_fields() -> None:
    session_dates = [
        date(2026, 7, 21),
        date(2026, 7, 20),
        date(2026, 7, 17),
        date(2026, 7, 16),
        date(2026, 7, 15),
    ]
    current_row = _row(68)
    aggregate = compute_pulse_opportunity_aggregate([current_row])
    snapshots = [
        SimpleNamespace(
            session_date=session_date,
            opportunity_score=score,
            eligible_population_fingerprint=aggregate.eligible_population_fingerprint,
        )
        for session_date, score in zip(session_dates, [68, 65, 64, 62, 60], strict=True)
    ]
    repository = MagicMock()
    repository.list_for_sessions = AsyncMock(return_value=snapshots)
    market_data = MagicMock()
    market_data.list_recent_finalized_session_dates = AsyncMock(return_value=session_dates)
    service = MarketPulseService(
        market_data_service=market_data,
        universe_service=MagicMock(),
        redis=MagicMock(),
        settings=Settings(),
        snapshot_repository=repository,
    )

    result = await service._resolve_opportunity_score(
        exchange=ExchangeCode.DSE,
        decision_date=session_dates[0],
        briefing_rows=[current_row],
    )

    assert result.history == [60, 62, 64, 65, 68]
    assert result.previous_session == 65
    assert result.weekly_average == 64
    assert result.trend_label == "Improving"
    identity = repository.list_for_sessions.await_args.kwargs["identity"]
    assert isinstance(identity, PulseSnapshotIdentity)


@pytest.mark.asyncio
async def test_history_stops_at_a_missing_finalized_session() -> None:
    session_dates = [date(2026, 7, 21), date(2026, 7, 20), date(2026, 7, 17)]
    current_row = _row(60)
    aggregate = compute_pulse_opportunity_aggregate([current_row])
    repository = MagicMock()
    repository.list_for_sessions = AsyncMock(
        return_value=[
            SimpleNamespace(
                session_date=session_dates[0],
                opportunity_score=60,
                eligible_population_fingerprint=aggregate.eligible_population_fingerprint,
            ),
            SimpleNamespace(
                session_date=session_dates[2],
                opportunity_score=55,
                eligible_population_fingerprint="old",
            ),
        ]
    )
    market_data = MagicMock()
    market_data.list_recent_finalized_session_dates = AsyncMock(return_value=session_dates)
    service = MarketPulseService(
        market_data_service=market_data,
        universe_service=MagicMock(),
        redis=MagicMock(),
        settings=Settings(),
        snapshot_repository=repository,
    )

    result = await service._resolve_opportunity_score(
        exchange=ExchangeCode.DSE,
        decision_date=session_dates[0],
        briefing_rows=[current_row],
    )

    assert result.history == [60]
    assert result.previous_session is None
    assert result.weekly_average is None
    assert result.trend_label is None


@pytest.mark.asyncio
async def test_history_hides_the_current_series_when_current_lineage_changes() -> None:
    current_date = date(2026, 7, 21)
    repository = MagicMock()
    repository.list_for_sessions = AsyncMock(
        return_value=[
            SimpleNamespace(
                session_date=current_date,
                opportunity_score=60,
                eligible_population_fingerprint="stale-fingerprint",
            )
        ]
    )
    market_data = MagicMock()
    market_data.list_recent_finalized_session_dates = AsyncMock(return_value=[current_date])
    service = MarketPulseService(
        market_data_service=market_data,
        universe_service=MagicMock(),
        redis=MagicMock(),
        settings=Settings(),
        snapshot_repository=repository,
    )

    result = await service._resolve_opportunity_score(
        exchange=ExchangeCode.DSE,
        decision_date=current_date,
        briefing_rows=[_row(60)],
    )

    assert result.history == []
