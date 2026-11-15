"""Shared watch selection uses actual canonical engine output, not activity."""
import json
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

import pytest

from app.modules.market_universe.market_universe_compute import canonical_analysis_to_read
from app.modules.market_universe.market_universe_schemas import ScoredUniverseRow, DisplayQuoteRead
from app.modules.market_universe.top_setups import project_top_setups
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.stock_details.decision.market_regime import compute_market_regime_result
from app.modules.stock_details.decision.summary import build_trader_decision_summary
from app.modules.stock_details.decision.entry_applicability import EntryApplicabilityRead, EntryPathFacts, plan_path_termination
from app.modules.trading_intelligence.input_capture import restore_strategy_input


def setup_row():
    captured = json.loads((Path(__file__).parent/'fixtures/practicality_bsr_capture.json').read_text())
    # Explicit favorable controlled market, not a rewrite of the captured
    # publication: the original snapshot has a bearish market veto.
    value = replace(restore_strategy_input(captured['input']), strategy_version='trading-intelligence-v3',
        market_regime=compute_market_regime_result([100+i*.1 for i in range(60)],70,30))
    bundle = compute_trader_decision(value)
    row = ScoredUniverseRow.model_validate(captured['row'])
    row.decision = build_trader_decision_summary(bundle)
    row.analysis = canonical_analysis_to_read(bundle)
    row.display_quote = DisplayQuoteRead(current_price=bundle.snapshot.latest_price, as_of_trade_date=value.as_of_date.isoformat(), observation_status='SOURCE_TIME')
    row.entry_applicability = EntryApplicabilityRead(status='AWAITING_CONFIRMATION',reason_code='COMPLETED_PULLBACK_HOLD_REQUIRED',assessed_at=value.calculated_at,price_basis='CURRENT')
    return row, value


def test_pending_setup_remains_watch_and_no_pulse_score_is_required():
    row,_ = setup_row()
    row.display_quote.current_price=(row.analysis.trade_plan.entry_zone_low+row.analysis.trade_plan.entry_zone_high)/2
    before = row.decision.model_dump()
    rows = project_top_setups([row])
    assert rows[0].top_setup is not None
    assert rows[0].top_setup.readiness == 'AWAITING_CONFIRMATION'
    assert rows[0].top_setup.setup_type == 'PULLBACK'
    assert rows[0].decision.model_dump() == before


@pytest.mark.parametrize('status',['INVALIDATED','EXPIRED'])
def test_invalid_or_expired_plan_is_not_filled_with_an_activity_pick(status):
    row,value = setup_row()
    row.entry_applicability = EntryApplicabilityRead(status=status,reason_code='STOP_BREACHED' if status=='INVALIDATED' else 'PLAN_EXPIRED',assessed_at=value.calculated_at)
    assert project_top_setups([row])[0].top_setup is None


def test_risk_avoid_does_not_gain_permission_from_strong_structure():
    row,_ = setup_row()
    row.decision = row.decision.model_copy(update={'non_holder_action':'AVOID'})
    assert project_top_setups([row])[0].top_setup is None


def test_known_outside_zone_is_wait_not_a_positive_current_trigger():
    row,_=setup_row()
    row.display_quote.current_price=row.analysis.trade_plan.entry_zone_high*1.01
    setup=project_top_setups([row])[0].top_setup
    assert setup and setup.readiness=='WAIT_FOR_PRICE' and setup.holder_guidance=='HOLD_NO_ADD'


def test_sector_variety_never_promotes_a_weaker_readiness_group():
    row,value=setup_row()
    rows=[]
    for i in range(6):
        item=row.model_copy(deep=True)
        item.stock=item.stock.model_copy(update={'id':uuid4(),'symbol':f'S{i}','sector':'Steel' if i<5 else 'Bank'})
        if i<5:
            item.display_quote.current_price=(item.analysis.trade_plan.entry_zone_low+item.analysis.trade_plan.entry_zone_high)/2
            item.entry_applicability=EntryApplicabilityRead(status='APPLICABLE',reason_code='ENTRY_TERMS_MET',assessed_at=value.calculated_at,price_basis='CURRENT')
        else:item.display_quote.current_price=item.analysis.trade_plan.entry_zone_high*1.01
        rows.append(item)
    selected=sorted((item for item in project_top_setups(rows) if item.top_setup),key=lambda item:item.top_setup.rank)
    assert len(selected)==5 and all(item.stock.sector=='Steel' for item in selected)
    assert [item.stock.symbol for item in project_top_setups(list(reversed(rows))) if item.top_setup] # stable IDs survive input order


def test_watch_scenarios_share_executable_path_invalidation_and_expiry():
    row,value=setup_row();plan=row.analysis.trade_plan
    from datetime import timedelta
    dates=tuple(value.as_of_date+timedelta(days=i+1) for i in range(plan.expiry_sessions+1))
    assert plan_path_termination(plan,EntryPathFacts(sessions=dates,ended_sessions=frozenset(dates)),value.as_of_date)==('EXPIRED','PLAN_EXPIRED')
    assert plan_path_termination(plan,EntryPathFacts(sessions=dates,reliable_lows=((dates[0],plan.stop_loss-1),)),value.as_of_date)==('INVALIDATED','STOP_BREACHED')
    assert project_top_setups([row],unusable_ids={row.stock.id})[0].top_setup is None


def test_conditions_met_preserves_close_basis_time_and_never_changes_canonical():
    row,value=setup_row()
    row.display_quote.current_price=(row.analysis.trade_plan.entry_zone_low+row.analysis.trade_plan.entry_zone_high)/2
    row.entry_applicability=EntryApplicabilityRead(status='APPLICABLE',reason_code='ENTRY_TERMS_MET',assessed_at=value.calculated_at,quote_session_date=value.as_of_date,price_basis='LAST_CLOSE')
    result=project_top_setups([row])[0]
    assert result.top_setup.readiness=='CONDITIONS_MET' and result.top_setup.price_basis=='LAST_CLOSE'
    assert result.top_setup.price_session_date==value.as_of_date


def test_additive_watch_field_does_not_change_immutable_old_row_wire():
    row,_=setup_row()
    assert 'top_setup' not in row.model_dump(mode='json')


@pytest.mark.parametrize('fields',[{'observation_status':'NO_TRADE'},{'volume':0},{'data_quality':'SUSPICIOUS'},{'data_quality':'SUSPENDED'}])
def test_untradeable_observations_never_fill_the_watch_shortlist(fields):
    row,_=setup_row()
    row.display_quote=row.display_quote.model_copy(update=fields)
    assert project_top_setups([row])[0].top_setup is None


def test_unknown_clock_is_a_dated_condition_not_confirmed_pending_entry():
    row,value=setup_row()
    row.entry_applicability=EntryApplicabilityRead(status='UNVERIFIED',reason_code='QUOTE_UNUSABLE',assessed_at=value.calculated_at)
    assert project_top_setups([row])[0].top_setup.readiness=='CONDITIONAL_SETUP'
    row.entry_applicability=row.entry_applicability.model_copy(update={'reason_code':'PATH_INCOMPLETE'})
    assert project_top_setups([row])[0].top_setup is None


def test_history_qualification_is_independent_of_old_quote_or_readiness():
    from app.modules.market_universe.top_setups import _candidate
    row,_=setup_row()
    row.display_quote.current_price=row.analysis.trade_plan.target_low*2
    assert _candidate(row) is None
    assert _candidate(row,qualification_only=True) is True
