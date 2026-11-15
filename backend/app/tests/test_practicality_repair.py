from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace as NS

import pytest

from app.core.enums import EntryTiming, ExchangeCode, MarketRegimePhase, NonHolderAction, PortfolioPriceStatus
from app.core.audit_hashing import stable_audit_hash
from app.modules.backtesting.backtesting_models import BacktestConfig, StockReplayHistory
from app.modules.backtesting.backtesting_execution import simulate_next_session_execution
from app.modules.stock_details.decision.canonical import build_strategy_input_from_prices
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.stock_details.decision.lineage import build_decision_input_lineage
from app.modules.stock_details.decision.market_regime import MarketRegimeResult, resolve_regime_result_from_summaries, compute_shadow_market_regime
from app.modules.trading_intelligence.practicality_operational import operational_readiness, select_capture_vintages, REQUIRED_ARMS, CHART_STRATA
from app.tests.test_phase1_finalized_inputs import prices
from app.tests.test_decision_model_coherence import _bullish_snapshot
from app.tests.test_backtesting_replay import _stock, _prices, _observation, _config


def test_owning_versions_and_sealed_research_identity_survive_default_rollout():
    from app.modules.backtesting.backtesting_challengers import EXPERIMENT_ID, EXPERIMENT
    from app.core.constants.trading_constants import RESEARCH_STRATEGY_VERSION
    assert EXPERIMENT_ID == "9de074ae7ea6a8ac01f54dcf48ab82c81194babcde3d2fb063b4d7f42f0b63bc"
    assert EXPERIMENT["ranking_baseline"] == "entry-shortlist-v1"
    assert RESEARCH_STRATEGY_VERSION == "trading-intelligence-v3"
    for version in ("trading-intelligence-v2", "trading-intelligence-v3"):
        config = BacktestConfig(ExchangeCode.DSE,date(2026,1,1),date(2026,1,2),strategy_version=version)
        assert config.threshold_version == "trading-thresholds-v3"
        with pytest.raises(ValueError, match="owning policy pair"):
            replace(config,threshold_version="trading-thresholds-v4")


def test_explicit_archive_market_counterfactual_cannot_override_captured_or_legacy_replay():
    from app.tests.test_phase2_replay import fixture
    from app.modules.backtesting.backtesting_engine import replay_canonical_engine
    _,_,days,config,dataset=fixture()
    with pytest.raises(ValueError,match="captured replay keeps its owner"):
        replay_canonical_engine(dataset,config,counterfactual_market_regimes={})
    shadow=replace(config,strategy_version="trading-intelligence-v4-shadow-market",threshold_version="trading-thresholds-v4",minimum_history_rows=3)
    with pytest.raises(ValueError,match="captured replay keeps its owner"):
        replay_canonical_engine(dataset,replace(shadow,replay_mode="captured"),counterfactual_market_regimes={})
    regime=MarketRegimeResult(50,"NEUTRAL",MarketRegimePhase.HEALTHY,0,"CONTROLLED reconstructed market", "CAUTION",days[-1],True)
    observations,_=replay_canonical_engine(dataset,shadow,counterfactual_market_regimes={days[-1]:regime})
    assert observations[-1].regime_permission == "CAUTION"
    assert observations[0].regime_permission == "UNKNOWN"


def test_new_hashed_regime_metadata_owns_schema_four_without_revising_legacy_hashes():
    rows=prices()
    value=build_strategy_input_from_prices(rows, category="A", exchange_session_dates=[row.trade_date for row in rows])
    legacy=replace(value,strategy_version="trading-intelligence-v3")
    extra=replace(legacy,market_regime=replace(legacy.market_regime,as_of_session=rows[-1].trade_date,required_inputs_complete=True))
    assert build_decision_input_lineage(legacy).input_hash == build_decision_input_lineage(extra).input_hash
    assert build_decision_input_lineage(legacy).input_schema_version == "trading-input-v3"
    assert build_decision_input_lineage(value).input_schema_version == "trading-input-v4"


