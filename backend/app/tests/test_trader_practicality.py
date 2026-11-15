from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.core.enums import OpportunityQuality, TradePlanStatus, TrendDirection
from app.modules.stock_details.decision.entry_applicability import entry_price_context, pullback_hold_confirmed
from app.modules.stock_details.decision.market_regime import capture_market_context,compute_shadow_market_regime,market_context_source_revision
from app.modules.stock_details.decision.risk import compute_trading_risk
from app.modules.stock_details.decision.scoring import _score_momentum, _score_volume
from app.modules.stock_details.decision.trade_plan import compute_trade_plan
from app.tests.test_decision_model_coherence import _bullish_snapshot
from app.tests.test_entry_applicability import assess, terms, DAY, REFERENCE, EntryPathFacts


def context(*, distance=-0.555, advancing=145, declining=201):
    summaries = []
    for i in range(51):
        # Every session carries its own immutable close. The last two distances
        # are calculated against their own 50-session windows by the engine.
        day=date(2026, 8, 1)+timedelta(days=i)
        summaries.append(SimpleNamespace(trade_date=day,index_name="DSEX",index_close=100 if i<49 else 100+distance,
            advancing_issues=advancing,declining_issues=declining,unchanged_issues=0,is_finalized=True,
            source="CONTROLLED",updated_at=datetime.combine(day,datetime.min.time(),UTC)+timedelta(hours=12)))
    return [row for day in (summaries[-2].trade_date,summaries[-1].trade_date)
        for row in capture_market_context(summaries,session_date=day,generation_id="CONTROLLED-"+day.isoformat(),
            captured_at=datetime.combine(day,datetime.min.time(),UTC)+timedelta(hours=12),session_dates={row.trade_date for row in summaries})]


def strict_market(rows, *, as_of):
    return compute_shadow_market_regime(rows, as_of=as_of,
        expected_sessions=[row["session_date"] for row in rows],
        selection_at=as_of.isoformat()+"T17:00:00+00:00",
        session_cutoffs={row["session_date"]: row["session_date"]+"T16:00:00+00:00" for row in rows})


@pytest.mark.parametrize("advancing,declining,expected", [(145,201,"CAUTION"), (40,60,"RESTRICTED"), (55,45,"CAUTION"), (60,40,"CAUTION")])
def test_frozen_market_joint_predicate(advancing, declining, expected):
    rows = context(distance=-1, advancing=advancing, declining=declining)
    assert strict_market(rows, as_of=date(2026, 9, 20)).permission_state == expected


def test_market_unknown_cannot_use_future_or_unauthenticated_history():
    rows = context()
    cutoff = date.fromisoformat(rows[-1]["session_date"])
    assert strict_market(rows, as_of=cutoff).permission_state == "CAUTION"
    assert strict_market(rows, as_of=cutoff-timedelta(days=1)).permission_state == "UNKNOWN"
    rows[2]["authenticated"] = False
    assert strict_market(rows, as_of=cutoff).permission_state == "UNKNOWN"
    rows[2]["authenticated"] = True
    rows[-1]["advancing"] = None
    rows[-1]["source_revision"] = market_context_source_revision(rows[-1])
    assert strict_market(rows, as_of=cutoff).permission_state == "UNKNOWN"


def test_contextual_oversold_retains_return_adjustments_and_does_not_reward_falling_volume():
    snapshot = replace(_bullish_snapshot(), trend=TrendDirection.DOWNTREND, rsi=25,
        return_5d_percent=None, return_20d_percent=None, price_change_percent=-1)
    assert _score_momentum(snapshot).score == 72
    assert _score_momentum(snapshot, contextual=True).score == 50
    assert _score_volume(snapshot, "NORMAL", contextual=True).score <= 50
    assert _score_momentum(replace(snapshot, return_5d_percent=-4), contextual=True).score == 40


