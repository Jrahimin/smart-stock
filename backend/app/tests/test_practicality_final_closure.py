"""Supported producer vintages, strict full-fact provenance and CLI/report parity."""
import copy
from dataclasses import asdict
import inspect
import json
from datetime import UTC,datetime

import pytest

from app.core.audit_hashing import canonicalize_audit_value,stable_audit_hash
from app.modules.stock_details.decision import market_regime as regimes
from app.modules.trading_intelligence.practicality_audit import ARMS,audit_capture,arm_reconstruction_enabled
from app.modules.trading_intelligence.practicality_operational import run_guardrails,permission_changed
from app.tests.test_practicality_evidence_closure import context_capture
from app.tests.test_practicality_closure_repair import source_table_entry
from app.modules.trading_intelligence.practicality_entry_evidence import assess_bound_entry,evidence_for
from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead


@pytest.mark.parametrize("unchanged",[0,None,-1])
@pytest.mark.parametrize("producer",["previous","current"])
def test_actual_capture_producer_formats_preserve_supported_owning_c1(unchanged,producer):
    value,envelope,rows=context_capture(owner="trading-intelligence-v4",unchanged=unchanged)
    if producer=="previous":
        # Execute the actual previous capture function, whose sole format delta
        # is the omitted breadth field; no replica scoring or manufactured result.
        source=inspect.getsource(regimes.capture_market_context)
        old=source.replace('            "unchanged": getattr(row, "unchanged_issues", None),\n','')
        assert old!=source
        namespace={};exec(old,regimes.__dict__,namespace)
        envelope["input_payload"]["market_context"]=namespace["capture_market_context"](rows,session_date=value.as_of_date,
            captured_at=datetime.fromisoformat(envelope["observed_at"]),generation_id=envelope["generation_id"],session_dates={row.trade_date for row in rows})
        assert "unchanged" not in envelope["input_payload"]["market_context"][-1]
    restored=audit_capture(envelope,{},"c1")
    from app.modules.stock_details.decision.engine import compute_trader_decision
    from app.modules.trading_intelligence.input_capture import restore_strategy_input
    expected=compute_trader_decision(restore_strategy_input(envelope['input_payload']['inputs'][str(value.stock_id)])).canonical_result
    assert restored['diagnostics'][str(value.stock_id)]['canonical']==canonicalize_audit_value(asdict(expected))
    assert restored["parity_differences"][str(value.stock_id)]=={}
    assert restored["diagnostics"][str(value.stock_id)]["canonical"]["display_action"]==("WAIT" if unchanged==-1 else "POTENTIAL_BUY")
    assert audit_capture(envelope,{},"published")["parity_differences"][str(value.stock_id)]=={}


def test_strict_c1_all_canonical_facts_and_ids_ignore_later_unowned_summaries():
    value,envelope,rows=context_capture();envelope["input_payload"].pop("market_context")
    variants=[{}, {"market_summaries":[{"trade_date":row.trade_date.isoformat(),"index_name":"DSEX","index_close":float(index+1),
        "advancing_issues":90,"declining_issues":10,"is_finalized":True,"updated_at":"2026-11-15T00:00:00+00:00"} for index,row in enumerate(rows)]}]
    variants.append(copy.deepcopy(variants[-1]))
    for index,row in enumerate(variants[-1]["market_summaries"]):row.update(index_close=1000.-index,advancing_issues=10,declining_issues=90)
    outputs=[audit_capture(envelope,export,"c1") for export in variants]
    canonical=[output["diagnostics"][str(value.stock_id)]["canonical"] for output in outputs]
    assert canonical[0]==canonical[1]==canonical[2]
    assert canonical[0]["regime_score"]==50 and canonical[0]["regime_confidence"]==0 and canonical[0]["regime_permission"]=="UNKNOWN"
    assert len({output["manifest"]["derived_generation"] for output in outputs})==1


def test_strict_c1_phase_requires_trusted_51st_observation_and_not_just_the_last_50():
    value,envelope,rows=context_capture()
    for row in rows[1:]:row.index_close=100.
    envelope["input_payload"]["market_context"]=regimes.capture_market_context(rows,session_date=value.as_of_date,
        captured_at=datetime.fromisoformat(envelope["observed_at"]),generation_id=envelope["generation_id"],session_dates={row.trade_date for row in rows})
    invalid=[]
    for close in (1.,10000.):
        variant=copy.deepcopy(envelope);first=variant["input_payload"]["market_context"][0]
        first.update(index_close=close,authenticated=False,known_at="2026-11-15T00:00:00+00:00")
        result=audit_capture(variant,{},"c1");invalid.append(result["diagnostics"][str(value.stock_id)]["canonical"])
    assert invalid[0]==invalid[1] and invalid[0]["regime_permission"]=="UNKNOWN" and invalid[0]["regime_confidence"]==0
    trusted=audit_capture(envelope,{},"c1")
    assert trusted["diagnostics"][str(value.stock_id)]["regime"]["required_inputs_complete"] is True


