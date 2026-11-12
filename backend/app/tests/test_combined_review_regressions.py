import json
from dataclasses import replace, asdict
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from sqlalchemy import event, select, func

from app.core.audit_hashing import canonicalize_audit_value, stable_audit_hash
from app.core.core_config import Settings
from app.core.enums import ExchangeCode
from app.models import DecisionGenerationCapture, TradingShadowOutcome, DailyPrice, Stock, DailyMarketSummary
from app.jobs.market_cache_rebuild import _rebuild_current_universe
from app.modules.market_universe.market_universe_service import MarketUniverseService
from app.modules.trading_intelligence.decision_snapshot_repository import DecisionSnapshotRepository
from app.modules.backtesting.backtesting_shadow import capture_dataset, mature_shadow_outcomes, shadow_progress
from app.modules.backtesting.backtesting_shadow_assessment import assess_shadow_receipts
from app.modules.backtesting.backtesting_shadow_repository import TradingShadowRepository
from app.modules.backtesting.backtesting_models import BacktestDataset, BacktestConfig, ForwardOutcome, ExecutionResult, StockReplayHistory
from app.modules.backtesting.backtesting_evaluation import portfolio_ledger, observation_key
from app.modules.backtesting.backtesting_challengers import enrich_features
from app.modules.trading_intelligence.input_capture import restore_strategy_input
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.stock_details.decision.entry_applicability import build_entry_path_facts
from app.modules.market_dashboard.market_snapshot import DashboardMarketSnapshot, DashboardSnapshotRow, dated_breadth_changes
from app.modules.market_dashboard.market_dashboard_compute import derive_market_breadth_from_snapshot
from app.modules.market_data.breadth import breadth_facts
from app.modules.backtesting.backtesting_archive import dataset_archive
from app.modules.backtesting.backtesting_availability import capture_availability
from app.tests.test_run2_review_regressions import receipt_session, engineering_selection
from app.tests.test_trading_shadow_receipts import empty_eligible_capture
from app.tests.test_canonical_generation_architecture import _canonical_fixture
from app.tests.test_phase2_replay import fixture
from app.tests.test_entry_applicability import terms, assess
from app.tests.test_capture_replay_boundaries import captured_fixture
from app.tests.test_backtesting_replay import _prices, _stock


@pytest.mark.asyncio
async def test_shadow_sql_read_then_failure_does_not_expire_cached_durable_winner(receipt_session, monkeypatch):
    _, _, row, snapshot = _canonical_fixture()
    durable = snapshot.payload.model_dump(mode="json")
    durable["durable_marker"] = "committed-first-winner"
    repository = DecisionSnapshotRepository(receipt_session)
    await repository.publish_generation(exchange=ExchangeCode.DSE,generation_id=snapshot.generation.sync_id,
        session_date=snapshot.generation.trade_date,inputs={},payload=durable)
    async def fail_after_read(session, winner, settings):
        await session.scalar(select(DecisionGenerationCapture.id).where(DecisionGenerationCapture.id == winner.id))
        raise RuntimeError("optional shadow failure after SQL")
    monkeypatch.setattr("app.modules.backtesting.backtesting_shadow.publish_shadow_receipts",fail_after_read)
    redis = SimpleNamespace(set_json=AsyncMock(return_value=True))
    service = MarketUniverseService(object(),object(),redis,Settings(),repository)
    service._input_captures = {str(row.stock.id):{"unused":"candidate"}}
    service.is_input_generation_current = AsyncMock(return_value=True)
    service.resolve_quote_context = AsyncMock(return_value=snapshot.generation)
    assert await service.cache_scored_universe(ExchangeCode.DSE,[row],generation=snapshot.generation)
    assert redis.set_json.call_args.args[1] == durable
    winner = await repository.get_replay_publication(exchange=ExchangeCode.DSE,generation_id=snapshot.generation.sync_id)
    assert winner.result_payload == durable


@pytest.mark.parametrize("finalized",[False,True])
def test_provisional_low_is_retained_but_only_finalized_close_confirms_breakout(finalized):
    reference = date(2026,11,8); confirmation=reference+timedelta(days=1); today=confirmation+timedelta(days=1)
    published=datetime(2026,11,8,10,tzinfo=UTC)
    plan=terms(entry_timing="BREAKOUT",trigger_price=100)
    prices=[SimpleNamespace(trade_date=day,open_price=100,high_price=102,low_price=99,close_price=101,
        volume=150,data_quality_flag="OK") for day in (confirmation,today)]
    path=build_entry_path_facts(prices=prices,revisions=[],sessions=(confirmation,today),
        completed_sessions={confirmation} if finalized else set(),ended_sessions={confirmation},reference_date=reference,
        published_at=published,journal_started_at=published-timedelta(days=1),plan=plan,average_volume=100)
    now=datetime(2026,11,10,5,tzinfo=UTC)
    quote=SimpleNamespace(current_price=100,as_of_trade_date=today.isoformat(),observation_status="PROVISIONAL",data_quality="OK",source_observed_at=now)
    result=assess(plan=plan,path=path,now=now,reference_date=reference,quote=quote)
    assert result.reason_code == ("ENTRY_TERMS_MET" if finalized else "COMPLETED_BREAKOUT_REQUIRED")
    prices[0].low_price=95
    breached=build_entry_path_facts(prices=prices,revisions=[],sessions=(confirmation,today),completed_sessions=set(),
        ended_sessions={confirmation},reference_date=reference,published_at=published,journal_started_at=published-timedelta(days=1),plan=plan,average_volume=100)
    assert assess(plan=plan,path=breached,now=now,reference_date=reference,quote=quote).reason_code == "STOP_BREACHED"
    expired=replace(path,sessions=(confirmation,),ended_sessions=frozenset({confirmation}))
    assert assess(plan=terms(expiry_sessions=1),path=expired,now=now,reference_date=reference,quote=quote).reason_code == "PLAN_EXPIRED"