def test_only_selected_legacy_publication_accepts_its_own_wire_pair_and_digest():
    import json
    from pathlib import Path
    from app.modules.market_universe.market_universe_schemas import ScoredUniverseCacheRead
    from app.modules.market_universe.market_universe_service import MarketUniverseService
    from app.modules.market_universe.market_universe_lineage import compute_universe_payload_revision
    raw=json.loads((Path(__file__).parent/"fixtures/pr31_legacy_universe.json").read_text())
    payload=ScoredUniverseCacheRead.model_validate(raw)
    identity=(payload.session_trade_date,payload.source_last_synced_at,payload.market_sync_id)
    assert MarketUniverseService._cache_matches_identity(payload,*identity,allow_legacy=True)
    assert not MarketUniverseService._cache_matches_identity(payload,*identity)
    broken=payload.model_copy(deep=True)
    broken.rows[0].decision.canonical.strategy_version="trading-intelligence-v4"
    broken.rows[0].decision.canonical.threshold_version="trading-thresholds-v4"
    broken.payload_revision=compute_universe_payload_revision(broken.rows)
    assert not MarketUniverseService._cache_matches_identity(broken,*identity,allow_legacy=True)
    broken=payload.model_copy(update={"payload_revision":"0"*64})
    assert not MarketUniverseService._cache_matches_identity(broken,*identity,allow_legacy=True)


@pytest.mark.parametrize("missing", ["null_latest", "absent_latest", "missing_breadth", "negative_breadth"])
def test_c1_requires_the_actual_current_index_and_breadth_but_legacy_resolver_is_retained(missing):
    rows=prices()
    day=rows[-1].trade_date
    summaries=[NS(trade_date=day-timedelta(days=50-i),index_name="DSEX",index_close=100.,advancing_issues=70,declining_issues=30,is_finalized=True) for i in range(51)]
    if missing == "absent_latest": summaries.pop()
    elif missing == "null_latest": summaries[-1].index_close=None
    elif missing == "missing_breadth": summaries[-1].advancing_issues=None
    else: summaries[-1].declining_issues=-1
    regime=resolve_regime_result_from_summaries(summaries,decision_session_date=day)
    assert regime.required_inputs_complete is False
    value=build_strategy_input_from_prices(rows,category="A",exchange_session_dates=[row.trade_date for row in rows],market_regime=regime)
    snapshot=replace(_bullish_snapshot(),latest_trade_date=day.isoformat(),volatility=1.,gap_frequency_percent=0.)
    bundle=compute_trader_decision(value,snapshot=snapshot)
    assert bundle.canonical_result.regime_permission == "UNKNOWN"
    assert bundle.decision.primary_reason_code == "market_evidence_unknown"
    legacy=compute_trader_decision(replace(value,strategy_version="trading-intelligence-v3"),snapshot=snapshot)
    assert "market_evidence_unknown" not in legacy.canonical_result.blocker_codes


