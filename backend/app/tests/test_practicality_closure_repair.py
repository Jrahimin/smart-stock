"""Six closure findings: real central projections with explicit controlled facts."""
import copy
import json
from dataclasses import replace
from datetime import UTC,date,datetime,timedelta
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace as NS

import pytest

from app.core.audit_hashing import stable_audit_hash
from app.core.enums import MarketDataState,MarketRegimePhase
from app.modules.market_universe.market_universe_compute import canonical_analysis_to_read,technical_snapshot_to_read
from app.modules.market_universe.market_universe_lineage import compute_universe_payload_revision
from app.modules.market_universe.market_universe_schemas import ScoredUniverseRow,DisplayQuoteRead
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.stock_details.decision.market_regime import capture_market_context,resolve_regime_result_from_summaries,MarketRegimeResult
from app.modules.stock_details.decision.summary import build_trader_decision_summary
from app.modules.trading_intelligence.input_capture import capture_strategy_input,restore_strategy_input
from app.modules.trading_intelligence.practicality_audit import audit_capture


def source_input():
    fixture=json.loads((Path(__file__).parent/"fixtures/practicality_bsr_capture.json").read_text())
    return fixture,restore_strategy_input(fixture["input"])


def capture(value,*,context=None,generation="CONTROLLED_CAPTURE",observed=None):
    fixture,_=source_input();bundle=compute_trader_decision(value)
    row=ScoredUniverseRow.model_validate(fixture["row"])
    row.decision=build_trader_decision_summary(bundle);row.analysis=canonical_analysis_to_read(bundle)
    row.technical_snapshot=technical_snapshot_to_read(bundle.snapshot)
    observed=observed or value.calculated_at
    ids=[str(value.stock_id)]
    inputs={"inputs":{ids[0]:capture_strategy_input(value)},"universe_membership":ids,"excluded_members":[],
        "membership_provenance":{"status":"OBSERVED_INDEPENDENT_LISTED_SET","observed_at":observed.isoformat(),"listed_count":1,"market_coverage_verified":True}}
    if context is not None:inputs["market_context"]=context
    return {"generation_id":generation,"exchange":"DSE","session_date":value.as_of_date.isoformat(),"observed_at":observed.isoformat(),
        "input_payload":inputs,"result_payload":{"strategy_version":value.strategy_version,"rows":[row.model_dump(mode="json")],"payload_revision":compute_universe_payload_revision([row])}}


@pytest.mark.parametrize("unfinal",[None,-1,-10,"missing"])
def test_c1_finality_production_capture_restore_audit_and_legacy(unfinal):
    _,original=source_input();now=datetime(2026,11,13,12,tzinfo=UTC)
    days=[row.trade_date for row in original.prices[-51:]]
    rows=[NS(trade_date=day,index_name="DSEX",index_close=100.+index,advancing_issues=70,declining_issues=30,
        unchanged_issues=0,is_finalized=True,source="CONTROLLED",updated_at=now-timedelta(hours=1)) for index,day in enumerate(days)]
    complete=resolve_regime_result_from_summaries(rows,decision_session_date=original.as_of_date)
    if unfinal=="missing":del rows[-1].is_finalized
    elif unfinal is not None:rows[unfinal].is_finalized=False
    regime=resolve_regime_result_from_summaries(rows,decision_session_date=original.as_of_date)
    value=replace(original,strategy_version="trading-intelligence-v4",market_regime=regime,calculated_at=now)
    context=capture_market_context(rows,session_date=value.as_of_date,captured_at=now,generation_id="CONTROLLED_CAPTURE",session_dates=set(days))
    envelope=capture(value,context=context,observed=now)
    restored=restore_strategy_input(envelope["input_payload"]["inputs"][str(value.stock_id)] )
    result=audit_capture(envelope,{"captures":[envelope]},"c1")
    output=result["diagnostics"][str(value.stock_id)]
    assert restored.market_regime.required_inputs_complete is (unfinal is None)
    assert output["canonical"]["display_action"] == ("POTENTIAL_BUY" if unfinal is None else "WAIT")
    assert output["canonical"]["non_holder_action"] == ("BUY" if unfinal is None else "AVOID")
    if unfinal is not None:
        assert output["canonical"]["primary_reason_code"]=="market_evidence_unknown"
        index=-1 if unfinal=="missing" else unfinal
        assert context[index]["is_finalized"] is (None if unfinal=="missing" else False) and context[index]["authenticated"] is False
        reconstructed=audit_capture(envelope,{"captures":[envelope]},"c1",reconstructed_market=True)
        assert reconstructed["manifest"]["evidence_class"]=="RECONSTRUCTED_COUNTERFACTUAL"
        assert reconstructed["diagnostics"][str(value.stock_id)]["regime"]==output["regime"]
        assert reconstructed["diagnostics"][str(value.stock_id)]["canonical"]==output["canonical"]
        legacy=compute_trader_decision(replace(value,strategy_version="trading-intelligence-v3"))
        old=compute_trader_decision(replace(value,strategy_version="trading-intelligence-v3",market_regime=complete))
        assert legacy.canonical_result==old.canonical_result