@pytest.mark.asyncio
@pytest.mark.parametrize("late",[False,True])
async def test_background_warm_cache_repairs_missing_receipt_with_actual_retry_time(receipt_session,monkeypatch,late):
    capture=empty_eligible_capture()
    shifted=datetime.now(UTC).date()-capture.session_date
    capture.session_date += shifted
    for raw in capture.input_payload["inputs"].values():
        raw["reference_date"]=capture.session_date.isoformat()
        raw["exchange_session_dates"]=[(date.fromisoformat(day)+shifted).isoformat() for day in raw["exchange_session_dates"]]
        for price in raw["prices"]:price["trade_date"]=(date.fromisoformat(price["trade_date"])+shifted).isoformat()
        for source in raw["source_observations"]:source["session"]=(date.fromisoformat(source["session"])+shifted).isoformat()
    publication=datetime.combine(capture.session_date,datetime.min.time(),tzinfo=UTC).replace(hour=10)
    capture.observed_at=publication
    capture.input_payload["membership_provenance"]["observed_at"]=publication.isoformat()
    for raw in capture.input_payload["inputs"].values():
        raw["calculated_at"]=(publication-timedelta(minutes=1)).isoformat()
        for source in raw["source_observations"]:
            source["observed_at"]=(publication-timedelta(minutes=2)).isoformat()
        bundle=compute_trader_decision(restore_strategy_input(raw))
        result=bundle.canonical_result
        canonical=capture.result_payload["rows"][0]["decision"]["canonical"]
        for key in ("input_hash","shared_decision_id","display_action","eligibility_status","entry_readiness"):
            canonical[key]=getattr(result,key)
    receipt_session.add(DecisionGenerationCapture(id=capture.id,generation_id=capture.generation_id,exchange=capture.exchange,
        session_date=capture.session_date,observed_at=capture.observed_at,input_payload=canonicalize_audit_value(capture.input_payload),
        result_payload=canonicalize_audit_value(capture.result_payload)))
    await receipt_session.commit()
    dataset=capture_dataset(capture); next_day=capture.session_date+timedelta(days=1)
    dataset=replace(dataset,session_dates=(*dataset.session_dates,next_day))
    monkeypatch.setattr("app.modules.backtesting.backtesting_repository.BacktestingRepository.load_dataset",AsyncMock(return_value=dataset))
    opening=datetime.combine(next_day,datetime.min.time(),tzinfo=UTC).replace(hour=4)
    retry=opening+(timedelta(minutes=1) if late else -timedelta(minutes=1))
    class RetryClock(datetime):
        @classmethod
        def now(cls,tz=None):return retry
    monkeypatch.setattr("app.modules.backtesting.backtesting_shadow.datetime",RetryClock)
    generation=SimpleNamespace(sync_id=capture.generation_id,trade_date=capture.session_date)
    service=MarketUniverseService(object(),object(),object(),Settings(),DecisionSnapshotRepository(receipt_session))
    service.resolve_generation_context=AsyncMock(return_value=generation)
    service.has_cached_generation=AsyncMock(return_value=True)
    service.promote_cached_generation=AsyncMock(return_value=True)
    service.is_input_generation_current=AsyncMock(return_value=True)
    service.recompute_scored_universe=AsyncMock(side_effect=AssertionError("Warm retry must not recompute"))
    original=TradingShadowRepository.available
    monkeypatch.setattr(TradingShadowRepository,"available",AsyncMock(return_value=False))
    assert await _rebuild_current_universe(service,exchange=capture.exchange)=="universe-current"
    monkeypatch.setattr(TradingShadowRepository,"available",original)
    assert await _rebuild_current_universe(service,exchange=capture.exchange)=="universe-current"
    repository=TradingShadowRepository(receipt_session)
    selections=await repository.selections(exchange=capture.exchange)
    assert len(selections)==1 and selections[0].selected_at==retry
    selected_id,stamp=selections[0].id,selections[0].selected_at
    assert (await shadow_progress(receipt_session,exchange=capture.exchange))["eligible_cohort_dates"] == (0 if late else 1)
    retry += timedelta(hours=1)
    await _rebuild_current_universe(service,exchange=capture.exchange)
    selections=await repository.selections(exchange=capture.exchange)
    assert len(selections)==1 and (selections[0].id,selections[0].selected_at)==(selected_id,stamp)


