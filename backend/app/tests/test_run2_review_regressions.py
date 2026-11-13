"""Behavioral regressions for reviewed capture and receipt evidence failures."""
import os
from dataclasses import asdict, replace
from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.schema import CreateSchema, DropSchema

from app.core.audit_hashing import canonicalize_audit_value
from app.core.constants.trading_constants import TRADING_STRATEGY_VERSION
from app.core.core_config import Settings
from app.models import DecisionGenerationCapture, TradingShadowSelection, TradingShadowOutcome, DailyPrice, Stock, DailyMarketSummary
from app.modules.backtesting.backtesting_availability import next_verified_open
from app.modules.backtesting.backtesting_challengers import EXPERIMENT_ID, EXPERIMENT
from app.modules.backtesting.backtesting_engine import replay_canonical_engine
from app.modules.backtesting.backtesting_evaluation import reconcile_coverage
from app.modules.backtesting.backtesting_execution import simulate_next_session_execution, compute_forward_outcome
from app.modules.backtesting.backtesting_models import BacktestConfig, BacktestDataset, ExecutionResult
from app.modules.backtesting.backtesting_shadow import mature_shadow_outcomes, shadow_progress, record_shadow_selection
from app.modules.backtesting.backtesting_shadow_assessment import assess_shadow_receipts
from app.modules.backtesting.backtesting_shadow_repository import TradingShadowRepository
from app.tests.test_capture_replay_boundaries import captured_fixture
from app.tests.test_phase2_replay import fixture
from app.tests.test_trading_shadow_receipts import empty_eligible_capture


@pytest.mark.parametrize("policy", ["canonical-plan-v1", "canonical-tight-gap-v1"])
@pytest.mark.parametrize("later", ["blocked", "fill", "truncated"])
def test_unknown_earlier_execution_survives_later_bar_and_truncated_window(policy, later):
    row, history, days, config, _ = fixture()
    # An unknown first opportunity followed by a blocked or apparently fillable day.
    history = replace(history, execution_rules=(replace(history.execution_rules[0], effective_from=days[2]),))
    if later == "blocked":
        history.prices[2].volume = 0
        row = replace(row, expiry_sessions=2)
    elif later == "truncated":
        days = days[:2]
    execution = simulate_next_session_execution(row, history, days, config, policy_id=policy)
    assert not execution.is_filled and "RULES_UNAVAILABLE" in execution.uncertainty_reasons
    assert compute_forward_outcome(row, execution, history, days, (), config, 10).status == "EXECUTION_UNVERIFIED"


def test_known_blocked_but_open_entry_window_is_not_expired():
    row, history, days, config, _ = fixture()
    history.prices[1].volume = 0
    result = simulate_next_session_execution(row, history, days[:2], config)
    assert result.status == "EXECUTION_UNVERIFIED" and result.uncertainty_reasons == ("ENTRY_WINDOW_INCOMPLETE",)
    assert result.events[-1]["state"] == "ENTRY_WINDOW_INCOMPLETE"


def test_source_vintage_boundary_is_independent_of_canonical_parity():
    _, capture, dataset, config = captured_fixture()
    selected = datetime.fromisoformat(capture["observed_at"])
    capture["input"]["source_observations"][-1]["observed_at"] = (selected+timedelta(hours=1)).isoformat()
    audit = {}
    assert not replay_canonical_engine(dataset, config, audit=audit)[0]
    assert audit["replay_exclusions"][0]["reason"] == "SOURCE_NOT_KNOWN_AT_SELECTION"
    capture["input"]["source_observations"][-1]["observed_at"] = None
    rows, _ = replay_canonical_engine(dataset, replace(config, replay_mode="capture_diagnostic"), audit=audit)
    assert rows[0].parity_status == "MATCH" and rows[0].replay_classification == "UNAVAILABLE"
    assert audit["input_classifications"][0]["reason"] == "SOURCE_OBSERVATION_UNKNOWN"


