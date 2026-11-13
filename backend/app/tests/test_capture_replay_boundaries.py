from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest

from app.modules.backtesting.backtesting_availability import capture_availability, next_verified_open
from app.modules.backtesting.backtesting_challengers import enrich_features
from app.modules.backtesting.backtesting_engine import replay_canonical_engine
from app.modules.backtesting.backtesting_models import BacktestConfig, BacktestDataset, StockReplayHistory
from app.modules.backtesting.backtesting_promotion import ranking_gate, entry_cohorts, coverage_evidence
from app.modules.stock_details.decision.canonical import build_strategy_input
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.trading_intelligence.input_capture import capture_strategy_input
from app.tests.test_backtesting_replay import _stock, _prices
from app.tests.test_phase2_research import gate_fixture, evidence


def captured_fixture(*, status_time=None, stale=False):
    stock = _stock()
    prices = _prices(stock, 2)
    day, next_day = prices[-1].trade_date, prices[-1].trade_date + timedelta(days=3)
    observed = status_time or datetime.combine(day, datetime.min.time(), tzinfo=UTC).replace(hour=10)
    for price in prices:
        price.updated_at = observed-timedelta(minutes=2)
    value = build_strategy_input(stock, prices[:-1] if stale else prices, reference_date=day,
        exchange_session_dates=(prices[0].trade_date, day), calculated_at=observed-timedelta(minutes=1))
    result = compute_trader_decision(value).canonical_result
    capture = {"publication_id": "original", "observed_at": observed.isoformat(), "input": capture_strategy_input(value),
        "expected_decision": {key: getattr(result, key) for key in ("input_hash", "shared_decision_id", "display_action", "eligibility_status", "entry_readiness")}}
    history = StockReplayHistory(stock, (), captured_inputs=(capture,))
    publication = {"generation_id": "original", "session_date": day.isoformat(), "observed_at": observed.isoformat(),
        "strategy_version": value.strategy_version, "members": [str(stock.id)]}
    dataset = BacktestDataset((history,), (prices[0].trade_date, day, next_day), publications=(publication,))
    config = BacktestConfig(stock.exchange, day, day, replay_mode="captured")
    return value, capture, dataset, config


@pytest.mark.parametrize("observed,status", [
    (datetime(2026, 11, 13, 2, tzinfo=UTC), "TIMELY_CAPTURED"),
    (datetime(2026, 11, 15, 4, tzinfo=UTC), "LATE_CAPTURED"),
    (datetime(2026, 11, 15, 4, 0, 1, tzinfo=UTC), "LATE_CAPTURED"),
])
def test_next_actual_open_strict_boundary_over_weekend_and_overnight(observed, status):
    day, next_day = date(2026, 11, 12), date(2026, 11, 15)
    config = BacktestConfig(_stock().exchange, day, day)
    capture = {"observed_at": observed.isoformat(), "input": {"calculated_at": (observed-timedelta(minutes=1)).isoformat(),
        "source_observations": [{"observed_at": (observed-timedelta(minutes=2)).isoformat()}]}}
    classification, _, deadline = capture_availability(capture, day, (day, next_day), config)
    assert classification == status and deadline == datetime(2026, 11, 15, 4, tzinfo=UTC)
    assert next_verified_open(next_day, (day, next_day), config) is None


def test_open_override_and_knowledge_after_selection_are_not_deadline_permission():
    day, next_day = date(2026, 11, 12), date(2026, 11, 15)
    config = BacktestConfig(_stock().exchange, day, day, session_open_overrides=((next_day.isoformat(), "11:00"),))
    selected = datetime(2026, 11, 12, 10, tzinfo=UTC)
    capture = {"observed_at": selected.isoformat(), "selection_at": selected.isoformat(),
        "input": {"calculated_at": (selected+timedelta(minutes=1)).isoformat()}}
    assert next_verified_open(day, (day, next_day), config).hour == 11
    assert capture_availability(capture, day, (day, next_day), config)[1] == "INPUT_NOT_KNOWN_AT_SELECTION"


