"""Four remaining closure defects, using actual engine/capture/audit projections."""
import copy
from dataclasses import replace
from datetime import UTC,datetime,timedelta
from types import SimpleNamespace as NS

import pytest

from app.core.audit_hashing import stable_audit_hash
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.stock_details.decision.market_regime import capture_market_context,resolve_regime_result_from_summaries
from app.modules.trading_intelligence.practicality_audit import audit_capture
from app.modules.trading_intelligence.practicality_entry_evidence import assess_bound_entry,evidence_for
from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead
from app.tests.test_practicality_closure_repair import source_input,capture,source_table_entry,exception_control,review_receipts


def context_capture(*,owner="trading-intelligence-v3",unchanged=0,provisional=None):
    _,original=source_input();observed=datetime(2026,11,13,12,tzinfo=UTC)
    rows=[NS(trade_date=price.trade_date,index_name="DSEX",index_close=100.+index,advancing_issues=70,declining_issues=30,
        unchanged_issues=unchanged,is_finalized=index!=provisional,source="CONTROLLED",updated_at=observed-timedelta(hours=1))
        for index,price in enumerate(original.prices[-51:])]
    regime=resolve_regime_result_from_summaries(rows,decision_session_date=original.as_of_date)
    value=replace(original,strategy_version=owner,market_regime=regime,calculated_at=observed)
    context=capture_market_context(rows,session_date=value.as_of_date,captured_at=observed,generation_id="CONTROLLED_CAPTURE",session_dates={row.trade_date for row in rows})
    return value,capture(value,context=context,observed=observed),rows


@pytest.mark.parametrize("fault",[None,"missing","future_knowledge","future_write","missing_auth","provisional_current","provisional_earlier"])
def test_strict_c1_uses_only_own_then_known_context_and_labels_reconstruction(fault):
    value,envelope,rows=context_capture(provisional=50 if fault=="provisional_current" else 45 if fault=="provisional_earlier" else None)
    if fault=="missing":envelope["input_payload"].pop("market_context")
    elif fault=="future_knowledge":envelope["input_payload"]["market_context"][-1]["known_at"]="2026-11-15T12:00:00+00:00"
    elif fault=="future_write":envelope["input_payload"]["market_context"][-1]["database_updated_at"]="2026-11-15T12:00:00+00:00"
    elif fault=="missing_auth":envelope["input_payload"]["market_context"][-1].pop("authenticated")
    # Later revised, final export summaries cannot replace captured evidence.
    export={"captures":[envelope],"market_summaries":[{**vars(row),"trade_date":row.trade_date.isoformat(),"is_finalized":True,
        "updated_at":"2026-11-15T12:00:00+00:00"} for row in rows]}
    strict=audit_capture(envelope,export,"c1")
    result=strict["diagnostics"][str(value.stock_id)]
    assert result["canonical"]["display_action"]==("POTENTIAL_BUY" if fault is None else "WAIT")
    assert result["regime"]["required_inputs_complete"] is (fault is None)
    assert strict["manifest"]["evidence_class"]=="COUNTERFACTUAL"
    if fault=="missing":
        reconstructed=audit_capture(envelope,export,"c1",reconstructed_market=True)
        assert reconstructed["diagnostics"][str(value.stock_id)]["canonical"]["display_action"]=="POTENTIAL_BUY"
        assert reconstructed["manifest"]["evidence_class"]=="RECONSTRUCTED_COUNTERFACTUAL"


@pytest.mark.parametrize("provisional",[None,50])
def test_supported_immutable_owning_c1_without_raw_context_replays_its_own_result(provisional):
    value,envelope,rows=context_capture(owner="trading-intelligence-v4",provisional=provisional)
    envelope["input_payload"].pop("market_context")
    export={"market_summaries":[{**vars(row),"trade_date":row.trade_date.isoformat(),"is_finalized":True,"updated_at":"2026-11-15T00:00:00+00:00"} for row in rows]}
    result=audit_capture(envelope,export,"c1")
    assert result["parity_differences"][str(value.stock_id)]=={}
    assert result["diagnostics"][str(value.stock_id)]["regime"]["required_inputs_complete"] is (provisional is None)