def test_capture_coverage_reconciles_members_without_mutable_bars_and_true_exclusions():
    _, capture, dataset, config = captured_fixture(stale=True)
    audit = {}
    rows, _ = replay_canonical_engine(dataset, config, audit=audit)
    coverage = reconcile_coverage(dataset, config, rows, audit)
    assert coverage["attempted_instrument_sessions"] == coverage["observations"] == 1
    assert coverage["excluded_members"] == 0 and "missing_bar" not in coverage
    missing = str(uuid4())
    dataset.publications[0]["members"].append(missing)
    rows, _ = replay_canonical_engine(dataset, config, audit=audit)
    coverage = reconcile_coverage(dataset, config, rows, audit)
    assert coverage["attempted_instrument_sessions"] == 2 and coverage["exclusion_counts"] == {"MEMBER_INPUT_UNAVAILABLE": 1}
    capture["observed_at"] = next_verified_open(config.start_date, dataset.session_dates, config).isoformat()
    rows, _ = replay_canonical_engine(dataset, config, audit=audit)
    assert reconcile_coverage(dataset, config, rows, audit)["exclusion_counts"]["AT_OR_AFTER_NEXT_OPEN"] == 1


def test_observed_unfinalized_day_cannot_move_deadline_to_later_finalized_day():
    _, _, dataset, config = captured_fixture()
    day = config.start_date
    observed_day = day+timedelta(days=1)
    assert next_verified_open(day, dataset.session_dates, config) is not None  # Genuine gap/holiday has no observed trade.
    dataset = replace(dataset, observed_session_dates=(observed_day,))
    assert next_verified_open(day, dataset.session_dates, config, dataset.observed_session_dates) is None
    audit = {}
    assert not replay_canonical_engine(dataset, config, audit=audit)[0]
    assert audit["replay_exclusions"][0]["reason"] == "NEXT_OPEN_UNVERIFIED"


@pytest_asyncio.fixture
async def receipt_session():
    raw = os.getenv("TRADING_TEST_DATABASE_URL")
    if not raw:
        pytest.skip("Set isolated local TRADING_TEST_DATABASE_URL after shadow migration")
    url = make_url(raw)
    assert url.host in {"localhost", "127.0.0.1"} and url.database.startswith("smart_stock_decision_qa_")
    schema = "shadow_review_"+uuid4().hex
    engine = create_async_engine(url.set(drivername="postgresql+asyncpg"), connect_args={"server_settings": {"search_path": schema+",public"}})
    async with engine.begin() as connection:
        await connection.execute(CreateSchema(schema))
        for table in ("decision_generation_captures", "trading_shadow_selections", "trading_shadow_outcomes"):
            await connection.execute(text(f'CREATE TABLE "{schema}".{table} (LIKE public.{table} INCLUDING ALL)'))
            await connection.execute(text(f'CREATE TRIGGER immutable_trading_capture BEFORE UPDATE OR DELETE ON "{schema}".{table} FOR EACH ROW EXECUTE FUNCTION public.guard_trading_capture_immutable()'))
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            yield session
    finally:
        async with engine.begin() as connection:
            await connection.execute(DropSchema(schema, cascade=True))
        await engine.dispose()


def engineering_selection(session, day, config, rows=(), version=TRADING_STRATEGY_VERSION):
    stamp = datetime.combine(day, datetime.min.time(), tzinfo=UTC).replace(hour=10)
    source = DecisionGenerationCapture(id=uuid4(), exchange=config.exchange, generation_id=uuid4().hex,
        session_date=day, observed_at=stamp, input_payload={}, result_payload={})
    arms = {"baseline": [asdict(row) for row in rows], "challenger": [asdict(row) for row in rows]}
    selection = TradingShadowSelection(id=uuid4(), source_capture_id=source.id, exchange=config.exchange,
        session_date=day, strategy_version=version, experiment_id=EXPERIMENT_ID,
        selected_at=stamp, recorded_at=stamp+timedelta(seconds=1), record_hash=uuid4().hex,
        payload=canonicalize_audit_value({"config":asdict(config), "universe": [asdict(row) for row in rows],
            "ranking_arms":arms, "entry_arms":arms, "input_generation":source.generation_id,
            "entry_policies":{"challenger":EXPERIMENT["entry_challenger"]},
            "input_observed_at":stamp, "input_calculation_times":[stamp], "source_knowledge_verified":True,
            "feature_coverage":{"available":len(rows),"total":len(rows)}, "safeguard_bypasses":[],
            "safeguard_evidence_status":"MEASURED", "empty_session":not rows}))
    session.add_all([source, selection])
    return source, selection