def test_selected_v1_comparator_owns_entry_risk_volume_ties_and_new_policy_independently():
    from app.modules.market_universe.shortlist import apply_shortlist_ranks
    fixture,_=source_input();first=ScoredUniverseRow.model_validate(fixture["row"]);second=first.model_copy(deep=True)
    from uuid import UUID
    first.stock.id=UUID(int=1);first.stock.symbol="A";second.stock.id=UUID(int=2);second.stock.symbol="Z"
    for row in (first,second):
        row.decision.canonical.eligibility_status="ELIGIBLE";row.decision.canonical.entry_readiness="CONDITIONAL"
        row.decision.canonical.opportunity_quality="STRONG";row.decision.canonical.trade_plan_status="VALID_ENTRY_PLAN"
    first.decision.canonical.non_holder_action="WAIT";second.decision.canonical.non_holder_action="BUY"
    legacy=apply_shortlist_ranks([second,first],version="entry-shortlist-v1")
    current=apply_shortlist_ranks([second,first],version="entry-shortlist-v2-permission")
    for key in ("entry_rank","risk_rank","volume_rank"):
        assert getattr(legacy[1].shortlist,key)==1 and getattr(legacy[0].shortlist,key)==2
        assert getattr(current[0].shortlist,key)==1 and getattr(current[1].shortlist,key)==2


def portfolio_quality_cases():
    from app.tests.test_portfolios import _item,_service
    from app.modules.portfolios.portfolios_repository import PortfolioEventRecord
    from uuid import UUID
    fixture,original=source_input()
    item=_item(quantity=Decimal("10"),buy_price=Decimal("90"),symbol=original.symbol)
    item.stock.id=original.stock_id;item.stock.name=fixture["row"]["stock"]["name"]
    item.entry.stock_id=original.stock_id;item.entry.id=UUID(int=2001)
    service,_,_=_service([item],{})
    outputs={}
    for state in ("absent","suspicious","suspended","stale","recorded","finalized"):
        row=ScoredUniverseRow.model_validate(fixture["row"])
        row.display_quote=DisplayQuoteRead(current_price=103.,previous_close=101.,price_change=2.,price_change_percent=2.,
            as_of_trade_date=original.as_of_date.isoformat(),observation_status="FINALIZED" if state=="finalized" else "UNAVAILABLE",
            data_quality="SUSPICIOUS" if state=="suspicious" else "OK")
        if state=="absent":row.display_quote=DisplayQuoteRead(current_price=None)
        event=PortfolioEventRecord(item.stock.id,"TRADING_STATUS:TRADING_SUSPENSION" if state=="suspended" else "CONTROLLED_QA_PRICE_REVIEW",
            original.as_of_date,"CONTROLLED price-quality scenario",None)
        position=service._build_position(item=item,universe_row=row,fallback_price=None,published_date=original.as_of_date,
            data_state=MarketDataState.STALE if state=="stale" else MarketDataState.FINALIZED,is_provisional=False,relevant_event=event)
        suggestions=service._build_watchlist_suggestions([(replace(item,entry=NS(**{**vars(item.entry),"is_holding":False})),position)])
        outputs[state]={"holding":position,"suggestion":suggestions[0] if suggestions else None}
    return outputs


def test_real_portfolio_mark_authority_requires_numeric_mark_and_preserves_quality_and_money():
    cases=portfolio_quality_cases()
    expected={"absent":"UNAVAILABLE","suspicious":"SUSPICIOUS","suspended":"SUSPENDED","stale":"STALE_LAST_KNOWN","recorded":"FINALIZED","finalized":"FINALIZED"}
    for name,item in cases.items():
        row=item["holding"]
        assert row.price_status==expected[name]
        if name=="absent":assert row.mark_authority is None and row.current_price is None
        else:assert row.current_value==Decimal("1030.00") and row.unrealized_gain_amount==Decimal("130.00")
    assert cases["recorded"]["holding"].mark_authority=="RECORDED"
    assert cases["finalized"]["holding"].mark_authority=="FINALIZED"
    assert all(item["suggestion"] is not None for item in cases.values())


def test_committed_frontend_quality_fixtures_equal_current_real_service_serialization():
    delivered=json.loads((Path(__file__).resolve().parents[3]/"frontend/test-fixtures/practicality-portfolio-quality.json").read_text(encoding="utf8"))
    actual={name:{key:value.model_dump(mode="json") if value is not None else None for key,value in items.items()} for name,items in portfolio_quality_cases().items()}
    assert delivered["cases"]==actual


def source_table_entry():
    fixture,original=source_input()
    value=replace(original,strategy_version="trading-intelligence-v4-shadow-market",market_regime=MarketRegimeResult(
        50,"NEUTRAL",MarketRegimePhase.HEALTHY,0,"CONTROLLED","CAUTION",original.as_of_date,True))
    bundle=compute_trader_decision(value)
    assert bundle.canonical_result.non_holder_action=="BUY"
    price=(bundle.trade_plan.entry_zone_low+bundle.trade_plan.entry_zone_high)/2
    stock=str(value.stock_id);now="2026-11-15T05:00:00+00:00"
    quote={"id":"controlled-price","stock_id":stock,"trade_date":"2026-11-15","open_price":price,"high_price":price+.1,"low_price":price-.1,
        "close_price":price,"volume":1000,"data_quality_flag":"OK","source":"CONTROLLED","updated_at":now,"source_observed_at":now,"batch_fetched_at":now}
    envelope=capture(original,generation=fixture["generation_id"],observed=datetime.fromisoformat(fixture["observed_at"]))
    export={"exported_at":now,"market_schedule":{"source_revision":"CONTROLLED","market_open_time":"10:00","market_close_time":"15:00","market_snapshot_interval_minutes":15},
        "quote_prices":[quote],"price_observations":[{"id":"controlled-write","operation":"INSERT","source_row_id":quote["id"],"session_date":quote["trade_date"],"observed_at":now,"payload":quote,"previous_payload":None}],
        "market_generations":[{"id":"controlled-manifest","exchange":"DSE","state":"LIVE","accepted_count":1,"trade_date":quote["trade_date"],"sync_id":"controlled-sync","published_at":now,"source_last_synced_at":now}],
        "source_coverage":{key:{"complete":True,"range_start":"2026-11-13T00:00:00+00:00"} for key in ("quote_prices","price_observations","market_generations","price_publication_observations")}}
    for table in ("corporate_actions","dividend_events"):
        export[table]=[]
        export["source_coverage"][table]={"complete":True,"source_revision":"CONTROLLED-empty-"+table,"stock_ids":[stock],"known_at":now,"range_start":"2026-11-12","range_end":"2026-11-15"}
    return value,bundle,envelope,export