def test_shadow_calendar_and_exact_vintage_fail_closed_for_stale_missing_or_later_revisions():
    from app.modules.stock_details.decision.market_regime import capture_market_context,market_context_source_revision
    days=[date(2026,1,1)+timedelta(days=i) for i in range(52)]
    # This is an explicit controlled exchange calendar, not a weekday inference.
    calendar=days[:25]+days[26:]
    summaries=[NS(trade_date=day,index_name="DSEX",index_close=100.,advancing_issues=60,declining_issues=40,
        unchanged_issues=0,is_finalized=True,source="CONTROLLED",updated_at=datetime.combine(day,datetime.min.time(),UTC)+timedelta(hours=10)) for day in calendar]
    observations=[row for day in (calendar[-2],calendar[-1]) for row in capture_market_context(summaries,
        session_date=day,captured_at=datetime.combine(day,datetime.min.time(),UTC)+timedelta(hours=10),
        generation_id="CONTROLLED-"+day.isoformat(),session_dates=set(calendar))]
    kwargs={"as_of":calendar[-1],"expected_sessions":calendar,"selection_at":datetime.combine(calendar[-1],datetime.min.time(),UTC)+timedelta(hours=18),
        "session_cutoffs":{day.isoformat():day.isoformat()+"T17:00:00+00:00" for day in calendar}}
    assert compute_shadow_market_regime(observations,**kwargs).permission_state == "ORDINARY"
    assert compute_shadow_market_regime(observations[:-1],**kwargs).permission_state == "UNKNOWN"
    assert compute_shadow_market_regime(observations[:20]+observations[21:],**kwargs).permission_state == "UNKNOWN"
    assert compute_shadow_market_regime(observations,**{**kwargs,"as_of":date(2026,11,12)}).permission_state == "UNKNOWN"
    later={**observations[-1],"known_at":calendar[-1].isoformat()+"T19:00:00+00:00","index_close":80.}
    later['source_revision']=market_context_source_revision(later)
    assert compute_shadow_market_regime(observations+[later],**kwargs).permission_state == "ORDINARY"


def test_completed_pullback_never_fills_the_next_entirely_outside_bar_and_can_revisit_zone():
    stock=_stock(); bars=_prices(stock)
    for index,values in {61:(98.3,98.6,98.1,98.4),62:(101,102,100,101),63:(98.2,98.4,98.1,98.3)}.items():
        for key,value in zip(("open_price","high_price","low_price","close_price"),values): setattr(bars[index],key,Decimal(str(value)))
    observation=replace(_observation(stock,bars,60),engine_version="trading-intelligence-v4-shadow-pullback",entry_timing=EntryTiming.PULLBACK,preferred_entry_zone_low=98.,preferred_entry_zone_high=98.5,
        invalidation_price=95.,expiry_sessions=5,confirmation_rule="COMPLETED_PULLBACK_HOLD",confirmation_support=98.,target_price=110.)
    result=simulate_next_session_execution(observation,StockReplayHistory(stock=stock,prices=tuple(bars)),tuple(row.trade_date for row in bars),_config(bars))
    assert result.execution_date == bars[63].trade_date
    assert 98 <= result.raw_price <= 98.5
    assert any(event["state"] == "AWAITING_ZONE" and event["date"] == bars[62].trade_date for event in result.events)


@pytest.mark.parametrize("touch_session,filled", [(1,True),(5,True),(6,False)])
def test_continuation_actual_attempts_respect_five_session_zone_window(touch_session,filled):
    stock=_stock(); bars=_prices(stock)
    for index in range(61,67):
        bars[index].open_price=bars[index].close_price=Decimal("101")
        bars[index].low_price=Decimal("100");bars[index].high_price=Decimal("102")
    bar=bars[60+touch_session];bar.open_price=bar.close_price=Decimal("98.2");bar.low_price=Decimal("98.1");bar.high_price=Decimal("98.4")
    observation=replace(_observation(stock,bars,60),engine_version="trading-intelligence-v4",entry_timing=EntryTiming.CONTINUATION,preferred_entry_zone_low=98.,preferred_entry_zone_high=98.5,
        invalidation_price=95.,expiry_sessions=5)
    result=simulate_next_session_execution(observation,StockReplayHistory(stock=stock,prices=tuple(bars)),tuple(row.trade_date for row in bars),_config(bars))
    assert (result.status == "FILLED") is filled
    if filled: assert result.execution_date == bar.trade_date


