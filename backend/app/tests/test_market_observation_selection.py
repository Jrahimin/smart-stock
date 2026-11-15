"""Authenticate complete producer collections before routing, cropping or ties."""
import copy
import json
from dataclasses import replace
from datetime import UTC,datetime,timedelta
from types import SimpleNamespace as NS

import pytest

from app.core.audit_hashing import canonicalize_audit_value
from app.modules.stock_details.decision.market_regime import (capture_market_context,resolve_regime_result_from_summaries,
    market_context_revision_matches,market_context_source_revision,market_observation_valid,compute_shadow_market_regime)
from app.modules.trading_intelligence.practicality_audit import audit_capture,market_context_selection
from app.tests.test_practicality_closure_repair import source_input,capture


def wire(value):return json.loads(json.dumps(canonicalize_audit_value(value)))


def longer_capture(length=52,*,owner='trading-intelligence-v3'):
    _,original=source_input();now=datetime(2026,11,13,12,tzinfo=UTC)
    days=[row.trade_date for row in original.prices[-length:]]
    assert len(days)==length
    rows=[NS(trade_date=day,index_name='DSEX',index_close=6180. if index==length-2 else 5971. if index==length-1 else 6000.,
        advancing_issues=50,declining_issues=50,unchanged_issues=0,is_finalized=True,source='CONTROLLED',updated_at=now-timedelta(hours=1)) for index,day in enumerate(days)]
    value=replace(original,strategy_version=owner,market_regime=resolve_regime_result_from_summaries(rows,decision_session_date=original.as_of_date),calculated_at=now)
    context=capture_market_context(rows,session_date=value.as_of_date,captured_at=now,generation_id='CONTROLLED_CAPTURE',session_dates=set(days))
    return value,wire(capture(value,context=context,observed=now)),rows


@pytest.mark.parametrize('length',[52,60])
@pytest.mark.parametrize('field,bad',[('index_name','GENERAL'),('session_date','2000-01-01'),('session_date',None),
    ('session_date',[]),('index_name',[]),('generation_id',{}),('context_session_date',[]),('known_at',[]),('known_at',None),('provenance_status',[])])
def test_invalid_producer_selector_cannot_route_or_backfill_an_older_row(length,field,bad):
    value,envelope,_=longer_capture(length)
    stock=str(value.stock_id);before=copy.deepcopy(envelope)
    clean=audit_capture(envelope,{},'c1')['diagnostics'][stock]
    assert clean['regime']['label']=='BEARISH' and clean['canonical']['non_holder_action']!='BUY'
    envelope['input_payload']['market_context'][-2][field]=bad
    # Header, stock input and owning immutable publication are unchanged.
    assert envelope['input_payload']['inputs']==before['input_payload']['inputs'] and envelope['result_payload']==before['result_payload']
    result=audit_capture(envelope,{},'c1')['diagnostics'][stock]
    assert result['canonical']['regime_permission']=='UNKNOWN' and result['canonical']['regime_confidence']==0
    assert result['canonical']['non_holder_action']!='BUY'
    assert market_context_selection({},envelope)['rows']==[]


def shadow_capture():
    _,original=source_input();days=[row.trade_date for row in original.prices]
    now=datetime(2026,11,12,13,tzinfo=UTC);previous=days[-2]
    def context(day,generation,clock):
        rows=[NS(trade_date=value,index_name='DSEX',index_close=100.,advancing_issues=70,declining_issues=30,
            unchanged_issues=0,is_finalized=True,source='CONTROLLED',updated_at=clock) for value in days if value<=day]
        return capture_market_context(rows,session_date=day,captured_at=clock,generation_id=generation,session_dates=set(days))
    prior_clock=datetime.combine(previous,datetime.min.time(),UTC)+timedelta(hours=10)
    prior={'generation_id':'prior-original','session_date':previous.isoformat(),'observed_at':prior_clock.isoformat(),
        'input_payload':{'market_context':context(previous,'prior-original',prior_clock)}}
    current=capture(original,context=context(original.as_of_date,'CONTROLLED_CAPTURE',now),observed=now)
    current['input_payload']['market_calendar']={'status':'VERIFIED_EXCHANGE_SESSION_CALENDAR','complete':True,'source_revision':'CONTROLLED_CALENDAR',
        'known_at':prior_clock.isoformat(),'range_start':days[0].isoformat(),'range_end':days[-1].isoformat(),'sessions':[day.isoformat() for day in days]}
    return original,wire(current),wire(prior)