def test_event_learned_after_selection_is_excluded_even_before_next_open():
    _, capture, dataset, config = captured_fixture()
    selected = datetime.fromisoformat(capture["observed_at"])
    capture["input"]["event_observations"] = [{"known_at": (selected+timedelta(minutes=1)).isoformat(),
        "effective_date": config.start_date.isoformat(), "kind": "split"}]
    audit = {}
    rows, _ = replay_canonical_engine(dataset, replace(config, replay_mode="capture_diagnostic"), audit=audit)
    assert not rows and audit["replay_exclusions"][0]["reason"] == "EVENT_NOT_KNOWN_AT_SELECTION"


@pytest.mark.parametrize("stale", [False, True])
def test_capture_membership_precedes_warmup_and_missing_same_day_bar(stale):
    value, capture, dataset, config = captured_fixture(stale=stale)
    observations, _ = replay_canonical_engine(dataset, config)
    assert len(observations) == 1  # History has zero mutable bars, captured input has only 1–2.
    assert observations[0].input_hash == compute_trader_decision(value).canonical_result.input_hash
    assert observations[0].parity_status == "MATCH"
    assert observations[0].close_price is None if stale else observations[0].close_price is not None


def test_captured_mode_excludes_late_or_missing_without_reconstruction():
    _, capture, dataset, config = captured_fixture()
    deadline = next_verified_open(config.start_date, dataset.session_dates, config)
    capture["observed_at"] = deadline.isoformat()
    audit = {}
    observations, _ = replay_canonical_engine(dataset, config, audit=audit)
    assert not observations and audit["replay_exclusions"][0]["classification"] == "LATE_CAPTURED"
    dataset = replace(dataset, histories=(replace(dataset.histories[0], captured_inputs=()),))
    observations, _ = replay_canonical_engine(dataset, config, audit=audit)
    assert not observations and audit["replay_exclusions"][0]["reason"] == "MEMBER_INPUT_UNAVAILABLE"


def test_last_date_without_verified_next_open_is_excluded():
    _, _, dataset, config = captured_fixture()
    audit = {}
    observations, _ = replay_canonical_engine(replace(dataset, session_dates=dataset.session_dates[:-1]), config, audit=audit)
    assert not observations and audit["replay_exclusions"][0]["reason"] == "NEXT_OPEN_UNVERIFIED"


def test_original_and_correction_vintages_remain_explicit():
    _, capture, dataset, config = captured_fixture()
    corrected = {**capture, "publication_id": "correction", "observed_at": (datetime.fromisoformat(capture["observed_at"])+timedelta(minutes=1)).isoformat()}
    publication = {**dataset.publications[0], "generation_id": "correction", "observed_at": corrected["observed_at"]}
    history = replace(dataset.histories[0], captured_inputs=(capture, corrected))
    dataset = replace(dataset, histories=(history,), publications=(*dataset.publications, publication))
    audit = {}
    rows, _ = replay_canonical_engine(dataset, config, audit=audit)
    assert len(rows) == 1 and rows[0].publication_id == "original"
    assert audit["replay_exclusions"][0]["reason"] == "NON_PRIMARY_PUBLICATION_VINTAGE"
    corrected_rows, _ = replay_canonical_engine(dataset, replace(config, publication_ids=("correction",)))
    assert corrected_rows[0].publication_id == "correction"


def test_partial_pair_cannot_reverse_mature_population_effect():
    selected, base, other = gate_fixture()
    partial_day = base["daily"][-1]["date"] + timedelta(days=1)
    partial = {**base["daily"][-1], "date": partial_day, "fully_observed": False, "mean_net_excess_percent": -1000}
    base["daily"].append(partial)
    other["daily"].append({**partial, "mean_net_excess_percent": 1000})
    result = ranking_gate(base, other, selected, selected, evidence(), feature_coverage={"available": 300, "total": 300})
    assert result["mature_dates"] == 60 and result["evaluable_selections"] == 300
    assert result["mean_net_excess_improvement_pp"] == pytest.approx(0.3)
    assert result["excluded_partial_dates"] == [partial_day]