@pytest.mark.parametrize("kind",["covered_empty","BONUS","SPLIT","EX_DIVIDEND","uncertain","future_revision","missing_coverage"])
def test_export_basis_event_parity_and_coverage(kind):
    from app.modules.stock_details.decision.entry_basis_events import project_entry_basis_events
    from app.modules.trading_intelligence.practicality_entry_evidence import assess_bound_entry,evidence_for
    value,bundle,envelope,export=source_table_entry()
    if kind not in {"covered_empty","missing_coverage"}:
        event={"stock_id":str(value.stock_id),"action_subtype":kind if kind in {"SPLIT","BONUS"} else "BONUS","effective_date":"2026-11-15",
            "known_at":"2026-11-15T04:30:00+00:00","verified":kind!="uncertain"}
        if kind=="future_revision":event["known_at"]="2026-11-15T06:00:00+00:00"
        if kind=="EX_DIVIDEND":
            export["dividend_events"]=[{"stock_id":str(value.stock_id),"ex_dividend_date":"2026-11-15","status":"APPROVED","cash_amount_per_share":1,"known_at":event["known_at"]}]
        else:export["corporate_actions"]=[event]
    if kind=="missing_coverage":export["source_coverage"].pop("corporate_actions")
    quote,result,_=assess_bound_entry(capture=envelope,export=export,value=value,bundle=bundle,fallback_quote=DisplayQuoteRead(current_price=97.7,observation_status="UNAVAILABLE"))
    if kind=="covered_empty":assert result.status=="APPLICABLE"
    elif kind in {"BONUS","SPLIT","EX_DIVIDEND"}:assert result.status=="INVALIDATED" and result.reason_code=="PRICE_BASIS_CHANGED"
    else:assert result.status=="UNVERIFIED"
    if kind in {"BONUS","SPLIT","EX_DIVIDEND"}:
        direct=project_entry_basis_events(export["corporate_actions"],export["dividend_events"],end_date=date(2026,11,15)).events
        serialized=evidence_for(envelope,export)["members"][str(value.stock_id)]["basis_evidence"]["events"]
        assert [(event.effective_date.isoformat(),event.kind,event.verified) for event in direct[str(value.stock_id)]]==[(str(event["effective_date"]),event["kind"],event["verified"]) for event in serialized]


def test_basis_input_change_changes_assessment_and_audit_identity_without_manual_cache_reset():
    from app.modules.trading_intelligence.practicality_entry_evidence import evidence_for
    value,bundle,envelope,export=source_table_entry()
    export["market_summaries"]=[]
    before=evidence_for(envelope,export)
    first=audit_capture(envelope,export,"market",reconstructed_market=True)
    export["corporate_actions"].append({"stock_id":str(value.stock_id),"action_subtype":"BONUS","effective_date":"2026-11-15","known_at":export["exported_at"]})
    after=evidence_for(envelope,export)
    second=audit_capture(envelope,export,"market",reconstructed_market=True)
    assert before!=after
    assert first["manifest"]["derived_generation"]!=second["manifest"]["derived_generation"]


@pytest.mark.asyncio
async def test_production_repository_and_offline_basis_projection_share_events_and_filters():
    from unittest.mock import AsyncMock
    from uuid import UUID
    from app.modules.market_data.market_data_repository import MarketDataRepository
    from app.modules.stock_details.decision.entry_basis_events import project_entry_basis_events
    stock_id=UUID(int=17)
    actions=[NS(stock_id=stock_id,action_subtype=kind,effective_date=date(2026,11,15)) for kind in ("BONUS","SPLIT","RIGHTS","MERGER","OTHER")]
    dividends=[NS(stock_id=stock_id,status=status,ex_dividend_date=date(2026,11,15),cash_amount_per_share=amount,stock_dividend_percent=None,cash_dividend_percent=None)
        for status,amount in (("APPROVED",1),("PAID",2),("PROPOSED",1),("APPROVED",0))]
    session=NS(scalars=AsyncMock(side_effect=[NS(all=lambda:actions),NS(all=lambda:dividends)]))
    actual=await MarketDataRepository(session).list_entry_basis_events(stock_ids=[stock_id],end_date=date(2026,11,16))
    offline=project_entry_basis_events([vars(row) for row in actions],[vars(row) for row in dividends],end_date=date(2026,11,16))
    assert actual==offline.events
    assert sorted(event.kind for event in actual[stock_id])==["BONUS","EX_DIVIDEND","EX_DIVIDEND","MERGER","RIGHTS","SPLIT"]


