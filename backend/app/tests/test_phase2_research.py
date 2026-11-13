from dataclasses import replace
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

import pytest

from app.modules.backtesting.backtesting_challengers import (
    EXPERIMENT_ID,
    challenger_ranking,
    enrich_features,
    variants,
)
from app.modules.backtesting.backtesting_evaluation import observation_key, rank_metrics, top_five
from app.modules.backtesting.backtesting_models import (
    ExecutionResult,
    ForwardOutcome,
)
from app.modules.backtesting.backtesting_promotion import (
    entry_policy_gate,
    paired_block_interval,
    ranking_gate,
)
from app.modules.backtesting.backtesting_service import run_dataset
from app.tests.test_phase2_replay import fixture


def evidence(**changes):
    return {
        "coverage_verified": True,
        "coverage_gaps": [],
        "same_input_parity_failures": 0,
        "parity_comparisons": 300,
        "safeguard_bypass_count": 0,
        "comparison_invariants_verified": True,
        "prospective_shadow_confirmed": False,
        **changes,
    }


def gate_fixture():
    obs, _, days, _, _ = fixture()
    selections, base_daily, other_daily = [], [], []
    for i in range(60):
        day = days[0] + timedelta(days=i)
        for j in range(5):
            selections.append(
                replace(
                    obs,
                    stock_id=UUID(int=j + 1),
                    symbol=f"S{j}",
                    sector=f"Sector{j}",
                    as_of_date=day,
                )
            )
        row = {
            "date": day,
            "universe_count": 10,
            "selection_count": 5,
            "evaluable_selection_count": 5,
            "fully_observed": True,
            "mean_net_excess_percent": 1.0,
            "precision": 0.6,
        }
        base_daily.append(row)
        other_daily.append({**row, "mean_net_excess_percent": 1.3, "precision": 0.8})
    base = {"daily": base_daily, "missing_selection_count": 0}
    other = {"daily": other_daily, "missing_selection_count": 0}
    return tuple(selections), base, other


def test_ranking_gate_practical_targets_uncertainty_and_shadow_are_separate():
    selected, base, other = gate_fixture()
    coverage = {"available": 600, "total": 600}
    result = ranking_gate(base, other, selected, selected, evidence(), feature_coverage=coverage)
    assert result["statistical_gate_passed"] and result["status"] == "SHADOW"
    assert result["reasons"] == ["PROSPECTIVE_SHADOW_REQUIRED"]
    weak = {**other, "daily": [{**row, "mean_net_excess_percent": 1.24} for row in other["daily"]]}
    result = ranking_gate(base, weak, selected, selected, evidence(), feature_coverage=coverage)
    assert not result["statistical_gate_passed"]
    assert "EXCESS_PRACTICAL_TARGET_NOT_MET" in result["reasons"]
    unknown = evidence(coverage_verified=False, coverage_gaps=["EVENT_COVERAGE_UNKNOWN"])
    assert (
        ranking_gate(base, other, selected, selected, unknown, feature_coverage=coverage)["status"]
        == "UNSUPPORTED"
    )
    assert (
        ranking_gate(
            base,
            other,
            selected,
            selected,
            evidence(same_input_parity_failures=1),
            feature_coverage=coverage,
        )["status"]
        == "UNSUPPORTED"
    )


def test_ranking_gate_requires_60_dates_200_labels_and_does_not_drop_missing_cohorts():
    selected, base, other = gate_fixture()
    other["daily"][0]["fully_observed"] = False
    other["daily"][0]["evaluable_selection_count"] = 4
    other["missing_selection_count"] = 1
    result = ranking_gate(
        base,
        other,
        selected,
        selected,
        evidence(),
        feature_coverage={"available": 599, "total": 600},
    )
    assert {
        "INSUFFICIENT_RANKING_SAMPLE",
        "WORSE_OUTCOME_COVERAGE",
        "CHALLENGER_FEATURE_COVERAGE_INCOMPLETE",
    } <= set(result["reasons"])