def test_dated_breadth_does_not_assign_yesterdays_decline_to_today():
    today=date(2026,11,11)
    rows=[DashboardSnapshotRow(Stock(id=uuid4()),SimpleNamespace(trade_date=day),SimpleNamespace(price_change_percent=change))
        for day,change in ((today,1),(today-timedelta(days=1),-1))]
    facts=breadth_facts(dated_breadth_changes(rows,today),cohort="ACTIVE_VALID_OHLC",as_of_date=today)
    assert (facts.known_count,facts.unknown_count,facts.declining,facts.advancing)==(1,1,0,1)
    assert derive_market_breadth_from_snapshot(rows,today)==(1,0,0,1)


@pytest.mark.asyncio
@pytest.mark.parametrize("finalized",[False,True])
async def test_public_entry_projection_keeps_live_only_close_out_of_confirmation(monkeypatch,finalized):
    stock,_,row,snapshot=_canonical_fixture();reference=snapshot.generation.trade_date
    confirmation=reference+timedelta(days=1);today=confirmation+timedelta(days=1)
    now=datetime.combine(today,datetime.min.time(),tzinfo=UTC).replace(hour=5)
    class Clock(datetime):
        @classmethod
        def now(cls,tz=None):return now.astimezone(tz) if tz else now
    monkeypatch.setattr("app.modules.market_universe.market_universe_service.datetime",Clock)
    plan=row.analysis.trade_plan.model_copy(update=vars(terms(entry_timing="BREAKOUT",trigger_price=100)))
    row=row.model_copy(update={"analysis":row.analysis.model_copy(update={"trade_plan":plan}),
        "decision":row.decision.model_copy(update={"display_action":"POTENTIAL_BUY"}),
        "eligibility":row.eligibility.model_copy(update={"status":"ELIGIBLE"}),
        "technical_snapshot":row.technical_snapshot.model_copy(update={"average_volume":100})})
    published=datetime.combine(reference,datetime.min.time(),tzinfo=UTC).replace(hour=9)
    prices=[SimpleNamespace(stock_id=stock.id,trade_date=day,open_price=100,high_price=102,low_price=99,close_price=101,
        volume=150,data_quality_flag="OK") for day in (confirmation,today)]
    market=SimpleNamespace(list_recent_exchange_session_dates=AsyncMock(return_value=[reference,confirmation] if finalized else [reference]),
        list_observed_exchange_session_dates=AsyncMock(return_value=[confirmation,today]),
        list_entry_path_observations=AsyncMock(return_value=(prices,[],published-timedelta(days=1))),
        list_entry_basis_events=AsyncMock(return_value={}))
    quote=SimpleNamespace(current_price=100,as_of_trade_date=today.isoformat(),observation_status="PROVISIONAL",data_quality="OK",source_observed_at=now)
    publication=SimpleNamespace(observed_at=published,session_date=reference,invalidated_at=None,generation_id=snapshot.generation.sync_id)
    durable=SimpleNamespace(latest_publication=AsyncMock(return_value=publication),publication_coverage=AsyncMock(return_value={
        "universe_membership":[str(stock.id)],"input_keys":[str(stock.id)],"excluded_members":[],
        "membership_provenance":{"status":"OBSERVED_INDEPENDENT_LISTED_SET","observed_at":published.isoformat(),"listed_count":1,"market_coverage_verified":True}}))
    service=MarketUniverseService(market,object(),object(),Settings(),durable)
    service.resolve_generation_context=AsyncMock(return_value=snapshot.generation)
    quote_generation=replace(snapshot.generation,trade_date=today,sync_id="LIVE")
    service.resolve_quote_context=AsyncMock(return_value=quote_generation)
    service.get_display_quotes=AsyncMock(return_value={stock.id:quote})
    snapshot=replace(snapshot,payload=snapshot.payload.model_copy(update={"rows":[row]}))
    projected=await service.project_current_entries(snapshot,exchange=stock.exchange)
    assert projected.rows[0].entry_applicability.reason_code==("ENTRY_TERMS_MET" if finalized else "COMPLETED_BREAKOUT_REQUIRED")