@pytest.mark.parametrize("requested",[False,True])
def test_actual_cli_reconstruction_modes_and_outputs_match_each_direct_arm(tmp_path,monkeypatch,requested):
    from app.scripts.audit_trader_practicality import main
    value,envelope,_=context_capture();export={"captures":[envelope]}
    source=tmp_path/'source.json';source.write_text(json.dumps(canonicalize_audit_value(export)),encoding='utf8')
    output=tmp_path/'audit'
    argv=['audit_trader_practicality','--export',str(source),'--output',str(output)]
    if requested:argv.append('--reconstructed-market')
    monkeypatch.setattr('sys.argv',argv);main()
    manifest=json.loads((output/'manifest.json').read_text(encoding='utf8'))
    export=json.loads(source.read_text(encoding='utf8'));export['_audit_source_hash']=stable_audit_hash(manifest['source_hashes'])
    for arm in ARMS:
        folder=output/envelope['session_date']/arm
        delivered=json.loads((folder/'manifest.json').read_text(encoding='utf8'))
        expected='RESTORATION' if arm=='published' else 'RECONSTRUCTED_COUNTERFACTUAL' if arm_reconstruction_enabled(arm,requested) else 'COUNTERFACTUAL'
        assert delivered['evidence_class']==expected
        direct=audit_capture(export['captures'][0],export,arm,reconstructed_market=requested)
        assert json.loads((folder/'universe.json').read_text(encoding='utf8'))==direct['universe']


def test_required_market_unknown_uses_effective_canonical_permission_but_quote_unknown_is_separate():
    value,envelope,_=context_capture(unchanged=-1)
    for arm in ('c1','risk','rsi','pullback','ranking'):
        output=audit_capture(envelope,{},arm);diagnostic=output['diagnostics'][str(value.stock_id)]
        assert diagnostic['canonical']['regime_permission']==diagnostic['market_permission']=='UNKNOWN'
        guard=run_guardrails(output)
        assert guard['market_unknown'] and 'missing_market_or_quote_evidence' in guard['chart_cases'][0]['strata']
    _,valid,_=context_capture();output=audit_capture(valid,{},'c1');guard=run_guardrails(output)
    assert not guard['market_unknown'] and guard['unverified_permitted_quotes']


@pytest.mark.parametrize('before,after,changed',[('BUY','WAIT',True),('AVOID','BUY',True),('BUY','BUY',False),('AVOID','WAIT',False),('WAIT','AVOID',False)])
def test_changed_permission_means_crossing_the_permitted_thesis_predicate(before,after,changed):
    assert permission_changed({'non_holder_action':before},{'non_holder_action':after}) is changed


@pytest.mark.parametrize('table',['corporate_actions','dividend_events'])
@pytest.mark.parametrize('receipt',['valid','missing','null'])
def test_nonempty_basis_event_with_missing_or_null_receipt_is_unknown_not_an_exception(table,receipt):
    value,bundle,envelope,export=source_table_entry();stock=str(value.stock_id)
    export[table]=[{'stock_id':stock,'action_subtype':'BONUS','effective_date':'2026-11-15'}] if table=='corporate_actions' else [
        {'stock_id':stock,'status':'APPROVED','ex_dividend_date':'2026-11-15','cash_amount_per_share':1}]
    if receipt=='missing':export['source_coverage'].pop(table)
    elif receipt=='null':export['source_coverage'][table]=None
    _,assessment,_=assess_bound_entry(capture=envelope,export=export,value=value,bundle=bundle,fallback_quote=DisplayQuoteRead(current_price=None))
    assert evidence_for(envelope,export)['members'][stock]['basis_evidence']['status']==('VERIFIED' if receipt=='valid' else 'UNKNOWN')
    assert assessment.status==('INVALIDATED' if receipt=='valid' else 'UNVERIFIED')
    # A genuinely earlier published Sunday stop precedes a Monday basis event;
    # a low from the change day itself would not be economically comparable.
    current=export['quote_prices'][0]
    prior={**current,'id':'CONTROLLED-prior-stop','low_price':bundle.trade_plan.stop_loss-.01,
        'updated_at':'2026-11-15T09:00:00+00:00','source_observed_at':'2026-11-15T09:00:00+00:00','batch_fetched_at':'2026-11-15T09:00:00+00:00'}
    current.update(trade_date='2026-11-16',updated_at='2026-11-16T05:00:00+00:00',source_observed_at='2026-11-16T05:00:00+00:00',batch_fetched_at='2026-11-16T05:00:00+00:00')
    export[table][0]['effective_date' if table=='corporate_actions' else 'ex_dividend_date']='2026-11-16'
    export['exported_at']=current['updated_at'];export['quote_prices']=[prior,current]
    for coverage in export['source_coverage'].values():
        if isinstance(coverage,dict):coverage.update(range_end='2026-11-16',known_at=current['updated_at'])
    export['market_generations'][0].update(trade_date=current['trade_date'],published_at=current['updated_at'],source_last_synced_at=current['updated_at'])
    export['market_generations'].append({'id':'prior-stop-manifest','exchange':'DSE','state':'FINALIZED','accepted_count':1,'trade_date':prior['trade_date'],
        'sync_id':'prior-stop-sync','published_at':prior['updated_at'],'source_last_synced_at':prior['updated_at']})
    export['price_publication_observations']=[{'id':'prior-stop-publication','operation':'PUBLISH','source_row_id':'prior-stop-manifest','finality':'FINALIZED','observed_at':prior['updated_at'],
        'payload':{'contract':'PRICE_VERSION_MEMBERSHIP_V1','manifest_id':'prior-stop-manifest','exchange':'DSE','sync_id':'prior-stop-sync','trade_date':prior['trade_date'],'source_last_synced_at':prior['updated_at'],'price_versions':[prior]}}]
    export['price_observations']=[{'id':'write-'+row['id'],'operation':'INSERT','source_row_id':row['id'],'session_date':row['trade_date'],'observed_at':row['updated_at'],'payload':row,'previous_payload':None} for row in (prior,current)]
    _,assessment,_=assess_bound_entry(capture=envelope,export=export,value=value,bundle=bundle,fallback_quote=DisplayQuoteRead(current_price=None))
    assert assessment.status=='INVALIDATED' and assessment.reason_code=='STOP_BREACHED'