def test_block_interval_uses_date_blocks_and_is_reproducible():
    selected, _, _ = gate_fixture()
    dates = sorted({row.as_of_date for row in selected})
    values = [(day, 0.3) for day in dates]
    result = paired_block_interval(values)
    assert result["block_count"] == 3 and result["lower"] == pytest.approx(0.3)
    assert result == paired_block_interval(values)
    assert paired_block_interval(values[:59])["status"] == "UNSUPPORTED"


def test_entry_gate_counts_portfolio_fills_cohorts_cash_and_drawdown_separately():
    selected, _, _ = gate_fixture()
    executions = {
        observation_key(row): ExecutionResult("FILLED", execution_date=row.as_of_date)
        for row in selected
    }
    base_outcomes = {
        observation_key(row): ForwardOutcome(
            row.stock_id,
            row.as_of_date,
            10,
            "AVAILABLE",
            "FILLED",
            net_return_percent=1.0,
            outcome_end_date=row.as_of_date + timedelta(days=10),
        )
        for row in selected
    }
    other_outcomes = {
        key: replace(out, net_return_percent=2.0) for key, out in base_outcomes.items()
    }
    dates = sorted({row.as_of_date for row in selected})
    base = {
        "initial_capital_bdt": 1000000,
        "cash_inclusive_net_return_percent": 1.0,
        "maximum_drawdown_percent": -5.0,
        "accepted_keys": [f"{row.stock_id}:{row.as_of_date}" for row in selected],
        "daily": [{"date": day, "equity_bdt": 1000000.0} for day in dates],
    }
    other = {
        **base,
        "cash_inclusive_net_return_percent": 2.0,
        "maximum_drawdown_percent": -4.0,
        "daily": [
            {"date": day, "equity_bdt": 1000000.0 * 1.001 ** (i + 1)} for i, day in enumerate(dates)
        ],
    }
    result = entry_policy_gate(
        base, other, selected, executions, executions, base_outcomes, other_outcomes, evidence()
    )
    assert result["status"] == "SHADOW" and result["filled_outcomes"] == 300
    result = entry_policy_gate(
        base,
        {**other, "maximum_drawdown_percent": -6},
        selected,
        executions,
        executions,
        base_outcomes,
        other_outcomes,
        evidence(),
    )
    assert "DRAWDOWN_INCREASED" in result["reasons"]
    lossy = {key: replace(out, net_return_percent=-1.0) for key, out in other_outcomes.items()}
    result = entry_policy_gate(
        base, other, selected, executions, executions, base_outcomes, lossy, evidence()
    )
    assert "MATERIAL_COHORT_DETERIORATION" in result["reasons"]
    result = entry_policy_gate(
        base,
        {**other, "accepted_keys": other["accepted_keys"][:199]},
        selected,
        executions,
        executions,
        base_outcomes,
        other_outcomes,
        evidence(),
    )
    assert "INSUFFICIENT_FILLED_SAMPLE" in result["reasons"]


def test_challengers_retain_missing_feature_dates_and_factor_ablations_are_frozen():
    obs, _, _, _, _ = fixture()
    rows = tuple(
        replace(
            obs,
            stock_id=UUID(int=i + 1),
            symbol=f"S{i}",
            research_features=(("relative_strength", float(i) if i else None),),
        )
        for i in range(7)
    )
    chosen, _, coverage = challenger_ranking(rows, ("relative_strength",))
    assert chosen == top_five(rows) and coverage["fallback_dates"] == 1
    assert len(variants()) == 9 and len(EXPERIMENT_ID) == 64


def test_features_only_use_as_of_prices_and_trade_counts_and_action_clean_windows():
    obs, history, days, _, dataset = fixture()
    prices = tuple(
        type(history.prices[0])(
            stock_id=history.stock.id,
            trade_date=days[0] + timedelta(days=i),
            open_price=Decimal(100 + i),
            high_price=Decimal(102 + i),
            low_price=Decimal(98 + i),
            close_price=Decimal(100 + i),
            volume=100000,
            turnover=Decimal(10000000),
            trade_count=100,
            source="FIXTURE",
            data_quality_flag=history.prices[0].data_quality_flag,
        )
        for i in range(30)
    )
    history = replace(history, prices=prices, event_coverage_verified=True)
    for price in prices:
        price.turnover_provenance = "REPORTED"
    dataset = replace(
        dataset, histories=(history,), session_dates=tuple(row.trade_date for row in prices)
    )
    obs = replace(obs, as_of_date=prices[25].trade_date)
    first = enrich_features((obs,), dataset)
    assert dict(first[0].research_features)["turnover_trades"] == 0
    prices[-1].close_price = Decimal(9999)
    prices[-1].trade_count = 999999
    assert first == enrich_features((obs,), dataset)
    prices[24].trade_count = None
    assert dict(enrich_features((obs,), dataset)[0].research_features)["turnover_trades"] is None