def test_default_v4_zone_attempt_retains_rules_costs_no_trade_invalidation_and_close_benchmark():
    from app.tests.test_phase2_replay import fixture
    from app.modules.backtesting.backtesting_execution import compute_forward_outcome
    original,history,days,config,_=fixture()
    config=replace(config,strategy_version="trading-intelligence-v4",threshold_version="trading-thresholds-v4")
    observation=replace(original,engine_version=config.strategy_version,preferred_entry_zone_low=99.,preferred_entry_zone_high=101.,
        invalidation_price=95.,target_price=110.,expiry_sessions=5)
    run=lambda source=history,cfg=config:simulate_next_session_execution(observation,source,days,cfg)
    assert run().is_filled and run().rules_verified
    assert run(replace(history,execution_rules=())).status == "RULES_UNAVAILABLE"
    costly=run(cfg=replace(config,one_way_cost_bps=100,slippage_multiplier=1))
    assert costly.is_filled and costly.fill_price > costly.raw_price and costly.fill_price <= 101
    assert costly.quantity*costly.fill_price*1.01 <= config.order_value_bdt
    assert run(cfg=replace(config,slippage_multiplier=8)).status == "INVALID_PLAN"
    for bar in history.prices[1:6]: bar.volume=0
    assert not run().is_filled
    for bar in history.prices[1:6]: bar.volume=100000
    history.prices[1].open_price=Decimal(102);history.prices[1].high_price=Decimal(103);history.prices[1].low_price=Decimal(94)
    assert run().status == "AMBIGUOUS_PRE_ENTRY"
    history.prices[1].open_price=Decimal(100);history.prices[1].low_price=Decimal(94)
    # An order executable at the open can stop later that same bar; the dated
    # trade is retained and forward execution resolves its adverse outcome.
    opened=run()
    assert opened.is_filled and opened.fill_timing == "OPEN"
    assert compute_forward_outcome(observation,opened,history,days,(),config,3).exit_reason == "STOP"
    history.prices[1].low_price=Decimal(98);history.prices[1].close_price=Decimal("100.5")
    closed=run(cfg=replace(config,execution_price="close"))
    assert closed.is_filled and closed.fill_timing == "CLOSE" and closed.raw_price == 100.5
    for bar in history.prices[1:6]: bar.close_price=Decimal(102)
    assert not run(cfg=replace(config,execution_price="close")).is_filled


def test_permission_developing_and_hard_blocked_ranking_buckets_are_distinct():
    from app.modules.market_universe.shortlist import entry_sort_key
    def row(symbol,**updates):
        canonical=NS(non_holder_action="WAIT",trade_plan_status="WATCH_ONLY",eligibility_status="ELIGIBLE",opportunity_quality="CONSTRUCTIVE",
            entry_readiness="NOT_READY",primary_reason_code="constructive_watch",blocker_codes=[],opportunity_score=50)
        vars(canonical).update(updates)
        return NS(stock=NS(symbol=symbol,id=symbol),decision=NS(canonical=canonical),analysis=None)
    permitted=row("Z",non_holder_action="BUY",trade_plan_status="VALID_ENTRY_PLAN")
    developing=row("Y")
    blocked=row("A",opportunity_quality="STRONG",trade_plan_status="UNAVAILABLE",primary_reason_code="missing_resistance",blocker_codes=["missing_resistance"])
    market_blocked=row("B",opportunity_quality="STRONG",primary_reason_code="bearish_market_regime")
    assert [entry_sort_key(item)[0] for item in (permitted,developing,blocked,market_blocked)] == [0,1,2,2]
    assert entry_sort_key(permitted) < entry_sort_key(developing) < entry_sort_key(blocked)