def test_supported_owner_identity_is_not_rewritten_by_future_sidecar():
    value,envelope,_=context_capture(owner="trading-intelligence-v4")
    envelope["input_payload"]["market_context"][-1]["known_at"]="2026-11-15T00:00:00+00:00"
    strict=audit_capture(envelope,{},"c1")
    assert strict["parity_differences"][str(value.stock_id)]=={}
    assert strict["diagnostics"][str(value.stock_id)]["regime"]==envelope["input_payload"]["inputs"][str(value.stock_id)]["market_regime"]


@pytest.mark.parametrize("unchanged",[0,None,-1])
def test_unchanged_breadth_round_trips_live_capture_and_strict_counterfactual(unchanged):
    value,envelope,_=context_capture(unchanged=unchanged)
    before=compute_trader_decision(value).canonical_result
    assert envelope["input_payload"]["market_context"][-1]["unchanged"]==unchanged
    result=audit_capture(envelope,{"captures":[envelope]},"c1")
    out=result["diagnostics"][str(value.stock_id)]
    assert out["regime"]["required_inputs_complete"] is (unchanged!=-1)
    assert out["canonical"]["display_action"]==("WAIT" if unchanged==-1 else "POTENTIAL_BUY")
    assert compute_trader_decision(value).canonical_result==before
    assert audit_capture(envelope,{"captures":[envelope]},"published")["parity_differences"][str(value.stock_id)]=={}


@pytest.mark.parametrize("table",["corporate_actions","dividend_events"])
@pytest.mark.parametrize("payload",["empty","absent","null"])
def test_raw_basis_tables_must_be_explicit_even_with_complete_receipt(table,payload):
    value,bundle,envelope,export=source_table_entry()
    if payload=="absent":export.pop(table)
    elif payload=="null":export[table]=None
    quote,assessment,_=assess_bound_entry(capture=envelope,export=export,value=value,bundle=bundle,fallback_quote=DisplayQuoteRead(current_price=None))
    member=evidence_for(envelope,export)["members"][str(value.stock_id)]
    assert member["basis_evidence"]["status"]==("VERIFIED" if payload=="empty" else "UNKNOWN")
    assert assessment.status==("APPLICABLE" if payload=="empty" else "UNVERIFIED")


@pytest.mark.parametrize("events",["empty","absent","null"])
def test_captured_basis_evidence_has_its_own_explicit_event_payload_contract(events):
    value,bundle,envelope,export=source_table_entry()
    bound=copy.deepcopy(evidence_for(envelope,export))
    basis=bound["members"][str(value.stock_id)]["basis_evidence"]
    if events=="absent":basis.pop("events")
    elif events=="null":basis["events"]=None
    # Already captured evidence does not require its raw export tables again.
    export.pop("corporate_actions");export.pop("dividend_events")
    envelope["input_payload"]["entry_evidence"]=bound
    _,assessment,_=assess_bound_entry(capture=envelope,export=export,value=value,bundle=bundle,fallback_quote=DisplayQuoteRead(current_price=None))
    assert assessment.status==("APPLICABLE" if events=="empty" else "UNVERIFIED")


def test_missing_basis_payload_does_not_erase_an_authenticated_stop_breach():
    value,bundle,envelope,export=source_table_entry()
    export["quote_prices"][0]["low_price"]=bundle.trade_plan.stop_loss-.01
    export.pop("corporate_actions");export.pop("dividend_events")
    _,assessment,_=assess_bound_entry(capture=envelope,export=export,value=value,bundle=bundle,fallback_quote=DisplayQuoteRead(current_price=None))
    assert assessment.status=="INVALIDATED" and assessment.reason_code=="STOP_BREACHED"