@pytest.mark.parametrize("holiday",[False,True])
def test_actual_strict_audit_context_vintage_is_permutation_invariant_and_correction_is_explicit(holiday):
    from itertools import permutations
    _,original=source_input()
    days=[price.trade_date for price in original.prices]
    if holiday:days.remove(days[-20]) # Explicit CONTROLLED closure in the supplied calendar.
    original=replace(original,exchange_session_dates=tuple(days))
    current_at=datetime(2026,11,12,13,tzinfo=UTC);prior=days[-2]
    def context(day,generation,weak,clock):
        summaries=[NS(trade_date=value,index_name="DSEX",index_close=90. if weak and value>=day else 100.,
            advancing_issues=30 if weak and value>=day else 70,declining_issues=70 if weak and value>=day else 30,
            unchanged_issues=0,is_finalized=True,source="CONTROLLED",updated_at=clock) for value in days if value<=day]
        return capture_market_context(summaries,session_date=day,captured_at=clock,generation_id=generation,session_dates=set(days))
    first_clock=datetime.combine(prior,datetime.min.time(),UTC)+timedelta(hours=10)
    revision_clock=first_clock+timedelta(hours=1)
    first={"generation_id":"prior-original","session_date":prior.isoformat(),"observed_at":first_clock.isoformat(),
        "input_payload":{"market_context":context(prior,"prior-original",False,first_clock)}}
    revised={"generation_id":"prior-correction","session_date":prior.isoformat(),"observed_at":revision_clock.isoformat(),
        "input_payload":{"market_context":context(prior,"prior-correction",True,revision_clock)}}
    own=capture(original,context=context(original.as_of_date,"CONTROLLED_CAPTURE",True,current_at),observed=current_at)
    own["input_payload"]["market_calendar"]={"status":"VERIFIED_EXCHANGE_SESSION_CALENDAR","complete":True,
        "source_revision":"CONTROLLED-calendar-with-declared-closure" if holiday else "CONTROLLED-calendar",
        "known_at":first_clock.isoformat(),"range_start":days[0].isoformat(),"range_end":days[-1].isoformat(),"sessions":[day.isoformat() for day in days]}
    observations=[]
    for order in permutations([first,revised,own]):
        result=audit_capture(own,{"captures":list(order)},"market")
        row=result["diagnostics"][str(original.stock_id)]
        observations.append((result["manifest"]["derived_generation"],row["market_permission"],row["canonical"]["non_holder_action"]))
    assert len(set(observations))==1 and observations[0][1:]==("CAUTION","BUY")
    corrected=audit_capture(own,{"captures":[revised,first,own]},"market",market_publication_ids=["prior-correction"])
    assert corrected["diagnostics"][str(original.stock_id)]["market_permission"]=="RESTRICTED"
    withdrawn={**revised,"invalidated_at":"2026-11-12T12:00:00+00:00"}
    default=audit_capture(own,{"captures":[withdrawn,own,first]},"market")
    assert default["diagnostics"][str(original.stock_id)]["market_permission"]=="CAUTION"
    requested=audit_capture(own,{"captures":[withdrawn,own,first]},"market",market_publication_ids=["prior-correction"])
    assert requested["diagnostics"][str(original.stock_id)]["market_permission"]=="UNKNOWN"


