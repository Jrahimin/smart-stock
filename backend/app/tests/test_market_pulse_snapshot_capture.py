from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.core.enums import ExchangeCode
from app.modules.market_pulse.market_pulse_snapshot_service import MarketPulseSnapshotService


def _universe_row() -> object:
    return SimpleNamespace(
        stock=SimpleNamespace(id=uuid4()),
        technical_snapshot=SimpleNamespace(),
        decision=SimpleNamespace(canonical=SimpleNamespace(shared_decision_id="id", input_hash="a" * 64)),
        session=SimpleNamespace(
            latest_trade_date=date(2026, 7, 21),
            updated_at=datetime(2026, 7, 21, tzinfo=timezone.utc),
        ),
    )


@pytest.mark.asyncio
async def test_capture_persists_one_qualified_finalized_session(monkeypatch: pytest.MonkeyPatch) -> None:
    session_date = date(2026, 7, 21)
    generation = datetime(2026, 7, 21, 9, tzinfo=timezone.utc)
    rows = [_universe_row() for _ in range(20)]
    market_repository = MagicMock()
    market_repository.get_decision_session_freshness = AsyncMock(
        side_effect=[(session_date, generation), (session_date, generation)]
    )
    universe_service = MagicMock(market_repository=market_repository)
    universe_service.recompute_scored_universe = AsyncMock(return_value=rows)
    snapshot_repository = MagicMock()
    snapshot_repository.persist_if_absent = AsyncMock(return_value=True)
    redis = MagicMock()
    redis.delete_by_pattern = AsyncMock(return_value=2)

    monkeypatch.setattr(
        "app.modules.market_pulse.market_pulse_service.is_eligible_pulse_candidate",
        lambda row, decision_date: True,
    )
    monkeypatch.setattr(
        "app.modules.market_pulse.market_pulse_snapshot_service.technical_snapshot_from_read",
        lambda _: SimpleNamespace(latest_trade_date=session_date.isoformat()),
    )
    monkeypatch.setattr(
        "app.modules.market_pulse.market_pulse_snapshot_service.compute_universe_payload_revision",
        lambda _: "b" * 64,
    )
    monkeypatch.setattr(
        "app.modules.market_pulse.pulse_score.compute_pulse_score",
        lambda snapshot, decision: SimpleNamespace(total=61),
    )

    result = await MarketPulseSnapshotService(
        universe_service=universe_service,
        snapshot_repository=snapshot_repository,
        redis=redis,
    ).capture_finalized_session(exchange=ExchangeCode.DSE, session_date=session_date)

    assert result.status == "created"
    values = snapshot_repository.persist_if_absent.await_args.args[0]
    assert values.eligible_candidate_count == 20
    assert values.opportunity_score == 61
    assert values.session_date == session_date
    redis.delete_by_pattern.assert_awaited_once()


@pytest.mark.asyncio
async def test_capture_skips_insufficient_or_unstable_source_data(monkeypatch: pytest.MonkeyPatch) -> None:
    session_date = date(2026, 7, 21)
    generation = datetime(2026, 7, 21, 9, tzinfo=timezone.utc)
    market_repository = MagicMock()
    market_repository.get_decision_session_freshness = AsyncMock(
        side_effect=[(session_date, generation), (session_date, generation)]
    )
    universe_service = MagicMock(market_repository=market_repository)
    universe_service.recompute_scored_universe = AsyncMock(return_value=[_universe_row() for _ in range(19)])
    snapshot_repository = MagicMock()
    snapshot_repository.persist_if_absent = AsyncMock()

    monkeypatch.setattr(
        "app.modules.market_pulse.market_pulse_service.is_eligible_pulse_candidate",
        lambda row, decision_date: True,
    )
    monkeypatch.setattr(
        "app.modules.market_pulse.market_pulse_snapshot_service.technical_snapshot_from_read",
        lambda _: SimpleNamespace(latest_trade_date=session_date.isoformat()),
    )
    monkeypatch.setattr(
        "app.modules.market_pulse.pulse_score.compute_pulse_score",
        lambda snapshot, decision: SimpleNamespace(total=61),
    )

    result = await MarketPulseSnapshotService(
        universe_service=universe_service,
        snapshot_repository=snapshot_repository,
        redis=MagicMock(),
    ).capture_finalized_session(exchange=ExchangeCode.DSE, session_date=session_date)

    assert result.status == "insufficient-candidates"
    snapshot_repository.persist_if_absent.assert_not_awaited()