def chart_comparison_inventory(*,count):
    """CONTROLLED distinct-stock copies of real engine outcomes, centrally projected."""
    from app.modules.trading_intelligence.practicality_operational import run_guardrails
    runs=[];raw_results={}
    for permitted in (True,False):
        value,envelope,_=context_capture(unchanged=0 if permitted else -1)
        export={"captures":[envelope]}
        for arm in ("c1","ranking"):
            actual=audit_capture(envelope,export,arm)
            raw_results[(permitted,arm)]=actual
            diagnostic=next(iter(actual["diagnostics"].values()))
            assert (diagnostic["canonical"]["non_holder_action"]=="BUY") is permitted
            controlled=copy.deepcopy(actual);controlled["diagnostics"]={}
            for index in range(count):
                stock=f"CONTROLLED-{'PERMITTED' if permitted else 'REJECTED'}-{index:02}"
                clone=copy.deepcopy(diagnostic)
                clone.update(symbol=stock,source_input_hash=stable_audit_hash({"stock":stock,"source":"CONTROLLED distinct chart inventory"}))
                clone["canonical"].update(stock_id=stock,input_hash=stable_audit_hash({"stock":stock,"input":diagnostic["canonical"]["input_hash"]}),
                    shared_decision_id=stable_audit_hash({"stock":stock,"decision":diagnostic["canonical"]["shared_decision_id"]}))
                controlled["diagnostics"][stock]=clone
            guard=run_guardrails(controlled)
            runs.append({"session":value.as_of_date.isoformat(),"arm":arm,"guardrails":guard,
                "evidence":{"source_generation":envelope["generation_id"],"membership":sorted(controlled["diagnostics"])}})
    return runs,raw_results


def test_actual_arm_lineage_differences_do_not_create_distinct_unchanged_charts():
    from app.modules.trading_intelligence.practicality_operational import run_guardrails,_distinct_chart_cases
    _,results=chart_comparison_inventory(count=1)
    for permitted in (True,False):
        left=run_guardrails(results[(permitted,"c1")])["chart_cases"][0]
        right=run_guardrails(results[(permitted,"ranking")])["chart_cases"][0]
        assert left["candidate_input_hash"]!=right["candidate_input_hash"] and left["shared_decision_id"]!=right["shared_decision_id"]
        assert left["thesis_hash"]==right["thesis_hash"] and len(_distinct_chart_cases([left,right]))==1
    # Real change in permission is separately inspectable, even for the same source stock/date.
    assert len(_distinct_chart_cases([run_guardrails(result)["chart_cases"][0] for result in results.values()]))==2


def test_actual_central_geometry_change_remains_a_distinct_chart():
    from dataclasses import asdict
    from app.core.audit_hashing import canonicalize_audit_value
    from app.modules.trading_intelligence.practicality_audit import plan_diagnostics
    from app.modules.trading_intelligence.practicality_operational import run_guardrails,_distinct_chart_cases
    value,envelope,_=context_capture();original=audit_capture(envelope,{},"c1")
    current=replace(value,strategy_version="trading-intelligence-v4")
    baseline=compute_trader_decision(current)
    # Explicit CONTROLLED feature change, using the real engine/plan builder.
    altered=compute_trader_decision(current,snapshot=replace(baseline.snapshot,resistance=baseline.snapshot.resistance+10))
    assert altered.proposed_trade_plan.target_low!=baseline.proposed_trade_plan.target_low
    changed=copy.deepcopy(original);diagnostic=next(iter(changed["diagnostics"].values()))
    diagnostic.update(canonical=canonicalize_audit_value(asdict(altered.canonical_result)),plan=plan_diagnostics(altered,current))
    cases=[run_guardrails(result)["chart_cases"][0] for result in (original,changed)]
    assert cases[0]["thesis_hash"]!=cases[1]["thesis_hash"] and len(_distinct_chart_cases(cases))==2