@pytest.mark.asyncio
async def test_missing_selected_and_unselected_histories_reach_unsupported_formal_result(receipt_session):
    row,history,initial,config,_=fixture();days=tuple(initial[0]+timedelta(days=i) for i in range(140))
    config=replace(config,horizons=(10,)); unknown=replace(row,stock_id=uuid4(),symbol="UNSELECTED")
    for day in days[:120]:
        _,selection=engineering_selection(receipt_session,day,config,(replace(row,as_of_date=day),))
        selection.payload["universe"].append(canonicalize_audit_value(asdict(replace(unknown,as_of_date=day))))
    await receipt_session.commit();dataset=BacktestDataset((),days)
    values=await mature_shadow_outcomes(receipt_session,dataset,config)
    assert all(len(value["universe_markouts"])==2 for value in values)
    assert all(value["entry_arms"]["baseline"][0]["status"]=="NO_STOCK_HISTORY" for value in values)
    result=await assess_shadow_receipts(receipt_session,dataset,exchange=config.exchange)
    assert result["status"]=="ASSESSED_AT_FROZEN_ENDPOINT" and result["ranking"]["status"]=="UNSUPPORTED"
    assert "MISSING_INSTRUMENT_HISTORY" in result["ranking"]["reasons"]
    assert result["entry"]["selection_denominator"]==120


@pytest.mark.parametrize("unresolved",[False,True])
def test_uncertain_exit_preserves_first_fill_but_not_dependent_acceptance(unresolved):
    row,history,days,config,dataset=fixture()
    first=row; overlapping=replace(row,as_of_date=days[1]); later=replace(row,as_of_date=days[5])
    choices=(first,overlapping,later)
    executions={observation_key(value):ExecutionResult("FILLED",execution_date=days[1 if index==0 else 2 if index==1 else 6],
        fill_price=100,quantity=10) for index,value in enumerate(choices)}
    outcomes={observation_key(value):ForwardOutcome(value.stock_id,value.as_of_date,3,"AVAILABLE","FILLED",outcome_end_date=days[4 if index<2 else 9],exit_price=100)
        for index,value in enumerate(choices)}
    if unresolved:
        history=replace(history,corporate_action_dates=frozenset({days[3]}))
        dataset=replace(dataset,histories=(history,))
        outcomes[observation_key(first)]=replace(outcomes[observation_key(first)],status="CORPORATE_ACTION_UNRESOLVED",outcome_end_date=None)
    portfolio=portfolio_ledger(choices,executions,outcomes,dataset,config)
    evidence=portfolio["acceptance_by_key"]
    assert evidence[f"{first.stock_id}:{first.as_of_date}"] is True
    assert evidence[f"{overlapping.stock_id}:{overlapping.as_of_date}"] is False
    assert evidence[f"{later.stock_id}:{later.as_of_date}"] is (None if unresolved else True)


@pytest.mark.parametrize("rejected_exit", ["AVAILABLE", "INSUFFICIENT_HORIZON"])
def test_never_held_overlapping_order_cannot_taint_later_independent_fill(rejected_exit):
    row, _, days, config, dataset = fixture()
    choices = (row, replace(row, as_of_date=days[1]), replace(row, as_of_date=days[5]))
    executions = {observation_key(value): ExecutionResult("FILLED", execution_date=days[day],
        fill_price=100, quantity=10) for value, day in zip(choices, (1, 2, 6))}
    outcomes = {observation_key(value): ForwardOutcome(value.stock_id, value.as_of_date, 3,
        "AVAILABLE", "FILLED", outcome_end_date=days[day], exit_price=100)
        for value, day in zip(choices, (4, 4, 9))}
    if rejected_exit != "AVAILABLE":
        key = observation_key(choices[1])
        outcomes[key] = replace(outcomes[key], status=rejected_exit, outcome_end_date=None)
    portfolio = portfolio_ledger(choices, executions, outcomes, dataset, config)
    assert [portfolio["acceptance_by_key"][f"{value.stock_id}:{value.as_of_date}"] for value in choices] == [True, False, True]
    assert portfolio["status"] == "AVAILABLE"
    assert portfolio["accepted_fill_count"] == portfolio["verified_accepted_fill_count"] == 2
    assert portfolio["portfolio_rejection_counts"] == {"ALREADY_HELD": 1}


@pytest.mark.parametrize("kind",["known_split","date_only","late_event","unknown_coverage","clean","estimated_turnover"])
def test_raw_feature_windows_require_known_clean_basis_without_future_event_leak(kind):
    stock=_stock();prices=_prices(stock,30)
    for bar in prices:
        bar.trade_count=100
        bar.turnover_provenance="REPORTED"
    if kind=="estimated_turnover":prices[-1].turnover_provenance="ESTIMATED"
    days=tuple(bar.trade_date for bar in prices);stamp=datetime.combine(days[-1],datetime.min.time(),tzinfo=UTC).replace(hour=10)
    base,_,_,_,_=fixture();row=replace(base,stock_id=stock.id,as_of_date=days[-1],selection_at=stamp)
    effective=days[-10];events=();dates=frozenset()
    if kind in {"known_split","late_event"}:
        known=stamp+timedelta(hours=1) if kind=="late_event" else stamp-timedelta(days=20)
        events=({"kind":"SPLIT","effective_date":effective.isoformat(),"known_at":known.isoformat()},)
        dates=frozenset({effective})
    elif kind=="date_only":dates=frozenset({effective})
    history=StockReplayHistory(stock,tuple(prices),corporate_action_dates=dates,event_observations=events,
        event_coverage_verified=kind!="unknown_coverage")
    result=enrich_features((row,),BacktestDataset((history,),days),BacktestConfig(stock.exchange,days[-1],days[-1]))
    value=dict(result[0].research_features)["followthrough_exhaustion"]
    assert (value is not None)==(kind in {"clean","late_event","estimated_turnover"})
    assert dict(result[0].research_features)["turnover_trades"]==(None if kind=="estimated_turnover" else 0)