def test_irrelevant_factor_gap_is_not_pooled_into_turnover_family():
    _, _, dataset, config = captured_fixture()
    observations, _ = replay_canonical_engine(dataset, config)
    turnover = coverage_evidence(dataset, observations, config, families=("turnover_trades",))
    breadth = coverage_evidence(dataset, observations, config, families=("breadth_persistence",))
    assert "MARKET_SUMMARY_PIT_UNKNOWN" not in turnover["coverage_gaps"]
    assert "MARKET_SUMMARY_PIT_UNKNOWN" in breadth["coverage_gaps"]
    assert turnover["safeguard_bypass_count"] is None


def test_missing_filled_outcome_is_unknown_while_known_nonfill_is_cash():
    from app.modules.backtesting.backtesting_models import ExecutionResult
    from app.modules.backtesting.backtesting_evaluation import observation_key
    selected, _, _ = gate_fixture()
    row = selected[0]
    key = observation_key(row)
    filled = {key: ExecutionResult("FILLED", execution_date=row.as_of_date)}
    nonfill = {key: ExecutionResult("NOT_PERMITTED")}
    missing = entry_cohorts((row,), filled, filled, {}, {})
    assert all(value["missing_filled_outcomes"] == 1 for value in missing.values())
    known = entry_cohorts((row,), nonfill, nonfill, {}, {})
    assert all(value["missing_filled_outcomes"] == 0 for value in known.values())


def test_rule_coverage_stops_at_actual_fill_holding_window():
    from app.tests.test_phase2_replay import fixture
    row, history, days, config, dataset = fixture()
    rule = replace(history.execution_rules[0], effective_to=days[4])
    dataset = replace(dataset, histories=(replace(history, execution_rules=(rule,)),))
    result = coverage_evidence(dataset, (row,), config, families=())
    assert "EXECUTION_RULE_COVERAGE_UNKNOWN" not in result["coverage_gaps"]


def test_missing_required_concentration_does_not_pass_on_other_good_metrics():
    selected, base, other = gate_fixture()
    unknown = tuple(replace(row, sector=None) for row in selected)
    result = ranking_gate(base, other, unknown, unknown, evidence(), feature_coverage={"available": 300, "total": 300})
    assert "LIQUIDITY_CONCENTRATION_TURNOVER_UNVERIFIED" in result["reasons"]


def test_factor_cannot_use_capture_learned_after_selection_despite_later_open():
    stock = _stock()
    prices = _prices(stock, 30)
    for bar in prices:
        bar.trade_count = 100
        bar.turnover_provenance = "REPORTED"
    day = prices[-1].trade_date
    observed = datetime.combine(day, datetime.min.time(), tzinfo=UTC).replace(hour=10)
    for price in prices:
        price.updated_at = observed-timedelta(minutes=2)
    value = build_strategy_input(stock, prices, reference_date=day,
        exchange_session_dates=tuple(bar.trade_date for bar in prices), calculated_at=observed-timedelta(minutes=1))
    capture = {"publication_id": "feature-source", "observed_at": observed.isoformat(), "input": capture_strategy_input(value)}
    history = StockReplayHistory(stock, tuple(prices), captured_inputs=(capture,), event_coverage_verified=True)
    publication = {"generation_id": "feature-source", "session_date": day.isoformat(), "observed_at": observed.isoformat(),
        "strategy_version": value.strategy_version, "members": [str(stock.id)]}
    dataset = BacktestDataset((history,), (*[bar.trade_date for bar in prices], day+timedelta(days=1)), publications=(publication,))
    config = BacktestConfig(stock.exchange, day, day, replay_mode="capture_diagnostic")
    observations, _ = replay_canonical_engine(dataset, config)
    control = enrich_features(observations, dataset, config)
    assert dict(control[0].research_features)["turnover_trades"] == 0
    earlier = tuple(replace(row, selection_at=observed-timedelta(seconds=1)) for row in observations)
    excluded = enrich_features(earlier, dataset, config)
    assert dict(excluded[0].research_features)["turnover_trades"] is None