def test_explanatory_copy_alone_does_not_inflate_the_chart_inventory():
    from app.modules.trading_intelligence.practicality_operational import run_guardrails,_distinct_chart_cases
    value,envelope,_=context_capture();original=audit_capture(envelope,{},"c1")
    copy_only=copy.deepcopy(original);diagnostic=next(iter(copy_only["diagnostics"].values()))
    diagnostic["canonical"].update(primary_reason="CONTROLLED wording only",entry_condition="CONTROLLED same machine condition")
    diagnostic["plan"]["proposed"].update(explanation="CONTROLLED wording only",condition_text="CONTROLLED same machine condition")
    cases=[run_guardrails(result)["chart_cases"][0] for result in (original,copy_only)]
    assert len(_distinct_chart_cases(cases))==1


def test_weekly_duplicate_arm_copies_cannot_satisfy_ten_distinct_charts_but_diverse_ten_can():
    from app.modules.trading_intelligence.practicality_operational import _weekly_review_failures,CHART_STRATA
    runs,_=chart_comparison_inventory(count=12);days=[runs[0]["session"]]
    reviews=review_receipts(runs,days)
    reviews["weekly_reviews"][0]["reviewed_at"]="2026-11-13T13:00:00+00:00" # After the actual source capture became known.
    assert reviews["weekly_reviews"][0]["permitted_count"]==12 and reviews["weekly_reviews"][0]["rejected_count"]==12
    def receipt_for(selected,permitted_count,rejected_count):
        result=copy.deepcopy(reviews);receipt=result["weekly_reviews"][0]
        receipt.update(cases=[{key:case[key] for key in ("case_hash","session_date","arm","stock_id")} for case in selected],
            case_count=permitted_count+rejected_count,permitted_count=permitted_count,rejected_count=rejected_count)
        # Distinct stock IDs here are independently known controlled chart identities.
        unique={case["stock_id"]:case for case in selected}
        for stratum in CHART_STRATA:receipt["coverage"][stratum]["reviewed_count"]=sum(stratum in case["strata"] for case in unique.values())
        return result
    all_cases=[case for run in runs for case in run["guardrails"]["chart_cases"]]
    duplicated=[case for case in all_cases if int(case["stock_id"].rsplit('-',1)[1])<5] # 10 arm rows/population, only five charts.
    bad=receipt_for(duplicated,10,10)
    failures=_weekly_review_failures(bad,runs,days,datetime(2026,11,13,23,tzinfo=UTC))
    assert "WEEKLY_COUNTS_OR_SHORTFALLS_REQUIRED" in failures and "WEEKLY_TEN_OR_ALL_AVAILABLE_REQUIRED" in failures
    diverse=[case for case in all_cases if case["arm"]=="c1" and int(case["stock_id"].rsplit('-',1)[1])<10]
    assert _weekly_review_failures(receipt_for(diverse,10,10),runs,days,datetime(2026,11,13,23,tzinfo=UTC))==[]


def test_distinct_chart_shortfall_counts_all_available_and_requires_its_receipt():
    from app.modules.trading_intelligence.practicality_operational import _weekly_review_failures
    runs,_=chart_comparison_inventory(count=2);days=[runs[0]["session"]]
    reviews=review_receipts(runs,days);receipt=reviews["weekly_reviews"][0]
    receipt["reviewed_at"]="2026-11-13T13:00:00+00:00"
    assert (receipt["case_count"],receipt["permitted_count"],receipt["rejected_count"])==(4,2,2)
    assert _weekly_review_failures(reviews,runs,days,datetime(2026,11,13,23,tzinfo=UTC))==[]
    receipt["shortfalls"]=[item for item in receipt["shortfalls"] if "population" not in item]
    assert "WEEKLY_SAMPLE_COUNT_SHORTFALL_REQUIRED" in _weekly_review_failures(reviews,runs,days,datetime(2026,11,13,23,tzinfo=UTC))
