"""Exact public projection and controlled read-time QA adapter regressions."""
import json
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models import Stock
from app.modules.market_universe.market_universe_compute import canonical_analysis_to_read
from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead, ScoredUniverseRow
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.stock_details.decision.summary import build_trader_decision_summary
from app.modules.stock_details.stock_details_schemas import TraderDecisionRead, TraderDecisionSummaryRead
from app.modules.stock_details.stock_details_decision_service import StockDetailsDecisionService
from app.modules.trading_intelligence.input_capture import restore_strategy_input
from app.modules.trading_intelligence.practicality_audit import build_workspace_fixture
from app.tests.test_canonical_generation_architecture import _canonical_fixture


@pytest.mark.asyncio
@pytest.mark.parametrize("version,category", [("trading-intelligence-v3","A"),("trading-intelligence-v4","A"),("trading-intelligence-v4","Z")])
async def test_actual_production_and_audit_details_project_every_delivered_summary_field(version,category):
    captured=json.loads((Path(__file__).parent/"fixtures/practicality_bsr_capture.json").read_text())
    value=replace(restore_strategy_input(captured["input"]),strategy_version=version,category=category)
    bundle=compute_trader_decision(value)
    row=ScoredUniverseRow.model_validate(captured["row"])
    row.decision=build_trader_decision_summary(bundle)
    row.analysis=canonical_analysis_to_read(bundle)
    # Captured publication rows predate read-time quote overlays. Supply the
    # actual dated recorded value without adding close/source authentication.
    row.display_quote=DisplayQuoteRead(current_price=bundle.snapshot.latest_price,as_of_trade_date=value.as_of_date.isoformat(),observation_status="UNAVAILABLE")
    row.eligibility=row.eligibility.model_copy(update={"status":bundle.eligibility.status,"reason_codes":list(bundle.eligibility.reason_codes)})
    stock=Stock(**row.stock.model_dump())
    _,_,_,base=_canonical_fixture()
    generation=replace(base.generation,trade_date=value.as_of_date,sync_id="CONTROLLED_PROJECTION")
    snapshot=replace(base,generation=generation,payload=base.payload.model_copy(update={"rows":[row]}),entries_projected=True)
    repository=SimpleNamespace(get_stock_by_exchange_symbol=AsyncMock(return_value=stock),
        list_daily_prices_window=AsyncMock(return_value=list(value.prices)),list_dividend_events=AsyncMock(return_value=[]),
        list_corporate_actions=AsyncMock(return_value=[]),get_latest_shareholding_snapshot=AsyncMock(return_value=None),
        get_latest_valuation_snapshot=AsyncMock(return_value=None),list_market_events=AsyncMock(return_value=[]))
    service=StockDetailsDecisionService(repository,SimpleNamespace(get_decision_event_observations=AsyncMock(return_value=[])))
    production=await service._build_decision_support(exchange=value.exchange,symbol=value.symbol,canonical_snapshot=snapshot)
    audit=build_workspace_fixture(row,bundle,value,generation.sync_id)["decision_support"]
    shared=set(TraderDecisionRead.model_fields)&set(TraderDecisionSummaryRead.model_fields)
    expected=row.decision.model_dump(mode="json",include=shared)
    assert production.decision.model_dump(mode="json",include=shared) == expected
    assert {key:audit["decision"][key] for key in expected} == expected
    assert production.decision.reasoning == audit["decision"]["reasoning"] == [row.decision.reason]
    assert production.decision.evidence_status == row.decision.canonical.evidence_status
    if version.endswith("v4"):
        assert production.decision.eligibility_reason_codes == list(bundle.eligibility.reason_codes)
    else:
        assert "eligibility_reason_codes" not in production.decision.model_dump()
    if category == "Z":
        assert "category_z_review" in production.decision.eligibility_reason_codes


