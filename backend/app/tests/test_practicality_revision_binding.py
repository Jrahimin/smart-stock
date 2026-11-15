"""Actual producer compatibility and value/revision binding on strict consumers."""
import copy
import inspect
import json
from dataclasses import asdict,replace
from datetime import datetime

import pytest

from app.core.audit_hashing import canonicalize_audit_value,stable_audit_hash
from app.modules.stock_details.decision import market_regime as regimes
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.trading_intelligence.input_capture import restore_strategy_input
from app.modules.trading_intelligence.practicality_audit import audit_capture,ARMS
from app.tests.test_practicality_evidence_closure import context_capture


def wire(value):
    return json.loads(json.dumps(canonicalize_audit_value(value)))


@pytest.mark.parametrize("unchanged",[None,0,-1])
@pytest.mark.parametrize("producer",["previous","current"])
@pytest.mark.parametrize("reconstructed",[False,True])
def test_owning_c1_producer_json_roundtrip_cannot_reconstruct_away_known_facts(unchanged,producer,reconstructed):
    value,capture,rows=context_capture(owner="trading-intelligence-v4",unchanged=unchanged)
    if producer=="previous":
        source=inspect.getsource(regimes.capture_market_context)
        previous=source.replace('            "unchanged": getattr(row, "unchanged_issues", None),\n','').replace('market_context_source_revision(value)','stable_audit_hash(value)')
        assert previous!=source
        namespace={};exec(previous,{**regimes.__dict__,"stable_audit_hash":stable_audit_hash},namespace)
        capture["input_payload"]["market_context"]=namespace["capture_market_context"](rows,session_date=value.as_of_date,
            captured_at=datetime.fromisoformat(capture["observed_at"]),generation_id=capture["generation_id"],session_dates={row.trade_date for row in rows})
    capture=wire(capture)
    assert all(regimes.market_context_revision_matches(row) for row in capture['input_payload']['market_context'])
    for observation in capture['input_payload']['market_context']:
        committed={key:value for key,value in observation.items() if key not in {'source_revision','known_at','context_session_date','generation_id','authenticated','provenance_status','execution_quote_authority'}}
        assert observation['source_revision']==stable_audit_hash(committed)
    original=restore_strategy_input(capture['input_payload']['inputs'][str(value.stock_id)])
    # Empty export supplies no additional knowledge; mode is not evidence.
    for arm in ('published','c1','risk','rsi','pullback','ranking'):
        output=audit_capture(capture,{},arm,reconstructed_market=reconstructed)
        expected=compute_trader_decision(replace(original,strategy_version=ARMS[arm] or original.strategy_version))
        assert output['diagnostics'][str(value.stock_id)]['canonical']==canonicalize_audit_value(asdict(expected.canonical_result))
        assert output['diagnostics'][str(value.stock_id)]['regime']==canonicalize_audit_value(asdict(original.market_regime))
        if unchanged==-1:assert output['diagnostics'][str(value.stock_id)]['canonical']['non_holder_action']!='BUY'
    # Supplied later export facts do not rewrite the already sealed owner.
    later={'market_summaries':[{'trade_date':row.trade_date.isoformat(),'index_name':row.index_name,'index_close':row.index_close,
        'advancing_issues':90,'declining_issues':10,'unchanged_issues':0,'updated_at':'2026-11-15T12:00:00+00:00'} for row in rows]}
    assert audit_capture(capture,later,'c1',reconstructed_market=reconstructed)['diagnostics'][str(value.stock_id)]['regime']==canonicalize_audit_value(asdict(original.market_regime))


@pytest.mark.parametrize('field,index,value',[('index_close',-1,1.),('advancing',-1,1),('declining',-1,99),('unchanged',-1,-1),('index_close',0,10000.)])
def test_required_c1_values_cannot_keep_a_different_authenticated_revision(field,index,value):
    strategy,capture,_=context_capture()
    valid=audit_capture(wire(capture),{},'c1')
    assert valid['diagnostics'][str(strategy.stock_id)]['regime']['required_inputs_complete'] is True
    capture=wire(capture);row=capture['input_payload']['market_context'][index]
    row[field]=value
    assert not regimes.market_context_revision_matches(row)
    result=audit_capture(capture,{},'c1')['diagnostics'][str(strategy.stock_id)]
    assert result['canonical']['regime_permission']=='UNKNOWN'
    assert result['canonical']['regime_confidence']==0
    assert result['canonical']['non_holder_action']!='BUY'