def exception_control(arm,*,basis="CURRENT",fault=None):
    """CONTROLLED feature/path probe, evaluated by the real engine and assessor."""
    from dataclasses import asdict
    from app.core.audit_hashing import canonicalize_audit_value
    from app.tests.test_decision_model_coherence import _bullish_snapshot
    from app.modules.stock_details.decision.policy import decision_policy
    from app.modules.trading_intelligence.practicality_audit import plan_diagnostics
    from app.modules.trading_intelligence.practicality_entry_evidence import assess_bound_entry
    from app.modules.trading_intelligence.practicality_operational import run_guardrails
    value,_,_,export=source_table_entry()
    source=replace(value,strategy_version="trading-intelligence-v4",calculated_at=datetime(2026,11,12,10,tzinfo=UTC),market_regime=MarketRegimeResult(65,"BULLISH",MarketRegimePhase.HEALTHY,100,"CONTROLLED","ORDINARY",value.as_of_date,True))
    envelope=capture(source,observed=datetime(2026,11,12,10,tzinfo=UTC))
    value=replace(source,strategy_version="trading-intelligence-v4-shadow-"+arm)
    snapshot=_bullish_snapshot()
    snapshot=replace(snapshot,latest_trade_date=value.as_of_date.isoformat(),volatility=3. if arm in {"risk","combined"} else 1.,gap_frequency_percent=0.,sma20=snapshot.latest_price/1.03)
    bundle=compute_trader_decision(value,snapshot=snapshot)
    assert bundle.canonical_result.non_holder_action=="BUY"
    price=(bundle.trade_plan.entry_zone_low+bundle.trade_plan.entry_zone_high)/2
    current={**export["quote_prices"][0],"trade_date":"2026-11-16","open_price":price,"close_price":price,"low_price":price-.01,"high_price":price+.01,
        "updated_at":"2026-11-16T05:00:00+00:00","source_observed_at":"2026-11-16T05:00:00+00:00","batch_fetched_at":"2026-11-16T05:00:00+00:00"}
    prior={**current,"id":"controlled-confirmed","trade_date":"2026-11-15","updated_at":"2026-11-15T09:00:00+00:00","source_observed_at":"2026-11-15T09:00:00+00:00","batch_fetched_at":"2026-11-15T09:00:00+00:00"}
    if basis in {"LAST_CLOSE","SNAPSHOT"}:
        # Explicit CONTROLLED exchange-session proof, never inferred from a receipt.
        current.update(source_observed_at=None,session_date_verified=True)
    if basis=="LAST_CLOSE":
        current.update(updated_at="2026-11-16T09:00:00+00:00",batch_fetched_at="2026-11-16T09:00:00+00:00")
    export["exported_at"]=current["updated_at"];export["quote_prices"]=[prior,current]
    export["market_generations"][0].update(trade_date=current["trade_date"],published_at=current["updated_at"],source_last_synced_at=current["updated_at"])
    export["market_generations"].append({"id":"confirmed-manifest","exchange":"DSE","state":"FINALIZED","accepted_count":1,"trade_date":prior["trade_date"],"sync_id":"confirmed-sync","published_at":prior["updated_at"],"source_last_synced_at":prior["updated_at"]})
    export["price_publication_observations"]=[{"id":"confirmation-publication","source_row_id":"confirmed-manifest","operation":"PUBLISH","finality":"FINALIZED","observed_at":prior["updated_at"],
        "payload":{"contract":"PRICE_VERSION_MEMBERSHIP_V1","manifest_id":"confirmed-manifest","exchange":"DSE","sync_id":"confirmed-sync","trade_date":prior["trade_date"],"source_last_synced_at":prior["updated_at"],"price_versions":[prior]}}]
    if basis=="LAST_CLOSE":
        manifest=export["market_generations"][0];manifest["state"]="FINALIZED"
        export["price_publication_observations"].append({"id":"current-close-publication","source_row_id":manifest["id"],"operation":"PUBLISH","finality":"FINALIZED","observed_at":current["updated_at"],
            "payload":{"contract":"PRICE_VERSION_MEMBERSHIP_V1","manifest_id":manifest["id"],"exchange":"DSE","sync_id":manifest["sync_id"],"trade_date":current["trade_date"],"source_last_synced_at":current["updated_at"],"price_versions":[current]}})
        export["exported_at"]="2026-11-17T00:00:00+00:00"
    if fault=="stale_snapshot":export["exported_at"]="2026-11-16T05:31:00+00:00"
    if fault=="next_open":export["exported_at"]="2026-11-17T05:00:00+00:00"
    export["price_observations"]=[{"id":"write-"+row["id"],"operation":"INSERT","source_row_id":row["id"],"session_date":row["trade_date"],"observed_at":row["updated_at"],"payload":row,"previous_payload":None} for row in (prior,current)]
    export["source_coverage"]["price_observations"]["range_start"]="2026-11-11T00:00:00+00:00"
    for table in ("corporate_actions","dividend_events"):
        export["source_coverage"][table].update(range_end="2026-11-17" if basis=="LAST_CLOSE" else "2026-11-16",known_at=current["updated_at"])
    if fault=="unknown":export["source_coverage"].pop("corporate_actions")
    facts={}
    _,assessment,_=assess_bound_entry(capture=envelope,export=export,value=value,bundle=bundle,fallback_quote=DisplayQuoteRead(current_price=price,observation_status="UNAVAILABLE"),assessment_diagnostics=facts)
    if fault in {"expired","invalidated","unconfirmed"}:
        from app.modules.stock_details.decision.entry_applicability import EntryPathFacts,evaluate_entry_applicability
        path=EntryPathFacts(sessions=tuple(date.fromisoformat(day) for day in facts["path"]["sessions"]),
            completed_sessions=frozenset(date.fromisoformat(day) for day in facts["path"]["completed_sessions"]),
            reliable_lows=tuple((date.fromisoformat(day),low) for day,low in facts["path"]["reliable_lows"]),
            complete=True,confirmed_on=date.fromisoformat(facts["path"]["confirmed_on"]) if facts["path"].get("confirmed_on") else None)
        if fault=="expired":path=replace(path,sessions=tuple(value.as_of_date+timedelta(days=index+1) for index in range(bundle.trade_plan.expiry_sessions+1)))
        if fault=="invalidated":path=replace(path,reliable_lows=((date(2026,11,15),bundle.trade_plan.stop_loss-.01),))
        if fault=="unconfirmed":path=replace(path,confirmed_on=None)
        quote=DisplayQuoteRead(current_price=price,as_of_trade_date="2026-11-16",observation_session_date="2026-11-16",observation_status="PROVISIONAL",
            volume=1000,data_quality="OK",source_observed_at=datetime.fromisoformat(current["updated_at"]),batch_fetched_at=datetime.fromisoformat(current["updated_at"]))
        assessment=evaluate_entry_applicability(decision=bundle.canonical_result,plan=bundle.trade_plan,eligibility=bundle.eligibility,quote=quote,
            reference_date=value.as_of_date,now=datetime.fromisoformat(current["updated_at"]),market_open=True,coverage_verified=True,path=path,price_basis_v2=True,
            session_open_at=datetime(2026,11,16,4,tzinfo=UTC),session_close_at=datetime(2026,11,16,9,tzinfo=UTC))
        facts["path"]=canonicalize_audit_value(asdict(path))
    if fault is None:assert assessment.status=="APPLICABLE" and assessment.price_basis==basis
    stock=str(value.stock_id)
    diagnostic={"symbol":value.symbol,"canonical":canonicalize_audit_value(asdict(bundle.canonical_result)),"plan":plan_diagnostics(bundle,value),
        "assessment":assessment.model_dump(mode="json"),"market_permission":"ORDINARY","entry_evidence":facts,
        "policy_facts":{"strategy_version":value.strategy_version,"enabled":asdict(decision_policy(value.strategy_version)),"risk_exception_applied":bundle.risk_exception_applied},
        "source_input_hash":envelope["result_payload"]["rows"][0]["decision"]["canonical"]["input_hash"]}
    result={"manifest":{"arm":arm,"source_generation":envelope["generation_id"],"source_observed_at":envelope["observed_at"]},"diagnostics":{stock:diagnostic}}
    return run_guardrails(result),envelope,result