def test_details_projection_does_not_rewrite_frozen_legacy_wire_or_absent_optional_facts():
    from app.modules.market_universe.market_universe_schemas import ScoredUniverseCacheRead
    from app.modules.stock_details.stock_details_schemas import trader_decision_from_summary
    raw=json.loads((Path(__file__).parent/"fixtures/pr31_legacy_universe.json").read_text())
    typed=ScoredUniverseCacheRead.model_validate(raw)
    detail=trader_decision_from_summary(typed.rows[0].decision)
    assert detail.evidence_status == typed.rows[0].decision.evidence_status
    assert "eligibility_reason_codes" not in detail.model_dump()
    assert typed.model_dump(mode="json") == raw


def test_controlled_request_time_reassesses_frozen_facts_and_withholds_at_next_open():
    from datetime import datetime,timedelta
    from app.core.enums import MarketRegimePhase
    from app.modules.market_universe.market_universe_schemas import UniverseRowsRead,UniverseRowsMetaRead
    from app.modules.stock_details.decision.market_regime import MarketRegimeResult
    from app.modules.trading_intelligence.practicality_transitions import controlled_entry_transitions,controlled_fixture_payloads,reassess_controlled_entry
    captured=json.loads((Path(__file__).parent/"fixtures/practicality_bsr_capture.json").read_text())
    value=replace(restore_strategy_input(captured["input"]),strategy_version="trading-intelligence-v4-shadow-market",
        market_regime=MarketRegimeResult(50,"NEUTRAL",MarketRegimePhase.HEALTHY,0,"CONTROLLED market input","CAUTION"))
    bundle=compute_trader_decision(value)
    row=ScoredUniverseRow.model_validate(captured["row"])
    row.decision=build_trader_decision_summary(bundle);row.analysis=canonical_analysis_to_read(bundle)
    row.display_quote=DisplayQuoteRead(current_price=97.7,as_of_trade_date="2026-11-12",observation_status="UNAVAILABLE")
    universe=UniverseRowsRead(meta=UniverseRowsMetaRead(exchange="DSE",listed_stock_count=1,session_trade_date=value.as_of_date,
        source_last_synced_at=value.calculated_at,market_sync_id="CONTROLLED_TEST",decision_generation_id="CONTROLLED_TEST"),rows=[row])
    now=datetime.fromisoformat("2026-11-14T06:00:00+00:00")
    result={"universe":universe.model_dump(mode="json"),"details":{"BSRMSTEEL":build_workspace_fixture(row,bundle,value,"CONTROLLED_TEST")},
        "manifest":{"derived_generation":"CONTROLLED_TEST","source_generation":captured["generation_id"]}}
    cases=controlled_fixture_payloads(result,controlled_entry_transitions(universe,simulation_now=now))
    payload=cases["15min-authenticated_last_close"]
    source=UniverseRowsRead.model_validate(payload["universe"])
    frozen=json.dumps(payload,sort_keys=True)
    _,first=reassess_controlled_entry(source,payload["manifest"],now=now+timedelta(minutes=1))
    _,resumed=reassess_controlled_entry(source,payload["manifest"],now=now+timedelta(hours=2))
    assert first.status == resumed.status == "APPLICABLE" and first.price_basis == resumed.price_basis == "LAST_CLOSE"
    assert first.assessed_at < resumed.assessed_at
    assert first.source_observed_at == resumed.source_observed_at == datetime.fromisoformat("2026-11-12T09:00:00+00:00")
    _,opened=reassess_controlled_entry(source,payload["manifest"],now=datetime.fromisoformat("2026-11-15T04:00:00+00:00"))
    assert opened.status == "UNVERIFIED" and opened.reason_code == "QUOTE_UNUSABLE"
    assert json.dumps(payload,sort_keys=True) == frozen
    with pytest.raises(ValueError,match="bound controlled"):
        reassess_controlled_entry(source,{**payload["manifest"],"evidence_class":"COUNTERFACTUAL"},now=now)
    changed=source.model_copy(deep=True)
    changed.rows[0].display_quote.source_observed_at=now
    with pytest.raises(ValueError,match="source quote"):
        reassess_controlled_entry(changed,payload["manifest"],now=now)