def test_daily_rank_lift_is_date_matched_and_missing_selection_stays_in_denominator():
    obs, _, days, _, _ = fixture()
    rows = tuple(replace(obs, stock_id=UUID(int=i + 1), symbol=f"S{i}") for i in range(6))
    marks = tuple(
        ForwardOutcome(
            row.stock_id,
            row.as_of_date,
            10,
            "AVAILABLE",
            "NOT_PERMITTED",
            excess_return_percent=float(6 - i),
        )
        for i, row in enumerate(rows)
    )
    result = rank_metrics(rows, rows[:5], marks, 10)
    assert result["mean_daily_lift_percent_points"] == pytest.approx(0.5)
    assert result["mean_daily_rank_ic"] == pytest.approx(1)
    missing = rank_metrics(rows, rows[:5], marks[1:], 10)
    assert missing["selection_count"] == 5 and missing["missing_selection_count"] == 1
    assert missing["mature_distinct_dates"] == 0


def test_full_research_report_insufficient_history_is_explicit_unsupported():
    _, _, _, config, dataset = fixture()
    report = run_dataset(dataset, config, sensitivities=False)
    assert report.research["experiment_id"] == EXPERIMENT_ID
    assert all(
        row["promotion"]["status"] == "UNSUPPORTED"
        for row in report.research["ranking_challengers"].values()
    )
    assert report.research["entry_policy_challenger"]["promotion"]["status"] == "UNSUPPORTED"
    assert report.research["model"]["status"] == "NOT_FIT"
    assert report.research["production_changes"] is False
    assert report.manifest.research_revision


@pytest.mark.parametrize("count", [60, 61, 79, 80])
def test_block_bootstrap_keeps_every_paired_date(count):
    start = date(2026, 1, 1)
    values = [(start + timedelta(days=i), 1.0 if i < 60 else -2.0) for i in range(count)]
    result = paired_block_interval(values)
    assert result["sample_size"] == count
    assert result["mean"] == pytest.approx(sum(value for _, value in values) / count)
    assert result == paired_block_interval(values)
    if count > 60:
        assert result["lower"] < result["mean"] < result["upper"]
        assert result["lower"] < 1.0


@pytest.mark.parametrize("missing_arm", ["both", "baseline", "challenger", "partial"])
def test_ranking_liquidity_requires_measured_turnover(missing_arm):
    selected, base, other = gate_fixture()
    missing = tuple(replace(row, median_turnover=None) for row in selected)
    left = missing if missing_arm in {"both", "baseline"} else selected
    right = missing if missing_arm in {"both", "challenger"} else (missing[:1] + selected[1:] if missing_arm == "partial" else selected)
    result = ranking_gate(base, other, left, right, evidence(prospective_shadow_confirmed=True), feature_coverage={"available":600,"total":600})
    assert result["status"] == "UNSUPPORTED"
    assert "LIQUIDITY_CONCENTRATION_TURNOVER_UNVERIFIED" in result["reasons"]
    assert result["baseline_safeguards"]["turnover_missing_count"] + result["challenger_safeguards"]["turnover_missing_count"] > 0


def test_measured_zero_turnover_is_distinct_from_missing():
    from app.modules.backtesting.backtesting_promotion import concentration_and_turnover
    selected, _, _ = gate_fixture()
    result = concentration_and_turnover(tuple(replace(row, median_turnover=0) for row in selected))
    assert result["median_turnover_bdt"] == 0
    assert result["turnover_missing_count"] == 0