def test_exception_credit_is_actual_candidate_specific_rule_and_confirmed_path():
    from app.modules.trading_intelligence.practicality_operational import _valid_exception_record
    market,_,_=exception_control("market")
    assert market["exercised_exceptions"]==[] and market["exception_evidence"]==[]
    for arm,expected in (("risk",{"high_risk_exception"}),("pullback",{"pullback_hold"}),("combined",{"high_risk_exception","pullback_hold"})):
        guard,envelope,result=exception_control(arm)
        assert set(guard["exercised_exceptions"])==expected
        for record in guard["exception_evidence"]:
            assert _valid_exception_record(record,{"arm":arm,"guardrails":guard},envelope)
            assert not _valid_exception_record(record,{"arm":"c1"},envelope)
        if arm=="pullback":
            result["diagnostics"][next(iter(result["diagnostics"]))]["entry_evidence"]["path"]["confirmed_on"]=None
            from app.modules.trading_intelligence.practicality_operational import run_guardrails
            assert run_guardrails(result)["exception_evidence"]==[]


@pytest.mark.parametrize("basis",["CURRENT","LAST_CLOSE","SNAPSHOT"])
@pytest.mark.parametrize("arm",["risk","pullback","combined"])
def test_conditional_exception_credit_uses_actual_assessor_basis_and_separates_current_trigger(arm,basis):
    from app.modules.trading_intelligence.practicality_operational import _valid_exception_record
    guard,envelope,result=exception_control(arm,basis=basis)
    expected={"high_risk_exception","pullback_hold"} if arm=="combined" else {"high_risk_exception" if arm=="risk" else "pullback_hold"}
    assert set(guard["exercised_exceptions"])==expected
    assert set(guard["current_trigger_exceptions"])==(expected if basis=="CURRENT" else set())
    for record in guard["exception_evidence"]:
        assert _valid_exception_record(record,{"arm":arm,"guardrails":guard},envelope)
        assert record["current_trigger"] is (basis=="CURRENT")
        if basis!="CURRENT":assert record["assessment"]["source_observed_at"] is None
        if basis=="LAST_CLOSE":assert record["assessment"]["quote_session_date"]!=record["assessment"]["assessed_at"][:10]
        assert not _valid_exception_record(record,{"arm":"market","guardrails":guard},envelope)


@pytest.mark.parametrize("fault,status,basis",[("unknown","UNVERIFIED","CURRENT"),("expired","EXPIRED","CURRENT"),("invalidated","INVALIDATED","CURRENT"),
    ("unconfirmed","AWAITING_CONFIRMATION","CURRENT"),("stale_snapshot","UNVERIFIED","SNAPSHOT"),("next_open","UNVERIFIED","LAST_CLOSE")])
def test_conditional_exception_negative_central_assessments_never_receive_exercise_credit(fault,status,basis):
    from app.modules.trading_intelligence.practicality_operational import _valid_exception_record
    guard,_,result=exception_control("pullback",fault=fault,basis=basis)
    diagnostic=next(iter(result["diagnostics"].values()))
    assert diagnostic["assessment"]["status"]==status
    assert guard["exception_evidence"]==[] and guard["exercised_exceptions"]==[] and guard["current_trigger_exceptions"]==[]
    positive,envelope,_=exception_control("pullback")
    record=copy.deepcopy(positive["exception_evidence"][0])
    record.update(assessment=diagnostic["assessment"],path=diagnostic["entry_evidence"]["path"],entry_binding=diagnostic["entry_evidence"])
    record["proof_hash"]=stable_audit_hash({key:value for key,value in record.items() if key!="proof_hash"})
    assert not _valid_exception_record(record,{"arm":"pullback","guardrails":positive},envelope)


def review_receipts(runs,days):
    from app.modules.trading_intelligence.practicality_operational import CHART_STRATA,_distinct_chart_cases
    def week(day):
        parsed=date.fromisoformat(day)
        return (parsed-timedelta(days=(parsed.weekday()+1)%7)).isoformat()
    receipts=[]
    for current_week in sorted({week(day) for day in days}):
        available=list(_distinct_chart_cases(case for run in runs for case in run["guardrails"].get("chart_cases",[]) if week(case["session_date"])==current_week).values())
        last=max(day for day in days if week(day)==current_week)
        receipts.append({"review_id":"CONTROLLED-"+current_week,"week_start":current_week,"reviewed_at":last+"T12:00:00+00:00",
            "reviewer":"CONTROLLED reviewer","signed_by":"CONTROLLED reviewer","decision":"SIGNED_ACCEPT",
            "cases":[{key:case[key] for key in ("case_hash","session_date","arm","stock_id")} for case in available],
            "case_count":len(available),"permitted_count":sum(case["permitted"] for case in available),"rejected_count":sum(not case["permitted"] for case in available),
            "coverage":{stratum:{"available_count":sum(stratum in case["strata"] for case in available),"reviewed_count":sum(stratum in case["strata"] for case in available)} for stratum in CHART_STRATA},
            "shortfalls":[{"stratum":stratum,"reason":"CONTROLLED no available cases in this frozen week"} for stratum in CHART_STRATA if not any(stratum in case["strata"] for case in available)]
                +[{"population":population,"available_count":sum(case["permitted"] is permitted for case in available),"reviewed_count":sum(case["permitted"] is permitted for case in available),
                    "target_count":10,"reason":"CONTROLLED genuine weekly inventory shortage; all available reviewed"} for population,permitted in (("PERMITTED",True),("REJECTED",False)) if sum(case["permitted"] is permitted for case in available)<10]})
    return {"operational_owner":"CONTROLLED structural test-role receipt","weekly_reviews":receipts}