@pytest.mark.asyncio
async def test_forward_progress_counts_only_portfolio_accepted_fills_and_distinct_dates(receipt_session):
    row, history, days, config, dataset = fixture()
    days = tuple(days[0]+timedelta(days=i) for i in range(25))
    history = replace(history, prices=tuple(DailyPrice(stock_id=history.stock.id, trade_date=day,
        open_price=100, high_price=102, low_price=98, close_price=100, volume=100000,
        turnover=10000000, source="ENGINEERING", data_quality_flag=history.prices[0].data_quality_flag) for day in days),
        execution_rules=(replace(history.execution_rules[0], effective_to=days[-1]),))
    other_stock = Stock(id=uuid4(), symbol="SECOND", exchange=history.stock.exchange)
    other_history = replace(history, stock=other_stock)
    config = replace(config, horizons=(10,), initial_capital_bdt=60000)
    second = replace(row, stock_id=other_stock.id, symbol="SECOND")
    engineering_selection(receipt_session, days[0], config, (row, second))
    engineering_selection(receipt_session, days[1], config, (replace(row, as_of_date=days[1]),))
    await receipt_session.commit()
    dataset = replace(dataset, histories=(history, other_history), session_dates=days)
    await mature_shadow_outcomes(receipt_session, dataset, config)
    progress = await shadow_progress(receipt_session, exchange=config.exchange)
    for arm in ("baseline", "challenger"):
        count = progress["counts"]["entry_arms"][arm]
        assert count["modeled_filled_outcomes"] == 3 and count["filled_outcomes"] == 1
        assert count["fill_bearing_dates"] == [days[0].isoformat()] and count["acceptance_unknown"] == 0
    outcomes = await TradingShadowRepository(receipt_session).latest_outcomes([row.id for row in
        await TradingShadowRepository(receipt_session).selections(exchange=config.exchange)])
    portfolio = next(value.payload["portfolios"]["baseline"] for value in outcomes.values() if value.payload["portfolios"])
    assert portfolio["portfolio_rejection_counts"] == {"ALREADY_HELD":1,"CASH_UNAVAILABLE":1}


@pytest.mark.asyncio
async def test_policy_rollover_unique_dates_and_all_three_withdrawals(receipt_session):
    row, _, days, config, dataset = fixture()
    sources, selected = [], []
    for day in days[:3]:
        source, selection = engineering_selection(receipt_session, day, config)
        sources.append(source); selected.append(selection)
        engineering_selection(receipt_session, day, config, version="trading-intelligence-v2")
    await receipt_session.commit()
    await mature_shadow_outcomes(receipt_session, dataset, config)
    progress = await shadow_progress(receipt_session, exchange=config.exchange)
    assert progress["selection_dates"] == progress["eligible_cohort_dates"] == 3
    selected[0].invalidated_at = datetime.now(UTC)
    sources[1].invalidated_at = datetime.now(UTC)
    latest = await TradingShadowRepository(receipt_session).latest_outcomes([selected[2].id])
    latest[selected[2].id].invalidated_at = datetime.now(UTC)
    await receipt_session.commit()
    progress = await shadow_progress(receipt_session, exchange=config.exchange)
    assert progress["eligible_cohort_dates"] == 0 and progress["withdrawn_receipts"] == 2