def test_forward_capture_adapter_carries_known_at_event_facts():
    capture=empty_eligible_capture();raw=next(iter(capture.input_payload["inputs"].values()))
    raw["known_corporate_action_dates"]=[capture.session_date.isoformat()]
    raw["event_observations"]=[{"kind":"SPLIT","effective_date":capture.session_date.isoformat(),"known_at":capture.observed_at.isoformat()}]
    history=capture_dataset(capture).histories[0]
    assert history.corporate_action_dates==frozenset({capture.session_date}) and history.event_observations[0]["kind"]=="SPLIT"


@pytest.mark.asyncio
async def test_cli_uses_worker_opening_overrides_and_archives_explicit_override(tmp_path,monkeypatch):
    from app.scripts.run_trading_backtest import _parse_args,_run
    _,capture,dataset,config=captured_fixture()
    next_day=dataset.session_dates[-1]
    stamp=datetime.combine(next_day,datetime.min.time(),tzinfo=UTC).replace(hour=3,minute=30)
    capture["observed_at"]=stamp.isoformat();dataset.publications[0]["observed_at"]=stamp.isoformat()
    settings=Settings(market_session_open_overrides={next_day.isoformat():"09:00"})
    monkeypatch.setattr("app.core.core_config.get_settings",lambda:settings)
    archive=tmp_path/"inputs.json";archive.write_text(json.dumps(dataset_archive(dataset)),encoding="utf8")
    output=tmp_path/"report.json"
    args=["--start",str(config.start_date),"--end",str(config.end_date),"--replay-mode","captured","--horizons","10",
        "--no-sensitivities","--dataset-input",str(archive),"--output",str(output)]
    assert await _run(_parse_args(args))==0
    report=json.loads(output.read_text());assert report["observation_count"]==0
    assert report["config"]["session_open_overrides"]==[[next_day.isoformat(),"09:00"]]
    assert capture_availability(capture,config.start_date,dataset.session_dates,replace(config,session_open_overrides=tuple(settings.market_session_open_overrides.items())))[0]=="LATE_CAPTURED"
    explicit=tmp_path/"openings.json";explicit.write_text(json.dumps({next_day.isoformat():"11:00"}))
    assert await _run(_parse_args(args+["--session-open-overrides",str(explicit)]))==0
    report=json.loads(output.read_text());assert report["observation_count"]==1
    assert report["config"]["session_open_overrides"]==[[next_day.isoformat(),"11:00"]]


@pytest.mark.asyncio
async def test_latest_outcome_query_returns_only_sql_heads_including_withdrawn_head(receipt_session):
    _,_,days,config,_=fixture();_,selection=engineering_selection(receipt_session,days[0],config)
    await receipt_session.commit();stamp=datetime.now(UTC)
    for value in range(1,5):
        receipt_session.add(TradingShadowOutcome(id=UUID(int=value),selection_id=selection.id,through_date=days[4],
            outcome_revision=str(value),recorded_at=stamp,payload={"kind":"MODELED_OUTCOMES","vintage":value},
            invalidated_at=stamp if value==4 else None))
    await receipt_session.commit();queries=[]
    def observe(connection,cursor,statement,parameters,context,many):queries.append(statement)
    event.listen(receipt_session.bind.sync_engine,"before_cursor_execute",observe)
    try:latest=await TradingShadowRepository(receipt_session).latest_outcomes([selection.id])
    finally:event.remove(receipt_session.bind.sync_engine,"before_cursor_execute",observe)
    assert len(latest)==1 and latest[selection.id].payload["vintage"]==4 and latest[selection.id].invalidated_at
    assert any("row_number() OVER" in query and "rank" in query for query in queries)
    summary=await TradingShadowRepository(receipt_session).latest_outcomes([selection.id],summary_only=True)
    assert summary[selection.id].id==latest[selection.id].id and "portfolios" not in summary[selection.id].payload
    assert "universe_markouts" not in summary[selection.id].payload