def test_operational_window_rejects_duplicate_calendar_metadata_only_and_empty_arms():
    freeze=date(2026,11,14)
    result=operational_readiness([],[],freeze=freeze,calendar=["2026-11-15"]*20)
    assert result["status"] == "NOT_READY"
    assert "AUTHENTICATED_DISTINCT_EXCHANGE_CALENDAR_REQUIRED" in result["failures"]
    captures=[{"generation_id":"old","session_date":"2026-11-15","observed_at":"2026-11-15T10:00:00+00:00","invalidated_at":"withdrawn"},
        {"generation_id":"new","session_date":"2026-11-15","observed_at":"2026-11-15T11:00:00+00:00","input_payload":{"inputs":{"s":{}}},"result_payload":{"rows":[{}]}}]
    selected,excluded=select_capture_vintages(captures)
    assert [row["generation_id"] for row in selected] == ["new"]
    assert excluded[0]["reason"] == "WITHDRAWN"
    malformed=operational_readiness([],[],freeze=freeze,calendar={"sessions":["wrong",{"session_date":"impossible"}]})
    assert malformed["status"] == "NOT_READY"


def test_zero_buy_operational_window_counts_all_twenty_but_retains_unexercised_exceptions():
    from app.tests.test_practicality_closure_repair import operational_window
    captures,runs,args=operational_window()
    calendar=args["calendar"]
    result=operational_readiness(captures,runs,**args)
    assert result["status"] == "NOT_READY"
    assert len(result["expected_first_20_sessions"]) == 20 and not result["missing_capture_sessions"]
    assert result["failures"] == ["EXCEPTIONS_UNEXERCISED_RETAIN_IN_SHADOW"]
    bad_calendar={**calendar,"sessions":[{**calendar["sessions"][0],"authenticated":"false"},*calendar["sessions"][1:]]}
    assert "AUTHENTICATED_DISTINCT_EXCHANGE_CALENDAR_REQUIRED" in operational_readiness(captures,runs,**{**args,"calendar":bad_calendar})["failures"]
    runs[0]["guardrails"]["hard_violations"]=[{"code":"CONTROLLED safety violation"}]
    assert any("SAFETY" in code for code in operational_readiness(captures,runs,**args)["failures"])
    assert any("PAIRED_PROOF_ABSENT" in code for code in operational_readiness(captures,[],**args)["failures"])


def test_discount_crossing_entry_retains_geometry_and_uses_only_the_central_builder_comparison():
    from app.core.enums import OpportunityQuality
    from app.modules.stock_details.decision.trade_plan import compute_trade_plan
    snapshot=replace(_bullish_snapshot(),latest_price=22.3,support=21.8,resistance=22.7,volatility=.5)
    before=compute_trade_plan(snapshot,opportunity_quality=OpportunityQuality.WEAK,preserve_rejected_levels=True)
    after=compute_trade_plan(snapshot,opportunity_quality=OpportunityQuality.WEAK,preserve_rejected_levels=True,target_discount=1.)
    assert before.entry_timing == "READY" and before.reasons == ("invalid_price_ordering",)
    assert before.entry_zone_high == pytest.approx(22.127) and before.target_low < before.entry_zone_high
    assert after.status == "VALID_ENTRY_PLAN" and after.target_low == snapshot.resistance
    assert (before.entry_zone_low,before.entry_zone_high,before.stop_loss) == pytest.approx((after.entry_zone_low,after.entry_zone_high,after.stop_loss))


def test_recorded_account_mark_preserves_values_and_delivered_avoid_without_close_authority():
    import asyncio
    from app.tests.test_portfolios import _item, _price, _service, _universe_with_row
    from app.tests.test_watchlists import _canonical_universe_row
    from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead
    item=_item(quantity=Decimal("10"),buy_price=Decimal("90"));row=_canonical_universe_row(item.stock.id)
    row.decision.non_holder_action=NonHolderAction.AVOID
    row.display_quote=DisplayQuoteRead(current_price=103.,previous_close=101.,price_change=2.,price_change_percent=2.,as_of_trade_date="2026-07-20",observation_status="UNAVAILABLE")
    service,_,_=_service([item],{},universe=_universe_with_row(row))
    recorded=asyncio.run(service.get_workspace(exchange=ExchangeCode.DSE)).holdings[0]
    assert recorded.price_status == PortfolioPriceStatus.FINALIZED
    assert recorded.mark_authority == "RECORDED"
    row.display_quote.observation_status="FINALIZED"
    authenticated=asyncio.run(service.get_workspace(exchange=ExchangeCode.DSE)).holdings[0]
    assert authenticated.price_status == PortfolioPriceStatus.FINALIZED
    assert authenticated.mark_authority == "FINALIZED"
    for field in ("current_price","current_value","invested_amount","unrealized_gain_amount","estimated_daily_change_amount"):
        assert getattr(recorded,field) == getattr(authenticated,field)
    assert recorded.non_holder_action == "AVOID"