@pytest.mark.asyncio
async def test_actual_endpoint_assessment_waits_for_120_maturity_then_seals_once(receipt_session):
    _, _, days, config, _ = fixture()
    days = tuple(days[0]+timedelta(days=i) for i in range(135))
    config = replace(config, horizons=(10,))
    dataset = BacktestDataset((), days)
    for day in days[:119]:
        engineering_selection(receipt_session, day, config)
    await receipt_session.commit()
    await mature_shadow_outcomes(receipt_session, dataset, config)
    assert (await assess_shadow_receipts(receipt_session, dataset, exchange=config.exchange))["status"] == "AWAITING_FROZEN_ENDPOINT"
    source, endpoint = engineering_selection(receipt_session, days[119], config)
    await receipt_session.commit()
    short = replace(dataset, session_dates=days[:121])
    await mature_shadow_outcomes(receipt_session, short, config)
    assert (await assess_shadow_receipts(receipt_session, short, exchange=config.exchange))["status"] == "AWAITING_PRIMARY_MATURITY"
    await mature_shadow_outcomes(receipt_session, dataset, config)
    first = await assess_shadow_receipts(receipt_session, dataset, exchange=config.exchange)
    assert first["status"] == "ASSESSED_AT_FROZEN_ENDPOINT" and first["promoted"] is False
    assert first["ranking"]["status"] == first["entry"]["status"] == "UNSUPPORTED"
    assert "NO_EVALUATION_OBSERVATIONS" in first["ranking"]["reasons"]
    repeated = await assess_shadow_receipts(receipt_session, dataset, exchange=config.exchange)
    assert repeated["assessment_id"] == first["assessment_id"] and repeated["reused"]
    assert len((await receipt_session.scalars(select(TradingShadowOutcome).where(
        TradingShadowOutcome.payload["kind"].astext == "FORMAL_ASSESSMENT"))).all()) == 1
    source.invalidated_at = datetime.now(UTC)
    await receipt_session.commit()
    assert (await assess_shadow_receipts(receipt_session, dataset, exchange=config.exchange))["status"] == "ASSESSMENT_INVALIDATED_OR_SUPERSEDED"


@pytest.mark.asyncio
async def test_job_seals_actual_opening_override(receipt_session):
    capture = empty_eligible_capture()
    receipt_session.add(DecisionGenerationCapture(id=capture.id, exchange=capture.exchange, generation_id=capture.generation_id,
        session_date=capture.session_date, observed_at=capture.observed_at,
        input_payload=capture.input_payload, result_payload=capture.result_payload))
    await receipt_session.commit()
    settings = Settings(market_session_open_overrides={"2026-11-12":"09:00"})
    selection = await record_shadow_selection(receipt_session, capture, settings)
    assert selection.payload["config"]["session_open_overrides"] == [["2026-11-12", "09:00"]]
    assert selection.payload["safeguard_bypasses"] is None and selection.payload["safeguard_evidence_status"] == "UNMEASURED"


@pytest.mark.asyncio
@pytest.mark.parametrize("bypass_evidence", ["missing", "unmeasured_zero", "observed_zero", "observed_bypass"])
async def test_nonempty_formal_comparison_uses_sealed_receipt_rows_and_outcomes(receipt_session, bypass_evidence):
    row, history, original_days, config, _ = fixture()
    days = tuple(original_days[0]+timedelta(days=i) for i in range(145))
    prices = tuple(DailyPrice(stock_id=history.stock.id, trade_date=day, open_price=100, high_price=102,
        low_price=98, close_price=100, volume=100000, turnover=10000000,
        source="ENGINEERING", data_quality_flag=history.prices[0].data_quality_flag) for day in days)
    history = replace(history, prices=prices, execution_rules=(replace(history.execution_rules[0], effective_to=days[-1]),))
    other = replace(history, stock=Stock(id=uuid4(), symbol="PAIR", exchange=history.stock.exchange))
    config = replace(config, horizons=(10,))
    dataset = BacktestDataset((history, other), days, tuple(DailyMarketSummary(exchange=config.exchange,
        index_name="DSEX", trade_date=day, index_close=100, is_finalized=True) for day in days))
    for day in days[:120]:
        _, selection = engineering_selection(receipt_session, day, config, (replace(row, as_of_date=day),
            replace(row, stock_id=other.stock.id, symbol="PAIR", as_of_date=day)))
        if bypass_evidence == "missing":
            selection.payload.pop("safeguard_bypasses")
        elif bypass_evidence == "unmeasured_zero":
            selection.payload["safeguard_evidence_status"] = "UNMEASURED"
        elif bypass_evidence == "observed_bypass":
            selection.payload["safeguard_bypasses"] = ["ENGINEERING_BYPASS"]
    await receipt_session.commit()
    await mature_shadow_outcomes(receipt_session, dataset, config)
    result = await assess_shadow_receipts(receipt_session, dataset, exchange=config.exchange)
    assert result["ranking"]["mature_dates"] == 120 and result["ranking"]["evaluable_selections"] == 240
    assert "MISSING_IMMUTABLE_AS_OF_CAPTURE" in result["ranking"]["reasons"]
    assert "PROSPECTIVE_SHADOW_REQUIRED" not in result["ranking"]["reasons"]
    assert ("SAFEGUARD_BYPASS_OR_UNKNOWN" in result["ranking"]["reasons"]) == (bypass_evidence != "observed_zero")
    assert result["entry"]["filled_outcomes"] < 240 and result["promoted"] is False
    # Subsequent mutable source changes cannot rerun the sealed formal comparison.
    history.prices[-1].close_price = 50
    again = await assess_shadow_receipts(receipt_session, dataset, exchange=config.exchange)
    assert again["reused"] and again["assessment_id"] == result["assessment_id"] and again["ranking"] == result["ranking"]


