from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.core.enums import ExchangeCode, MarketDataState
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


def _setup_source(service, generation, rows):
    generation.data_state = MarketDataState.FINALIZED
    service.get_canonical_universe = AsyncMock(return_value=SimpleNamespace(
        generation=generation, rows=rows, updating=False, withdrawn=False,
        payload=SimpleNamespace(decision_status="CURRENT", strategy_version="trading-intelligence-v3",
            threshold_version="v3-thresholds", input_schema_version="v3-inputs", decision_taxonomy_version="v1",
            payload_revision="b" * 64),
    ))
    service.decision_snapshot_repository.latest_publication = AsyncMock(return_value=SimpleNamespace(
        invalidated_at=None, generation_id=generation.sync_id, session_date=generation.trade_date,
    ))
    service.resolve_generation_context = AsyncMock(return_value=generation)
    service.is_input_generation_current = AsyncMock(return_value=True)


@pytest.mark.asyncio
async def test_capture_persists_one_qualified_finalized_session(monkeypatch: pytest.MonkeyPatch) -> None:
    session_date = date(2026, 7, 21)
    generation = datetime(2026, 7, 21, 9, tzinfo=timezone.utc)
    rows = [_universe_row() for _ in range(20)]
    published = SimpleNamespace(
        trade_date=session_date,
        sync_id="G123",
        source_last_synced_at=generation,
    )
    universe_service = MagicMock()
    _setup_source(universe_service, published, rows)
    snapshot_repository = MagicMock()
    snapshot_repository.persist_if_absent = AsyncMock(return_value=True)
    snapshot_repository.lock_publication = AsyncMock()
    snapshot_repository.list_for_sessions = AsyncMock(return_value=[])
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
    assert values.identity.strategy_version == "trading-intelligence-v3"
    redis.delete_by_pattern.assert_awaited_once()


@pytest.mark.asyncio
async def test_capture_skips_insufficient_or_unstable_source_data(monkeypatch: pytest.MonkeyPatch) -> None:
    session_date = date(2026, 7, 21)
    generation = datetime(2026, 7, 21, 9, tzinfo=timezone.utc)
    published = SimpleNamespace(
        trade_date=session_date,
        sync_id="G123",
        source_last_synced_at=generation,
    )
    universe_service = MagicMock()
    _setup_source(universe_service, published, [_universe_row() for _ in range(19)])
    snapshot_repository = MagicMock()
    snapshot_repository.persist_if_absent = AsyncMock()
    snapshot_repository.lock_publication = AsyncMock()
    snapshot_repository.list_for_sessions = AsyncMock(return_value=[])

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


@pytest.mark.asyncio
async def test_capture_retries_only_for_the_durable_current_winner(monkeypatch):
    service = MagicMock()
    generation = SimpleNamespace(trade_date=date(2026, 7, 21), sync_id="winner",
        source_last_synced_at=datetime(2026, 7, 21, 9, tzinfo=timezone.utc))
    _setup_source(service, generation, [])
    snapshot = service.get_canonical_universe.return_value
    repository = MagicMock(lock_publication=AsyncMock(), list_for_sessions=AsyncMock(return_value=[]), persist_if_absent=AsyncMock(return_value=True))
    redis = MagicMock(delete_by_pattern=AsyncMock(return_value=1))
    capture = MarketPulseSnapshotService(universe_service=service, snapshot_repository=repository, redis=redis)
    snapshot.updating = True
    assert (await capture.capture_finalized_session(exchange=ExchangeCode.DSE)).status == "not-finalized"
    snapshot.updating = False
    snapshot.withdrawn = True
    assert (await capture.capture_finalized_session(exchange=ExchangeCode.DSE)).status == "not-finalized"
    snapshot.withdrawn = False
    repository.list_for_sessions.return_value = [SimpleNamespace(universe_payload_revision="b" * 64, eligible_candidate_count=20)]
    assert (await capture.capture_finalized_session(exchange=ExchangeCode.DSE)).status == "duplicate"
    snapshot.payload.payload_revision = "c" * 64
    assert (await capture.capture_finalized_session(exchange=ExchangeCode.DSE)).status == "corrected"
    assert repository.persist_if_absent.await_args.kwargs["replace_revision"] == "b" * 64
    assert repository.persist_if_absent.await_args.args[0].eligible_candidate_count == 0