def operational_window():
    """Synthetic structural gate fixture; never a real forward campaign claim."""
    from app.modules.trading_intelligence.practicality_operational import REQUIRED_ARMS
    days="2026-11-12 2026-11-15 2026-11-16 2026-11-17 2026-11-18 2026-11-19 2026-11-22 2026-11-23 2026-11-24 2026-11-25 2026-11-26 2026-11-29 2026-11-30 2026-12-01 2026-12-02 2026-12-03 2026-12-06 2026-12-07 2026-12-08 2026-12-09".split()
    calendar={"source_revision":"CONTROLLED authenticated-calendar receipt","complete":True,"range_start":"2026-11-11","range_end":"2026-12-10","known_at":"2026-11-11T00:00:00+00:00",
        "sessions":[{"session_date":day,"authenticated":True,"next_open_at":(days[index+1] if index+1<len(days) else "2026-12-10")+"T04:00:00+00:00"} for index,day in enumerate(days)]}
    captures=[];runs=[]
    for day in days:
        inputs={"s":{"fixture":"CONTROLLED structural zero-buy input"}}
        captures.append({"generation_id":day,"session_date":day,"observed_at":day+"T10:00:00+00:00","input_payload":{"inputs":inputs,"universe_membership":["s"],"excluded_members":[],
            "membership_provenance":{"status":"OBSERVED_INDEPENDENT_LISTED_SET","observed_at":day+"T09:00:00+00:00","listed_count":1,"market_coverage_verified":True}},"result_payload":{"strategy_version":"trading-intelligence-v4","rows":[{"stock":{"id":"s"}}]}})
        for arm in REQUIRED_ARMS:
            case={"session_date":day,"arm":arm,"stock_id":"s","symbol":"CONTROLLED","permitted":False,"strata":["missing_objective"],"source_generation":day,"source_input_hash":"CONTROLLED","shared_decision_id":"CONTROLLED","known_at":day+"T10:00:00+00:00","thesis_hash":stable_audit_hash("CONTROLLED unchanged thesis")}
            runs.append({"session":day,"arm":arm,"changed_actions_unattributed":False,"guardrails":{"hard_violations":[],"unverified_permitted_quotes":[],"market_unknown":False,"exercised_exceptions":[],"exception_evidence":[],"chart_cases":[{**case,"case_hash":stable_audit_hash(case)}]},
                "evidence":{"source_generation":day,"source_input_hash":stable_audit_hash(inputs),"membership":["s"],"source_verification":"OWNING_HASH_AND_WIRE_DIGEST_VERIFIED","output_hash":"b"*64,"evidence_class":"COUNTERFACTUAL","freeze_source_hash":"a"*64}})
    args={"freeze":date(2026,11,11),"calendar":calendar,"as_of":"2026-12-13T00:00:00+00:00",
        "freeze_manifest":{"source_hash":"a"*64,"baseline":"trading-intelligence-v4","arms":list(REQUIRED_ARMS),"freeze_date":"2026-11-11","recorded_at":"2026-11-11T00:00:00+00:00"},"human_reviews":review_receipts(runs,days)}
    return captures,runs,args


def test_weekly_receipts_bind_dse_weeks_actual_cases_counts_shortfalls_and_signoff():
    from app.modules.trading_intelligence.practicality_operational import _weekly_review_failures,operational_readiness
    captures,runs,args=operational_window();days=[row["session_date"] for row in captures]
    assert len(args["human_reviews"]["weekly_reviews"])==5 # Initial/final partial weeks are real weeks too.
    assert _weekly_review_failures(args["human_reviews"],runs,days,datetime(2026,12,13,tzinfo=UTC))==[]
    bad=copy.deepcopy(args["human_reviews"])
    bad["weekly_reviews"]=[bad["weekly_reviews"][0]]*5
    assert "DISTINCT_DATED_WEEKLY_REVIEW_RECEIPTS_REQUIRED" in _weekly_review_failures(bad,runs,days,datetime(2026,12,13,tzinfo=UTC))
    bad=copy.deepcopy(args["human_reviews"]);bad["weekly_reviews"][0].pop("reviewed_at")
    assert "DATED_WEEKLY_SIGNOFF_REQUIRED" in _weekly_review_failures(bad,runs,days,datetime(2026,12,13,tzinfo=UTC))
    bad=copy.deepcopy(args["human_reviews"]);bad["weekly_reviews"][0]["rejected_count"]+=1
    assert "WEEKLY_COUNTS_OR_SHORTFALLS_REQUIRED" in _weekly_review_failures(bad,runs,days,datetime(2026,12,13,tzinfo=UTC))
    bad=copy.deepcopy(args["human_reviews"]);bad["weekly_reviews"][0].update(coverage=None,shortfalls=None)
    assert "WEEKLY_STRATUM_COVERAGE_REQUIRED" in _weekly_review_failures(bad,runs,days,datetime(2026,12,13,tzinfo=UTC))
    runs[0]["guardrails"]["exercised_exceptions"]=["pullback_hold","high_risk_exception"]
    assert operational_readiness(captures,runs,**args)["status"]=="NOT_READY"