@pytest.mark.asyncio
@pytest.mark.parametrize("correction", ["late", "unknown", "displaced", "confirmed"])
async def test_formal_assessment_admission_tracks_latest_calendar_and_frozen_cohort(receipt_session, correction):
    _, _, initial, config, _ = fixture()
    days = tuple(initial[0]+timedelta(days=i*2) for i in range(135))
    config = replace(config, horizons=(10,))
    dataset = BacktestDataset((), days)
    for index, day in enumerate(days[:120]):
        _, selection = engineering_selection(receipt_session, day, config)
        if index == 0:
            stamp = selection.selected_at+timedelta(hours=19)  # After intervening day's 10:00 Dhaka open.
            selection.selected_at, selection.recorded_at = stamp, stamp+timedelta(seconds=1)
            selection.payload.update(input_observed_at=stamp.isoformat(), input_calculation_times=[stamp.isoformat()])
    await receipt_session.commit()
    await mature_shadow_outcomes(receipt_session, dataset, config)
    original = await assess_shadow_receipts(receipt_session, dataset, exchange=config.exchange)
    assert original["status"] == "ASSESSED_AT_FROZEN_ENDPOINT"
    intervening = days[0]+timedelta(days=1)
    if correction == "late":
        updated = replace(dataset, session_dates=tuple(sorted((*days, intervening))))
    elif correction == "unknown":
        updated = replace(dataset, observed_session_dates=(intervening,))
    elif correction == "displaced":
        earlier = days[0]-timedelta(days=2)
        engineering_selection(receipt_session, earlier, config)
        await receipt_session.commit()
        updated = replace(dataset, session_dates=(earlier, *days))
    else:
        updated = replace(dataset, session_dates=(*days, days[-1]+timedelta(days=2)))
    await mature_shadow_outcomes(receipt_session, updated, config)
    result = await assess_shadow_receipts(receipt_session, updated, exchange=config.exchange)
    progress = await shadow_progress(receipt_session, exchange=config.exchange)
    expected = "ASSESSED_AT_FROZEN_ENDPOINT" if correction == "confirmed" else "ASSESSMENT_INVALIDATED_OR_SUPERSEDED"
    assert result["status"] == progress["formal_comparison_status"] == expected
    assert result["assessment_id"] == original["assessment_id"] and result["reused"]
    assert len((await receipt_session.scalars(select(TradingShadowOutcome).where(
        TradingShadowOutcome.payload["kind"].astext == "FORMAL_ASSESSMENT"))).all()) == 1