@pytest.mark.asyncio
async def test_mature_unchanged_receipts_reuse_payloads_and_one_portfolio_snapshot(receipt_session,monkeypatch):
    row,history,initial,config,_=fixture();days=tuple(initial[0]+timedelta(days=i) for i in range(35))
    prices=tuple(DailyPrice(stock_id=history.stock.id,trade_date=day,open_price=100,high_price=102,low_price=98,
        close_price=100,volume=100000,turnover=10000000,source="ENGINEERING",data_quality_flag=history.prices[0].data_quality_flag) for day in days)
    history=replace(history,prices=prices,execution_rules=(replace(history.execution_rules[0],effective_to=days[-1]),))
    config=replace(config,horizons=(10,))
    for day in days[:3]:engineering_selection(receipt_session,day,config,(replace(row,as_of_date=day),))
    await receipt_session.commit();dataset=BacktestDataset((history,),days)
    first=await mature_shadow_outcomes(receipt_session,dataset,config)
    assert sum(bool(value["portfolios"]) for value in first)==1
    count=await receipt_session.scalar(select(func.count()).select_from(TradingShadowOutcome))
    selections=await TradingShadowRepository(receipt_session).selections(exchange=config.exchange)
    original=await TradingShadowRepository(receipt_session).latest_outcomes([value.id for value in selections])
    from app.modules.backtesting.backtesting_shadow import compute_selection_markout
    monkeypatch.setattr("app.modules.backtesting.backtesting_shadow.compute_selection_markout",lambda *a,**k:(_ for _ in ()).throw(AssertionError("Mature unchanged label recomputed")))
    await mature_shadow_outcomes(receipt_session,replace(dataset,session_dates=(*days,days[-1]+timedelta(days=1))),config)
    assert await receipt_session.scalar(select(func.count()).select_from(TradingShadowOutcome))==count
    latest=await TradingShadowRepository(receipt_session).latest_outcomes([value.id for value in selections])
    assert {key:value.id for key,value in latest.items()}=={key:value.id for key,value in original.items()}
    monkeypatch.setattr("app.modules.backtesting.backtesting_shadow.compute_selection_markout",compute_selection_markout)
    history.prices[8].close_price=101
    await mature_shadow_outcomes(receipt_session,dataset,config)
    corrected=await TradingShadowRepository(receipt_session).latest_outcomes([value.id for value in selections])
    assert any(corrected[key].id!=original[key].id for key in original)
    assert len(await TradingShadowRepository(receipt_session).outcome_vintages([value.id for value in original.values()]))==3
    head=corrected[selections[0].id];head.invalidated_at=datetime.now(UTC)
    await receipt_session.commit()
    count=await receipt_session.scalar(select(func.count()).select_from(TradingShadowOutcome))
    await mature_shadow_outcomes(receipt_session,dataset,config)
    assert await receipt_session.scalar(select(func.count()).select_from(TradingShadowOutcome))==count
    assert (await shadow_progress(receipt_session,exchange=config.exchange))["eligible_cohort_dates"]==2


@pytest.mark.asyncio
@pytest.mark.parametrize("legacy_metadata",[False,True])
async def test_delayed_exit_receipt_dates_cover_facts_and_reuse_history(receipt_session,monkeypatch,legacy_metadata):
    from copy import deepcopy
    row,history,initial,config,_=fixture()
    days=tuple(initial[0]+timedelta(days=i) for i in range(25))
    prices=tuple(DailyPrice(stock_id=history.stock.id,trade_date=day,
        open_price=104 if 1<=index<=3 else 100,high_price=105 if 1<=index<=3 else 102,
        low_price=102 if 1<=index<=3 else 99,close_price=104 if 1<=index<=3 else 100,
        volume=100000,turnover=10000000,source="ENGINEERING",data_quality_flag=history.prices[0].data_quality_flag)
        for index,day in enumerate(days))
    rule=history.execution_rules[0]
    history=replace(history,prices=prices,execution_rules=(replace(rule,effective_to=days[13]),replace(rule,effective_from=days[18],effective_to=days[-1])))
    row=replace(row,entry_timing="PULLBACK",expiry_sessions=4,preferred_entry_zone_low=99,
        preferred_entry_zone_high=101,invalidation_price=96,target_price=200)
    config=replace(config,horizons=(10,))
    _,selection=engineering_selection(receipt_session,days[0],config,(row,))
    await receipt_session.commit()
    dataset=BacktestDataset((history,),days)
    # The Jan15 horizon cannot exit until Jan19; Jan18 evaluation must remain bounded.
    pending=(await mature_shadow_outcomes(receipt_session,replace(dataset,session_dates=days[:18]),config))[0]
    assert pending["through_date"]==days[17].isoformat() and pending["mature"] is False
    assert pending["entry_arms"]["baseline"][0]["status"]=="EXIT_BLOCKED"
    repository=TradingShadowRepository(receipt_session)
    pending_head=(await repository.latest_outcomes([selection.id]))[selection.id]
    original_store=TradingShadowRepository.record_outcome
    if legacy_metadata:
        async def store_legacy(repository,selection,*,through_date,revision,payload):
            legacy=deepcopy(payload);legacy["through_date"]=days[17].isoformat()
            return await original_store(repository,selection,through_date=days[17],revision=stable_audit_hash(legacy),payload=legacy)
        monkeypatch.setattr(TradingShadowRepository,"record_outcome",store_legacy)
    evaluated=replace(dataset,session_dates=days[:19])
    available=(await mature_shadow_outcomes(receipt_session,evaluated,config))[0]
    assert available["through_date"]==days[18].isoformat() and available["mature"] is True
    assert all(value[0]["outcome_end_date"]==days[18].isoformat() for value in available["entry_arms"].values())
    assert all(value[0]["execution"]["execution_date"]==days[4].isoformat() for value in available["entry_arms"].values())
    monkeypatch.setattr(TradingShadowRepository,"record_outcome",original_store)
    previous=(await repository.latest_outcomes([selection.id]))[selection.id]
    legacy_id=previous.id
    if legacy_metadata:
        assert previous.through_date==days[17]
        upgraded=(await mature_shadow_outcomes(receipt_session,evaluated,config))[0]
        assert upgraded["through_date"]==days[18].isoformat()
    head=(await repository.latest_outcomes([selection.id]))[selection.id]
    assert head.through_date==days[18] and head.through_date<=evaluated.session_dates[-1]
    assert len(await repository.outcome_vintages([pending_head.id,legacy_id]))==(2 if pending_head.id!=legacy_id else 1)
    count=await receipt_session.scalar(select(func.count()).select_from(TradingShadowOutcome))
    def unchanged(*args,**kwargs):raise AssertionError("Mature delayed-exit evidence must be reused")
    monkeypatch.setattr("app.modules.backtesting.backtesting_shadow.compute_selection_markout",unchanged)
    monkeypatch.setattr("app.modules.backtesting.backtesting_shadow.simulate_next_session_execution",unchanged)
    reused=(await mature_shadow_outcomes(receipt_session,dataset,config))[0]
    assert reused["through_date"]==days[18].isoformat()
    assert await receipt_session.scalar(select(func.count()).select_from(TradingShadowOutcome))==count
    assert (await repository.latest_outcomes([selection.id]))[selection.id].id==head.id