@pytest.mark.parametrize('field,bad',[('unchanged',-1),('index_close',[100.]),('index_close',{'close':100.}),('session_date',None),
    ('provenance_status',[]),('provenance_status',{}),('source_revision',[]),('generation_id',[])])
def test_full_strict_shadow_ties_are_unknown_in_both_orders(field,bad):
    value,current,prior=shadow_capture();stock=str(value.stock_id)
    clean=audit_capture(current,{'captures':[prior,current]},'market')
    assert clean['diagnostics'][stock]['market_permission']=='ORDINARY'
    assert clean['diagnostics'][stock]['canonical']['non_holder_action']=='BUY'
    row=prior['input_payload']['market_context'][-1];corrupt={**row,field:bad}
    outcomes=[]
    for pair in ([corrupt,row],[row,corrupt]):
        changed=copy.deepcopy(prior);changed['input_payload']['market_context'][-1:]=pair
        result=audit_capture(current,{'captures':[changed,current]},'market')
        outcomes.append((result['manifest']['derived_generation'],result['diagnostics'][stock]['canonical']))
        assert outcomes[-1][1]['regime_permission']=='UNKNOWN' and outcomes[-1][1]['non_holder_action']!='BUY'
    assert outcomes[0]==outcomes[1]


@pytest.mark.parametrize('conflict',[False,True])
def test_valid_equal_clock_candidates_compare_the_complete_committed_payload(conflict):
    value,current,prior=shadow_capture();stock=str(value.stock_id)
    row=prior['input_payload']['market_context'][-1]
    duplicate=copy.deepcopy(row)
    if conflict:
        duplicate['unchanged']=1
        duplicate['source_revision']=market_context_source_revision(duplicate)
    assert market_context_revision_matches(row) and market_context_revision_matches(duplicate)
    values=[]
    for pair in ([row,duplicate],[duplicate,row]):
        changed=copy.deepcopy(prior);changed['input_payload']['market_context'][-1:]=pair
        result=audit_capture(current,{'captures':[changed,current]},'market')
        values.append((result['manifest']['derived_generation'],result['diagnostics'][stock]['canonical']))
        assert values[-1][1]['regime_permission']==('UNKNOWN' if conflict else 'ORDINARY')
    assert values[0]==values[1]
    # A separately selected, valid regenerated observation remains usable.
    changed=copy.deepcopy(prior);changed['input_payload']['market_context'][-1]=duplicate
    assert audit_capture(current,{'captures':[changed,current]},'market')['diagnostics'][stock]['market_permission']=='ORDINARY'


def test_direct_reconstruction_cannot_disguise_a_damaged_producer_digest():
    value,current,prior=shadow_capture()
    rows=prior['input_payload']['market_context']+current['input_payload']['market_context']
    dates=sorted({row['session_date'] for row in rows})
    assert compute_shadow_market_regime(rows,as_of=value.as_of_date,allow_reconstructed=True,expected_sessions=dates).permission_state=='ORDINARY'
    rows[-1]['index_close']=1.
    rows[-1]['authenticated']=False;rows[-1].pop('provenance_status')
    assert not market_observation_valid(rows[-1])
    assert compute_shadow_market_regime(rows,as_of=value.as_of_date,allow_reconstructed=True,expected_sessions=dates).permission_state=='UNKNOWN'
    raw=[{'session_date':row['session_date'],'index_close':100.,'advancing':70,'declining':30,'authenticated':False} for row in rows]
    assert compute_shadow_market_regime(raw,as_of=value.as_of_date,allow_reconstructed=True,expected_sessions=dates).permission_state=='ORDINARY'


@pytest.mark.parametrize('bad',[None,[],{},'not-a-date','20261112'])
def test_malformed_raw_reconstructed_dates_fail_closed_before_index_routing(bad):
    value,current,_=shadow_capture()
    rows=[{'trade_date':row['session_date'],'index_name':'DSEX','index_close':'100','advancing_issues':70,'declining_issues':30}
        for row in current['input_payload']['market_context']]
    current['input_payload'].pop('market_context')
    rows[-1]['trade_date']=bad
    output=audit_capture(current,{'market_summaries':rows},'c1',reconstructed_market=True)
    assert output['diagnostics'][str(value.stock_id)]['canonical']['non_holder_action']!='BUY'