def ready_operational_window(*,basis="CURRENT"):
    captures,runs,args=operational_window()
    controls={arm:exception_control(arm,basis=basis) for arm in ("risk","pullback","combined")}
    envelope=controls["risk"][1];captures[0]=envelope
    first_day=envelope["session_date"]
    for run in runs:
        if run["session"]!=first_day:continue
        run["evidence"].update(source_generation=envelope["generation_id"],source_input_hash=stable_audit_hash(envelope["input_payload"]["inputs"]),membership=sorted(envelope["input_payload"]["inputs"]))
        if run["arm"] in controls:run["guardrails"]=controls[run["arm"]][0]
        else:
            case=run["guardrails"]["chart_cases"][0]
            case.update(stock_id=next(iter(envelope["input_payload"]["inputs"])),source_generation=envelope["generation_id"])
            case["case_hash"]=stable_audit_hash({key:value for key,value in case.items() if key!="case_hash"})
    args["human_reviews"]=review_receipts(runs,[row["session_date"] for row in captures])
    return captures,runs,args


def test_all_candidate_specific_central_proofs_and_distinct_reviews_can_satisfy_structural_gate():
    from app.modules.trading_intelligence.practicality_operational import operational_readiness
    captures,runs,args=ready_operational_window()
    first_day=captures[0]["session_date"]
    result=operational_readiness(captures,runs,**args)
    assert result["failures"]==[] and result["status"]=="READY_FOR_DAY_20_HUMAN_DECISION"
    risk=next(run for run in runs if run["session"]==first_day and run["arm"]=="risk")
    risk["guardrails"]["exception_evidence"]=[]
    # Combined's genuine risk proof cannot satisfy the risk-only candidate.
    assert {"arm":"risk","exception":"high_risk_exception"} in operational_readiness(captures,runs,**args)["unexercised_exception_arms"]


def test_unverified_current_quote_is_reported_without_vetoing_trusted_conditional_exercises():
    from app.modules.trading_intelligence.practicality_operational import operational_readiness
    captures,runs,args=ready_operational_window(basis="LAST_CLOSE")
    market=next(run for run in runs if run["session"]==captures[0]["session_date"] and run["arm"]=="market")
    market["guardrails"],_,_=exception_control("market",fault="unknown")
    args["human_reviews"]=review_receipts(runs,[row["session_date"] for row in captures])
    report=operational_readiness(captures,runs,**args)
    assert report["status"]=="READY_FOR_DAY_20_HUMAN_DECISION" and report["failures"]==[]
    assert report["unverified_permitted_quote_observations"]==[{"session":captures[0]["session_date"],"arm":"market","symbols":["BSRMSTEEL"]}]
    assert report["current_trigger_exception_arms"]==[]
    market["guardrails"]["market_unknown"]=True
    assert any("SAFETY_OR_REQUIRED_EVIDENCE_SHORTFALL" in failure for failure in operational_readiness(captures,runs,**args)["failures"])
    market["guardrails"]["market_unknown"]=False;market["guardrails"]["hard_violations"]=[{"code":"CONTROLLED actual safety violation"}]
    assert any("SAFETY_OR_REQUIRED_EVIDENCE_SHORTFALL" in failure for failure in operational_readiness(captures,runs,**args)["failures"])


def test_weekly_sample_requires_ten_permitted_and_ten_rejected_or_documented_all_available():
    from app.modules.trading_intelligence.practicality_operational import _weekly_review_failures
    captures,runs,args=operational_window();days=[row["session_date"] for row in captures]
    full_week=[run for run in runs if "2026-11-15"<=run["session"]<="2026-11-19"]
    for index,run in enumerate(full_week):
        case=run["guardrails"]["chart_cases"][0]
        case.update(stock_id=f"CONTROLLED-distinct-chart-{index}",permitted=index<16,strata=["changed_permission"] if index<16 else ["missing_objective"])
        run["evidence"]["membership"].append(case["stock_id"])
        case["case_hash"]=stable_audit_hash({key:value for key,value in case.items() if key!="case_hash"})
    reviews=review_receipts(runs,days)
    assert _weekly_review_failures(reviews,runs,days,datetime(2026,12,13,tzinfo=UTC))==[]
    # Even honest counts and represented strata cannot turn two selected cases into ten of each.
    bad=copy.deepcopy(reviews);receipt=next(row for row in bad["weekly_reviews"] if row["week_start"]=="2026-11-15")
    available=[run["guardrails"]["chart_cases"][0] for run in full_week]
    selected=[next(case for case in available if case["permitted"]),next(case for case in available if not case["permitted"])]
    receipt.update(cases=[{key:case[key] for key in ("case_hash","session_date","arm","stock_id")} for case in selected],case_count=2,permitted_count=1,rejected_count=1)
    for stratum,proof in receipt["coverage"].items():proof["reviewed_count"]=sum(stratum in case["strata"] for case in selected)
    assert _weekly_review_failures(bad,runs,days,datetime(2026,12,13,tzinfo=UTC))==["WEEKLY_TEN_OR_ALL_AVAILABLE_REQUIRED"]
    # The partial week has one distinct rejected chart, repeated unchanged across seven arms.
    first=next(row for row in reviews["weekly_reviews"] if row["week_start"]=="2026-11-08")
    assert first["permitted_count"]==0 and first["rejected_count"]==1
    assert {item["population"] for item in first["shortfalls"] if "population" in item}=={"PERMITTED","REJECTED"}
    bad=copy.deepcopy(reviews);bad["weekly_reviews"][0]["shortfalls"]=[item for item in first["shortfalls"] if "population" not in item]
    assert "WEEKLY_SAMPLE_COUNT_SHORTFALL_REQUIRED" in _weekly_review_failures(bad,runs,days,datetime(2026,12,13,tzinfo=UTC))