@pytest.mark.asyncio
@pytest.mark.parametrize("rejected_exit", ["AVAILABLE", "INSUFFICIENT_HORIZON"])
async def test_public_maturation_counts_later_fill_after_never_held_rejection(receipt_session, monkeypatch, rejected_exit):
    from app.modules.backtesting.backtesting_shadow import compute_forward_outcome
    row, history, initial, config, _ = fixture()
    days = tuple(initial[0] + timedelta(days=i) for i in range(35))
    history = replace(history, prices=tuple(DailyPrice(stock_id=history.stock.id, trade_date=day,
        open_price=100, high_price=102, low_price=99, close_price=100, volume=100000,
        turnover=10000000, source="ENGINEERING", data_quality_flag=history.prices[0].data_quality_flag) for day in days),
        execution_rules=(replace(history.execution_rules[0], effective_to=days[-1]),))
    config = replace(config, horizons=(10,))
    row = replace(row, invalidation_price=96, target_price=200)
    selections = [engineering_selection(receipt_session, day, config, (replace(row, as_of_date=day),))[1]
        for day in (days[0], days[1], days[12])]
    await receipt_session.commit()
    def outcome(observation, *args, **kwargs):
        value = compute_forward_outcome(observation, *args, **kwargs)
        if observation.as_of_date == days[1] and rejected_exit != "AVAILABLE":
            return replace(value, status=rejected_exit, outcome_end_date=None)
        return value
    monkeypatch.setattr("app.modules.backtesting.backtesting_shadow.compute_forward_outcome", outcome)
    values = await mature_shadow_outcomes(receipt_session, BacktestDataset((history,), days), config)
    for arm in ("baseline", "challenger"):
        assert [value["entry_arms"][arm][0]["accepted"] for value in values] == [True, False, True]
        portfolio = values[-1]["portfolios"][arm]
        assert portfolio["status"] == "AVAILABLE" and portfolio["accepted_fill_count"] == 2
    progress = await shadow_progress(receipt_session, exchange=config.exchange)
    for count in progress["counts"]["entry_arms"].values():
        assert count["filled_outcomes"] == 2 and count["acceptance_unknown"] == 0
        assert count["fill_bearing_dates"] == [days[0].isoformat(), days[12].isoformat()]
    heads = await TradingShadowRepository(receipt_session).latest_outcomes([value.id for value in selections])
    assert all(heads[selection.id].payload["entry_arms"]["baseline"][0]["accepted"] is accepted
        for selection, accepted in zip(selections, (True, False, True)))