def test_strict_two_session_consumer_uses_the_same_producer_revision_binding():
    value,capture,summaries=context_capture()
    dates=[row['session_date'] for row in capture['input_payload']['market_context']]
    prior=regimes.capture_market_context(summaries,session_date=value.exchange_session_dates[-2],
        captured_at=datetime.fromisoformat(capture['observed_at']),generation_id='CONTROLLED_PRIOR',session_dates=set(value.exchange_session_dates))
    rows=wire(prior+capture['input_payload']['market_context'])
    kwargs={'as_of':value.as_of_date,'expected_sessions':dates,'selection_at':capture['observed_at'],
        'session_cutoffs':{day:capture['observed_at'] for day in dates}}
    # Both actual producer vintages keep explicit ownership and session scope.
    assert regimes.compute_shadow_market_regime(rows,**kwargs).permission_state=='ORDINARY'
    for index in (0,-1):
        changed=copy.deepcopy(rows);changed[index]['index_close']=10000.
        assert regimes.compute_shadow_market_regime(changed,**kwargs).permission_state=='UNKNOWN'
    # An invalid selected revision cannot quietly fall back to an older valid
    # value from the same then-known instant.
    corrupted={**rows[-1],'index_close':1.}
    assert regimes.compute_shadow_market_regime(rows+[corrupted],**kwargs).permission_state=='UNKNOWN'


def test_old_omission_and_explicit_null_are_distinct_committed_payloads():
    _,capture,_=context_capture(unchanged=None)
    row=wire(capture)['input_payload']['market_context'][-1]
    assert regimes.market_context_revision_matches(row)
    del row['unchanged']
    assert not regimes.market_context_revision_matches(row)
    row['source_revision']=regimes.market_context_source_revision(row)
    assert regimes.market_context_revision_matches(row)
    row['unchanged']=None
    assert not regimes.market_context_revision_matches(row)


def test_valid_regenerated_producer_revision_is_distinct_from_corruption():
    value,capture,rows=context_capture()
    rows[-1].index_close=160.
    capture['input_payload']['market_context']=regimes.capture_market_context(rows,session_date=value.as_of_date,
        captured_at=datetime.fromisoformat(capture['observed_at']),generation_id=capture['generation_id'],session_dates={row.trade_date for row in rows})
    result=audit_capture(wire(capture),{},'c1')['diagnostics'][str(value.stock_id)]
    expected=compute_trader_decision(replace(value,strategy_version='trading-intelligence-v4',
        market_regime=regimes.resolve_regime_result_from_summaries(rows,decision_session_date=value.as_of_date)))
    assert result['regime']['required_inputs_complete'] is True
    assert result['canonical']==canonicalize_audit_value(asdict(expected.canonical_result))


def test_then_known_receipt_cannot_precede_its_committed_database_revision():
    value,capture,summaries=context_capture();capture=wire(capture)
    rows=capture['input_payload']['market_context']
    prior=wire(regimes.capture_market_context(summaries,session_date=value.exchange_session_dates[-2],
        captured_at=datetime.fromisoformat(capture['observed_at']),generation_id='CONTROLLED_PRIOR',session_dates=set(value.exchange_session_dates)))
    dates=[row['session_date'] for row in rows]
    kwargs={'as_of':value.as_of_date,'expected_sessions':dates,'selection_at':capture['observed_at'],
        'session_cutoffs':{day:capture['observed_at'] for day in dates}}
    assert regimes.compute_shadow_market_regime(prior+rows,**kwargs).permission_state=='ORDINARY'
    rows[-1]['known_at']='2026-11-13T10:00:00+00:00' # Producer's database revision is11:00.
    assert regimes.market_context_revision_matches(rows[-1])
    result=audit_capture(capture,{},'c1')['diagnostics'][str(value.stock_id)]
    assert result['canonical']['regime_permission']=='UNKNOWN'
    shadow=regimes.compute_shadow_market_regime(prior+rows,**kwargs)
    assert shadow.permission_state=='UNKNOWN'


@pytest.mark.parametrize('invalid',[float('nan'),float('inf'),float('-inf'),object()])
def test_unhashable_market_values_are_unknown_without_aborting_strict_audit(invalid):
    value,capture,_=context_capture()
    capture['input_payload']['market_context'][-1]['index_close']=invalid
    assert regimes.market_context_revision_matches(capture['input_payload']['market_context'][-1]) is False
    output=audit_capture(capture,{},'c1')
    result=output['diagnostics'][str(value.stock_id)]
    assert result['canonical']['regime_permission']=='UNKNOWN'
    assert result['canonical']['regime_confidence']==0
    assert result['canonical']['non_holder_action']!='BUY'
    assert output['manifest']['excluded_market_vintages']==[{'generation_id':capture['generation_id'],'reason':'INVALID_MARKET_CONTEXT_VALUES'}]