def test_source_table_export_adapter_can_exercise_real_engine_plan_with_bound_controlled_clocks():
    import json
    from pathlib import Path
    from app.modules.trading_intelligence.input_capture import restore_strategy_input
    from app.modules.trading_intelligence.practicality_entry_evidence import assess_bound_entry, evidence_for
    from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead
    fixture=json.loads((Path(__file__).parent/"fixtures/practicality_bsr_capture.json").read_text())
    value=restore_strategy_input(fixture["input"])
    value=replace(value,strategy_version="trading-intelligence-v4-shadow-market", market_regime=MarketRegimeResult(
        50,"NEUTRAL",MarketRegimePhase.HEALTHY,100,"CONTROLLED complete market context","CAUTION",value.as_of_date,True))
    bundle=compute_trader_decision(value)
    assert bundle.canonical_result.non_holder_action == "BUY"
    price=(bundle.trade_plan.entry_zone_low+bundle.trade_plan.entry_zone_high)/2
    stock_id=str(value.stock_id);now="2026-11-15T05:00:00+00:00"
    quote={"id":"controlled-price", "stock_id":stock_id,"trade_date":"2026-11-15", "open_price":price,"high_price":price+.1,
        "low_price":price-.1,"close_price":price,"volume":1000,"data_quality_flag":"OK","source":"CONTROLLED_SOURCE",
        "updated_at":now,"source_observed_at":now,"batch_fetched_at":now}
    capture={"generation_id":fixture["generation_id"],"observed_at":fixture["observed_at"],"exchange":"DSE",
        "input_payload":{"inputs":{stock_id:fixture["input"]},"universe_membership":[stock_id],"excluded_members":[],
            "membership_provenance":{"status":"OBSERVED_INDEPENDENT_LISTED_SET","observed_at":fixture["observed_at"],"listed_count":1,"market_coverage_verified":True}},
        "result_payload":{"rows":[fixture["row"]]}}
    export={"exported_at":now,"market_schedule":{"source_revision":"CONTROLLED_SETTINGS","market_open_time":"10:00","market_close_time":"15:00","market_snapshot_interval_minutes":15},
        "market_generations":[{"id":"controlled-generation","exchange":"DSE","state":"LIVE","accepted_count":1,"trade_date":"2026-11-15","sync_id":"controlled-quote",
            "published_at":now,"source_last_synced_at":now}],"quote_prices":[quote],
        "price_observations":[{"id":"controlled-insert","operation":"INSERT","source_row_id":quote["id"],"session_date":quote["trade_date"],"observed_at":now,"payload":quote,"previous_payload":None}],
        "source_coverage":{key:{"complete":True,"range_start":"2026-11-13T16:00:00+00:00"} for key in ("quote_prices","price_observations","market_generations","price_publication_observations")}}
    for table in ("corporate_actions","dividend_events"):
        export[table]=[]
        export["source_coverage"][table]={"complete":True,"source_revision":"CONTROLLED-BASIS-EMPTY-"+table,"stock_ids":[stock_id],
            "range_start":"2026-11-12","range_end":"2026-11-15","known_at":now}
    fallback=DisplayQuoteRead(current_price=price,observation_status="UNAVAILABLE")
    quote_dto,result,bound=assess_bound_entry(capture=capture,export=export,value=value,bundle=bundle,fallback_quote=fallback)
    assert bound and result.status == "APPLICABLE" and result.price_basis == "CURRENT"
    export["source_coverage"]["price_publication_observations"]["complete"]=False
    export.pop("_derived_entry_evidence",None)
    _,result,_=assess_bound_entry(capture=capture,export=export,value=value,bundle=bundle,fallback_quote=fallback)
    assert result.status == "UNVERIFIED"
    export["source_coverage"]["price_publication_observations"]["complete"]=True
    quote["source_observed_at"]=None
    export.pop("_derived_entry_evidence",None)
    _,result,_=assess_bound_entry(capture=capture,export=export,value=value,bundle=bundle,fallback_quote=fallback)
    assert result.status == "UNVERIFIED"
    quote["source_observed_at"]=now;quote["volume"]=0
    export.pop("_derived_entry_evidence",None)
    _,result,_=assess_bound_entry(capture=capture,export=export,value=value,bundle=bundle,fallback_quote=fallback)
    assert result.status == "UNVERIFIED"
    # The same real engine plan remains invalid after an authenticated published
    # Sunday breach, even though Monday's controlled current quote recovers.
    quote["volume"]=1000
    prior={**quote,"id":"controlled-prior","low_price":bundle.trade_plan.stop_loss-.1,
        "source_observed_at":"2026-11-15T09:00:00+00:00","batch_fetched_at":"2026-11-15T09:00:00+00:00","updated_at":"2026-11-15T09:00:00+00:00"}
    quote.update(trade_date="2026-11-16",source_observed_at="2026-11-16T05:00:00+00:00",batch_fetched_at="2026-11-16T05:00:00+00:00",updated_at="2026-11-16T05:00:00+00:00")
    export["exported_at"]=quote["updated_at"]
    for table in ("corporate_actions","dividend_events"):
        export["source_coverage"][table].update(range_end="2026-11-16",known_at=quote["updated_at"])
    export["corporate_actions"]=[{"stock_id":stock_id,"action_subtype":"BONUS","effective_date":"2026-11-16","known_at":quote["updated_at"]}]
    export["market_generations"][0].update(trade_date=quote["trade_date"],published_at=quote["updated_at"],source_last_synced_at=quote["updated_at"])
    export["market_generations"].append({"id":"prior-manifest","exchange":"DSE","state":"FINALIZED","accepted_count":1,"trade_date":"2026-11-15","sync_id":"prior-quote","published_at":prior["updated_at"],"source_last_synced_at":prior["updated_at"]})
    export["price_publication_observations"]=[{"id":"prior-publication","source_row_id":"prior-manifest","operation":"PUBLISH","finality":"FINALIZED","observed_at":prior["updated_at"],"payload":{
        "contract":"PRICE_VERSION_MEMBERSHIP_V1","manifest_id":"prior-manifest","exchange":"DSE","sync_id":"prior-quote","trade_date":"2026-11-15","source_last_synced_at":prior["updated_at"],"price_versions":[prior]}}]
    export["quote_prices"]=[prior,quote]
    export["price_observations"]=[{"id":"insert-"+row["id"],"operation":"INSERT","source_row_id":row["id"],"session_date":row["trade_date"],"observed_at":row["updated_at"],"payload":row,"previous_payload":None} for row in [prior,quote]]
    export.pop("_derived_entry_evidence",None)
    _,result,_=assess_bound_entry(capture=capture,export=export,value=value,bundle=bundle,fallback_quote=fallback)
    assert result.status == "INVALIDATED" and result.reason_code == "STOP_BREACHED"
    quote["source_observed_at"]=now;quote["volume"]=0
    export.pop("_derived_entry_evidence",None)
    _,result,_=assess_bound_entry(capture=capture,export=export,value=value,bundle=bundle,fallback_quote=fallback)
    assert result.status == "INVALIDATED"