@pytest.mark.asyncio
@pytest.mark.parametrize("legacy_metadata", [False, True])
async def test_empty_snapshot_holder_dates_all_cumulative_facts_and_preserves_history(receipt_session, monkeypatch, legacy_metadata):
    from copy import deepcopy
    from app.modules.backtesting.backtesting_shadow import receipt_input_revision
    row, history, initial, config, _ = fixture()
    days = tuple(initial[0] + timedelta(days=i) for i in range(25))
    history = replace(history, prices=tuple(DailyPrice(stock_id=history.stock.id, trade_date=day,
        open_price=104 if 1 <= index <= 3 else 100, high_price=105 if 1 <= index <= 3 else 102,
        low_price=102 if 1 <= index <= 3 else 99, close_price=104 if 1 <= index <= 3 else 100,
        volume=100000, turnover=10000000, source="ENGINEERING", data_quality_flag=history.prices[0].data_quality_flag)
        for index, day in enumerate(days)), execution_rules=(replace(history.execution_rules[0], effective_to=days[13]),
            replace(history.execution_rules[0], effective_from=days[18], effective_to=days[-1])))
    row = replace(row, entry_timing="PULLBACK", expiry_sessions=4, preferred_entry_zone_low=99,
        preferred_entry_zone_high=101, invalidation_price=96, target_price=200)
    config = replace(config, horizons=(10,))
    first = engineering_selection(receipt_session, days[0], config, (row,))[1]
    carrier = engineering_selection(receipt_session, days[1], config)[1]
    await receipt_session.commit()
    dataset = BacktestDataset((history,), days)
    repository = TradingShadowRepository(receipt_session)
    original_store = TradingShadowRepository.record_outcome
    if legacy_metadata:
        async def store_legacy(repository, selection, *, through_date, revision, payload):
            if selection.id == carrier.id:
                payload = deepcopy(payload)
                payload["through_date"] = days[11].isoformat()
                payload["input_revision"] = receipt_input_revision(selection, dataset, days[11])
                payload.pop("portfolio_sources", None)
                payload.pop("portfolio_source_through_date", None)
                through_date, revision = days[11], stable_audit_hash(payload)
            return await original_store(repository, selection, through_date=through_date, revision=revision, payload=payload)
        monkeypatch.setattr(TradingShadowRepository, "record_outcome", store_legacy)
    else:
        pending = await mature_shadow_outcomes(receipt_session, replace(dataset, session_dates=days[:18]), config)
        assert pending[0]["entry_arms"]["baseline"][0]["status"] == "EXIT_BLOCKED"
        assert pending[1]["through_date"] == pending[1]["portfolio_source_through_date"] == days[17].isoformat()
    evaluated = replace(dataset, session_dates=days[:19])
    values = await mature_shadow_outcomes(receipt_session, evaluated, config)
    prior = (await repository.latest_outcomes([carrier.id]))[carrier.id]
    monkeypatch.setattr(TradingShadowRepository, "record_outcome", original_store)
    if legacy_metadata:
        assert prior.through_date == days[11] and prior.payload["portfolios"]["baseline"]["events"][-1]["date"] == days[18].isoformat()
        values = await mature_shadow_outcomes(receipt_session, evaluated, config)
    snapshot = values[1]
    assert snapshot["entry_arms"] == {"baseline": [], "challenger": []} and snapshot["mature"] is True
    assert snapshot["through_date"] == snapshot["portfolio_source_through_date"] == days[18].isoformat()
    assert values[0]["portfolios"] == {}
    for portfolio in snapshot["portfolios"].values():
        assert portfolio["daily"][-1]["date"] == portfolio["events"][-1]["date"] == snapshot["through_date"]
        assert portfolio["status"] == "AVAILABLE" and portfolio["accepted_fill_count"] == 1
    assert snapshot["portfolio_sources"] == {str(selection.id): {
        "selection_hash": selection.record_hash,
        "input_revision": receipt_input_revision(selection, evaluated, days[18], include_universe=False)}
        for selection in (first, carrier)}
    head = (await repository.latest_outcomes([carrier.id]))[carrier.id]
    assert head.through_date == days[18] and head.payload == snapshot
    assert len(await repository.outcome_vintages([prior.id, head.id])) == (2 if legacy_metadata else 1)
    # Re-evaluating an earlier cutoff must not reuse later facts or displace the current SQL head.
    earlier = await mature_shadow_outcomes(receipt_session, replace(dataset, session_dates=days[:18]), config)
    assert all(value["through_date"] <= days[17].isoformat() for value in earlier)
    assert earlier[0]["entry_arms"]["baseline"][0]["status"] == "EXIT_BLOCKED"
    assert all(row["date"] <= days[17].isoformat() for portfolio in earlier[1]["portfolios"].values()
        for kind in ("daily", "events") for row in portfolio[kind])
    assert (await repository.latest_outcomes([carrier.id]))[carrier.id].id == head.id
    count = await receipt_session.scalar(select(func.count()).select_from(TradingShadowOutcome))
    def unchanged(*args, **kwargs):
        raise AssertionError("Mature cumulative evidence must reuse unchanged labels and execution")
    monkeypatch.setattr("app.modules.backtesting.backtesting_shadow.compute_selection_markout", unchanged)
    monkeypatch.setattr("app.modules.backtesting.backtesting_shadow.simulate_next_session_execution", unchanged)
    reused = await mature_shadow_outcomes(receipt_session, dataset, config)
    assert reused[1] == snapshot
    assert await receipt_session.scalar(select(func.count()).select_from(TradingShadowOutcome)) == count
    assert (await repository.latest_outcomes([carrier.id]))[carrier.id].id == head.id