@pytest.mark.parametrize("boundary", [2.3, 3.0])
def test_continuous_risk_removes_step_without_changing_legacy(boundary):
    snapshot = _bullish_snapshot()
    left = compute_trading_risk(replace(snapshot, volatility=boundary-0.0001), "A", continuous=True)
    right = compute_trading_risk(replace(snapshot, volatility=boundary), "A", continuous=True)
    assert abs(left.score-right.score) <= 1
    if boundary == 3:
        legacy_left = compute_trading_risk(replace(snapshot, volatility=boundary-0.0001), "A")
        legacy_right = compute_trading_risk(replace(snapshot, volatility=boundary), "A")
        assert legacy_right.score > legacy_left.score + 10


def test_continuation_deadline_and_old_version_terms_stay_distinct():
    snapshot = replace(_bullish_snapshot(), is_breakout=True, resistance=None)
    old = compute_trade_plan(snapshot, opportunity_quality=OpportunityQuality.STRONG)
    new = compute_trade_plan(snapshot, opportunity_quality=OpportunityQuality.STRONG, corrections=True)
    assert old.expiry_sessions is None
    assert new.expiry_sessions == new.reassessment_sessions == 5
    assert new.target_low is None and new.management_mode == "TRAILING"
    for count, expected in [(1,"APPLICABLE"), (5,"APPLICABLE"), (6,"EXPIRED")]:
        sessions = tuple(REFERENCE + timedelta(days=i+1) for i in range(count))
        assert assess(plan=terms(expiry_sessions=5), path=EntryPathFacts(sessions=sessions, complete=True)).status == expected


def test_dated_price_context_never_overrides_withdrawn_permission():
    result = assess(price=105, decision=SimpleNamespace(display_action="WAIT", blocker_codes=["bearish_market_regime"]))
    assert result.reason_code == "ACTION_NOT_PERMITTED"
    assert result.price_context.zone_relation == "ABOVE_ENTRY_ZONE"
    assert result.price_context.first_target_reward_risk == pytest.approx(5/9, abs=0.0001)
    assert entry_price_context(terms(), SimpleNamespace(current_price=110)).reward_risk_status == "TARGET_REACHED"
    assert entry_price_context(terms(), SimpleNamespace(current_price=95)).reward_risk_status == "INVALID_GEOMETRY"


def test_pullback_hold_is_shared_completed_session_rule_and_requires_later_entry():
    plan = terms(entry_timing="PULLBACK", confirmation_rule="COMPLETED_PULLBACK_HOLD", confirmation_support=99)
    assert not pullback_hold_confirmed(plan, SimpleNamespace(low_price=98, high_price=100, close_price=98.5, volume=100))
    assert pullback_hold_confirmed(plan, SimpleNamespace(low_price=98, high_price=100, close_price=99, volume=100))
    assert assess(plan=plan).reason_code == "COMPLETED_PULLBACK_HOLD_REQUIRED"
    assert assess(plan=plan, path=EntryPathFacts(sessions=(DAY,), complete=True, confirmed_on=DAY)).reason_code == "ENTRY_SESSION_PENDING"
    assert assess(plan=plan, path=EntryPathFacts(sessions=(DAY,), complete=True, confirmed_on=REFERENCE)).status == "APPLICABLE"


def test_entry_order_uses_permission_before_quality_and_retains_legacy_key():
    from app.modules.market_universe.shortlist import entry_sort_key, legacy_entry_sort_key
    def row(symbol, permission, score):
        canonical = SimpleNamespace(eligibility_status="ELIGIBLE", entry_readiness="CONDITIONAL", opportunity_quality="STRONG",
            non_holder_action=permission, trade_plan_status="VALID_ENTRY_PLAN" if permission == "BUY" else "WATCH_ONLY", opportunity_score=score)
        return SimpleNamespace(stock=SimpleNamespace(id=symbol, symbol=symbol), decision=SimpleNamespace(canonical=canonical),
            analysis=SimpleNamespace(liquidity=SimpleNamespace(label="NORMAL", median_turnover=10_000_000)))
    permitted, blocked = row("ZZZ", "BUY", 55), row("AAA", "AVOID", 99)
    assert legacy_entry_sort_key(blocked) < legacy_entry_sort_key(permitted)
    assert entry_sort_key(permitted) < entry_sort_key(blocked)
    assert entry_sort_key(row("ZERO", "BUY", 0), quality_factor=True) < entry_sort_key(row("NULL", "BUY", None), quality_factor=True)