@pytest.mark.asyncio
async def test_invalid_price_opportunity_keeps_dependent_forward_acceptance_unknown(receipt_session):
    row, history, initial, config, _ = fixture()
    days = tuple(initial[0]+timedelta(days=i) for i in range(25))
    prices = tuple(DailyPrice(stock_id=history.stock.id, trade_date=day, open_price=100,
        high_price=0 if index == 1 else 102, low_price=98, close_price=100,
        volume=100000, turnover=10000000, source="ENGINEERING", data_quality_flag=history.prices[0].data_quality_flag)
        for index,day in enumerate(days))
    history = replace(history, prices=prices, execution_rules=(replace(history.execution_rules[0], effective_to=days[-1]),))
    config = replace(config, horizons=(10,), initial_capital_bdt=60000)
    engineering_selection(receipt_session, days[0], config, (replace(row, expiry_sessions=1),))
    engineering_selection(receipt_session, days[2], config, (replace(row, as_of_date=days[2], expiry_sessions=1),))
    await receipt_session.commit()
    values = await mature_shadow_outcomes(receipt_session, BacktestDataset((history,), days), config)
    for arm in ("baseline", "challenger"):
        assert values[0]["entry_arms"][arm][0]["execution"]["status"] == "INVALID_EXECUTION_PRICE"
        assert values[0]["entry_arms"][arm][0]["status"] == "EXECUTION_UNVERIFIED"
        assert values[1]["entry_arms"][arm][0]["execution_status"] == "FILLED"
        assert all(value["entry_arms"][arm][0]["accepted"] is None for value in values)
        assert values[-1]["portfolios"][arm]["acceptance_verified"] is False
        assert values[-1]["portfolios"][arm]["accepted_keys"] == []
        assert values[-1]["portfolios"][arm]["accepted_fill_count"] is None
    progress = await shadow_progress(receipt_session, exchange=config.exchange)
    for count in progress["counts"]["entry_arms"].values():
        assert count["filled_outcomes"] == 0 and count["modeled_filled_outcomes"] == 1 and count["acceptance_unknown"] == 2


@pytest.mark.parametrize("status", ["INVALID_EXECUTION_PRICE", "FUTURE_UNMEASURED_STATUS"])
def test_execution_certainty_fails_closed_for_unknown_states(status):
    row, history, days, config, _ = fixture()
    execution = ExecutionResult(status)
    assert not execution.is_known
    assert compute_forward_outcome(row, execution, history, days, (), config, 10).status == "EXECUTION_UNVERIFIED"


def test_explicit_publisher_exclusions_precede_capture_bytes_and_preserve_denominators():
    _, capture, dataset, config = captured_fixture(stale=True)
    declared_missing, undeclared_missing, bytes_excluded = (str(uuid4()) for _ in range(3))
    dataset.publications[0]["members"].extend([declared_missing, undeclared_missing, bytes_excluded])
    dataset.publications[0]["excluded_members"] = [
        {"stock_id": declared_missing, "reason_code":"NO_CAPTURED_INPUT"},
        {"stock_id": bytes_excluded, "reason_code":"NO_PUBLISHED_RESULT"}]
    history = replace(dataset.histories[0], stock=Stock(id=UUID(bytes_excluded), symbol="EXCLUDED"), captured_inputs=(capture,))
    dataset = replace(dataset, histories=(*dataset.histories, history))
    audit = {}
    rows, _ = replay_canonical_engine(dataset, config, audit=audit)
    coverage = reconcile_coverage(dataset, config, rows, audit)
    assert len(rows) == 1 and rows[0].parity_status == "MATCH"
    assert coverage["attempted_instrument_sessions"] == 4 and coverage["excluded_members"] == 3
    assert coverage["exclusion_counts"] == {"NO_CAPTURED_INPUT":1, "NO_PUBLISHED_RESULT":1, "MEMBER_INPUT_UNAVAILABLE":1}
    assert sum(value.get("publisher_declared") is True for value in audit["replay_exclusions"]) == 2


@pytest.mark.asyncio
async def test_partial_outcome_history_does_not_claim_to_supersede_later_head(receipt_session):
    _, _, days, config, _ = fixture()
    selection = engineering_selection(receipt_session, days[0], config)[1]
    await receipt_session.commit()
    repository = TradingShadowRepository(receipt_session)
    later = await repository.record_outcome(selection, through_date=days[3], revision="later",
        payload={"kind":"MODELED_OUTCOMES", "through_date":days[3].isoformat(), "value":3})
    earlier = await repository.record_outcome(selection, through_date=days[2], revision="earlier",
        payload={"kind":"MODELED_OUTCOMES", "through_date":days[2].isoformat(), "value":2})
    assert "supersedes_revision" not in earlier.payload
    assert (await repository.latest_outcomes([selection.id]))[selection.id].id == later.id
    stored_payload = await receipt_session.scalar(select(TradingShadowOutcome.payload).where(TradingShadowOutcome.id == earlier.id))
    assert stored_payload == earlier.payload
