"""Actual overlay scoping: non-candidates never materialize other stocks' lows."""
from dataclasses import replace
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.core_config import Settings
from app.core.enums import ExchangeCode, MarketDataState
from app.jobs.market_session_schedule import DHAKA_TZ
from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead
from app.modules.market_universe.market_universe_service import MarketUniverseService
from app.tests.test_canonical_generation_architecture import _canonical_fixture
from app.tests.test_entry_applicability import terms


class ObservedMembers(tuple):
    """Count actual member materialization, without relying on wall-clock timing."""
    yielded = 0

    def __iter__(self):
        for member in super().__iter__():
            self.yielded += 1
            yield member


async def project(monkeypatch, *, action="WAIT", single=False, candidates=False, withdrawn=False):
    _, _, original, snapshot = _canonical_fixture()
    now = datetime(2026, 11, 12, 11, tzinfo=DHAKA_TZ)
    reference = now.date()-timedelta(days=1)
    published = now-timedelta(days=1)
    generation = replace(snapshot.generation, trade_date=reference, published_at=published, source_last_synced_at=published)
    ids = [uuid4() for _ in range(426)]
    rows = []
    for index, stock_id in enumerate(ids):
        selected_action = "POTENTIAL_BUY" if candidates and index < 2 else action if index == 1 else "WAIT"
        rows.append(original.model_copy(update={
            "stock": original.stock.model_copy(update={"id": stock_id, "symbol": f"SCOPE{index:03}"}),
            "decision": None if selected_action is None else original.decision.model_copy(update={"display_action": selected_action}),
            "eligibility": original.eligibility.model_copy(update={"status": "ELIGIBLE"}),
            "analysis": original.analysis.model_copy(update={"trade_plan": original.analysis.trade_plan.model_copy(update=vars(terms()))}),
        }))
    snapshot = replace(snapshot, generation=generation, payload=snapshot.payload.model_copy(update={"rows": rows, "session_trade_date": reference}))
    members = ObservedMembers({"id": str(uuid4()), "stock_id": str(stock_id), "trade_date": now.date().isoformat(),
        "open_price": 100, "high_price": 102, "low_price": 95 if index == 0 else 99, "close_price": 100,
        "volume": 1000, "data_quality_flag": "OK", "updated_at": now.replace(hour=10).isoformat()}
        for index, stock_id in enumerate(ids))
    publication = SimpleNamespace(trade_date=now.date(), sync_id="price-proof", published_at=now.replace(hour=10, minute=1),
        source_last_synced_at=now.replace(hour=10), evidence_observed_at=now.replace(hour=10, minute=1), price_versions=members)
    raw = [SimpleNamespace(**{**member, "stock_id": ids[index], "trade_date": now.date(), "low_price": 99,
        "updated_at": now-timedelta(minutes=5), "source_observed_at": now-timedelta(minutes=5)})
        for index, member in enumerate(tuple.__iter__(members)) if index < 2] if candidates else []
    market = SimpleNamespace(
        list_recent_exchange_session_dates=AsyncMock(return_value=[reference, now.date()]),
        list_finalized_price_publications=AsyncMock(return_value=[publication]),
        list_authenticated_exchange_session_dates=AsyncMock(return_value=[now.date()]),
        list_entry_path_observations=AsyncMock(return_value=(raw, [], published-timedelta(days=1))),
        list_entry_basis_events=AsyncMock(return_value={}),
    )
    decision_publication = SimpleNamespace(generation_id=generation.sync_id, observed_at=published,
        session_date=reference, invalidated_at=published if withdrawn else None)
    async def latest(*, before_date=None, **kwargs): return None if before_date else decision_publication
    durable = SimpleNamespace(latest_publication=AsyncMock(side_effect=latest), publication_coverage=AsyncMock(return_value={
        "universe_membership": [str(value) for value in ids], "input_keys": [str(value) for value in ids], "excluded_members": [],
        "membership_provenance": {"status": "OBSERVED_INDEPENDENT_LISTED_SET", "observed_at": published.isoformat(),
            "listed_count": len(ids), "market_coverage_verified": True}}))
    service = MarketUniverseService(market, object(), object(), Settings(), durable)
    quote_context = replace(generation, trade_date=now.date(), sync_id="live-quote", data_state=MarketDataState.LIVE)
    service.resolve_generation_context = AsyncMock(return_value=generation)
    service.resolve_quote_context = AsyncMock(return_value=quote_context)
    quote = DisplayQuoteRead(current_price=100, as_of_trade_date=now.date().isoformat(), observation_session_date=now.date().isoformat(),
        observation_status="PROVISIONAL", source_observed_at=now-timedelta(minutes=5), volume=1000, data_quality="OK")
    service.get_display_quotes = AsyncMock(return_value={stock_id: quote for stock_id in ids})
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None): return now.astimezone(tz) if tz else now.replace(tzinfo=None)
    monkeypatch.setattr("app.modules.market_universe.market_universe_service.datetime", Clock)
    from app.modules.stock_details.decision import entry_applicability, entry_path_evidence
    evaluated, built_for = [], []
    real_evaluate = entry_applicability.evaluate_entry_applicability
    real_evidence = entry_path_evidence.build_entry_price_evidence
    def observe_evaluation(**kwargs):
        evaluated.append(kwargs["path"])
        return real_evaluate(**kwargs)
    def observe_evidence(**kwargs):
        built_for.append(kwargs.get("stock_id"))
        return real_evidence(**kwargs)
    monkeypatch.setattr(entry_applicability, "evaluate_entry_applicability", observe_evaluation)
    monkeypatch.setattr(entry_path_evidence, "build_entry_price_evidence", observe_evidence)
    selected = {ids[1]} if single else None
    result = await service.project_current_entries(snapshot, exchange=ExchangeCode.DSE, stock_ids=selected, price_basis_v2=True)
    selected_rows = [row for row in result.rows if selected is None or row.stock.id in selected]
    return ids, selected_rows, evaluated, built_for, members, market


@pytest.mark.parametrize("action", ["WAIT", "HOLD", "SELL", None])
@pytest.mark.parametrize("single", [False, True])
async def test_non_candidates_never_build_foreign_paths_from_426_published_members(monkeypatch, action, single):
    _, rows, paths, built_for, members, market = await project(monkeypatch, action=action, single=single)
    assert len(rows) == len(paths) == (1 if single else 426)
    assert all(row.entry_applicability.reason_code == "ACTION_NOT_PERMITTED" for row in rows)
    assert all(row.entry_applicability.status == "NOT_APPLICABLE" for row in rows)
    assert all(not path.reliable_lows and not path.sessions for path in paths)
    assert not built_for and members.yielded == 0
    market.list_entry_path_observations.assert_not_awaited()
    market.list_entry_basis_events.assert_not_awaited()


async def test_real_candidates_keep_own_breach_and_admission_among_426_members(monkeypatch):
    ids, rows, paths, built_for, members, _ = await project(monkeypatch, candidates=True)
    assert built_for and set(built_for) == {ids[0], ids[1]} and len(built_for) == 2
    assert rows[0].entry_applicability.reason_code == "STOP_BREACHED"
    assert rows[1].entry_applicability.reason_code == "ENTRY_TERMS_MET"
    assert (paths[0].sessions[0], 95.0) in paths[0].reliable_lows
    assert all(low == 99.0 for _, low in paths[1].reliable_lows)
    assert all(not path.reliable_lows for path in paths[2:])
    assert all(row.entry_applicability.reason_code == "ACTION_NOT_PERMITTED" for row in rows[2:])
    assert members.yielded == 2*426


async def test_non_candidate_withdrawal_precedence_is_preserved_without_path_work(monkeypatch):
    _, rows, paths, built_for, members, _ = await project(monkeypatch, single=True, withdrawn=True)
    assert rows[0].entry_applicability.reason_code == "PUBLICATION_INVALIDATED"
    assert rows[0].entry_applicability.status == "INVALIDATED"
    assert not paths[0].reliable_lows and not built_for and members.yielded == 0
