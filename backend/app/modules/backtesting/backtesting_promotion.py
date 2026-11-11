"""Separate hard ranking/entry promotion decisions; missing evidence always fails closed."""

from collections import Counter, defaultdict
from dataclasses import replace
from bisect import bisect_right
from app.modules.backtesting.backtesting_availability import capture_availability
from random import Random
from statistics import mean, median

from app.modules.backtesting.backtesting_challengers import CHALLENGER_INPUT_GAPS, EXPERIMENT
from app.modules.backtesting.backtesting_evaluation import observation_key
from app.modules.backtesting.backtesting_execution import rule_on, simulate_next_session_execution, compute_forward_outcome
from app.modules.stock_details.decision.event_availability import utc_instant
from app.modules.backtesting.backtesting_models import ExecutionResult


def paired_block_interval(daily_differences, *, block_sessions=20):
    rows = sorted(daily_differences)
    blocks = [
        mean(value for _, value in rows[index : index + block_sessions])
        for index in range(0, len(rows), block_sessions)
        if len(rows[index : index + block_sessions]) == block_sessions
    ]
    if len(blocks) < 3:
        return {"status": "UNSUPPORTED", "block_count": len(blocks), "lower": None, "upper": None}
    random = Random(EXPERIMENT["uncertainty"]["seed"])
    samples = sorted(
        mean(random.choices(blocks, k=len(blocks)))
        for _ in range(EXPERIMENT["uncertainty"]["replicates"])
    )
    return {
        "status": "AVAILABLE",
        "block_count": len(blocks),
        "lower": samples[int(0.025 * len(samples))],
        "upper": samples[int(0.975 * len(samples))],
        "mean": mean(value for _, value in rows),
    }


def coverage_evidence(dataset, observations, config, *, families=None):
    histories = {row.stock.id: row for row in dataset.histories}
    gaps, parity_failures, comparisons = set(), 0, 0
    for item in observations:
        history = histories.get(item.stock_id)
        if history is None:
            gaps.add("MISSING_INSTRUMENT_HISTORY")
            continue
        if not history.point_in_time_verified:
            gaps.add("POINT_IN_TIME_HISTORY_UNVERIFIED")
        if not history.event_coverage_verified:
            gaps.add("EVENT_COVERAGE_UNKNOWN")
        if not history.instrument_history_verified:
            gaps.add("INSTRUMENT_HISTORY_UNKNOWN")
        if item.display_action == "POTENTIAL_BUY":
            execution = simulate_next_session_execution(item, history, dataset.session_dates, config)
            start = bisect_right(dataset.session_dates, item.as_of_date)
            stop = start + max(1, item.expiry_sessions or 1)
            if execution.is_filled:
                outcome = compute_forward_outcome(item, execution, history, dataset.session_dates, dataset.market_summaries, config, max(config.horizons))
                stop = (bisect_right(dataset.session_dates, outcome.outcome_end_date) if outcome.outcome_end_date else
                    min(len(dataset.session_dates), bisect_right(dataset.session_dates, execution.execution_date) + max(config.horizons)))
            elif execution.execution_date:
                stop = bisect_right(dataset.session_dates, execution.execution_date)
            window = dataset.session_dates[start:stop]
            if execution.status == "RULES_UNAVAILABLE" or not window or not all(rule_on(history, day, config)[1] for day in window):
                gaps.add("EXECUTION_RULE_COVERAGE_UNKNOWN")
        captured = [capture for capture in history.captured_inputs
            if (capture.get("publication_id") or capture["observed_at"]) == item.publication_id
            and capture_availability(capture, item.as_of_date, dataset.session_dates, config, dataset.observed_session_dates)[0] == "TIMELY_CAPTURED"]
        if item.replay_classification != "TIMELY_CAPTURED":
            gaps.add("INPUT_NOT_TIMELY_CAPTURED")
        if item.publication_coverage_status != "VERIFIED":
            gaps.add("LISTED_MEMBERSHIP_COVERAGE_UNKNOWN")
        if item.engine_version != config.strategy_version:
            gaps.add("ENGINE_VERSION_NOT_FROZEN_POLICY")
        if not captured:
            gaps.add("MISSING_IMMUTABLE_AS_OF_CAPTURE")
            continue
        capture = max(captured, key=lambda row: utc_instant(row["observed_at"]))
        expected = capture.get("expected_decision")
        if not expected:
            gaps.add("MISSING_SAME_INPUT_PARITY_REFERENCE")
            continue
        actual = {key: getattr(item, key, None) for key in expected}
        comparisons += 1
        if actual != expected:
            parity_failures += 1
        if capture["input"].get("gaps"):
            gaps.add("CAPTURE_DECLARES_UNRESOLVED_GAPS")
    if not observations:
        gaps.add("NO_EVALUATION_OBSERVATIONS")
    requested = tuple(CHALLENGER_INPUT_GAPS) if families is None else tuple(families)
    challenger_gaps = {gap for family in requested for gap in CHALLENGER_INPUT_GAPS.get(family, ())}
    return {
        "coverage_verified": not gaps and not challenger_gaps,
        "coverage_gaps": sorted(gaps | challenger_gaps),
        "canonical_coverage_verified": not gaps,
        "canonical_coverage_gaps": sorted(gaps),
        "unsupported_challenger_inputs": CHALLENGER_INPUT_GAPS,
        "parity_comparisons": comparisons,
        "same_input_parity_failures": parity_failures if comparisons else None,
        "prospective_shadow_confirmed": bool(observations) and all(item.forward_selection_id and item.replay_classification == "TIMELY_CAPTURED" for item in observations),
        "safeguard_bypass_count": sum(len(item.safeguard_bypasses) for item in observations) if observations and all(item.safeguard_bypasses is not None for item in observations) else None,
    }


def concentration_and_turnover(selections):
    by_day = defaultdict(list)
    for item in selections:
        by_day[item.as_of_date].append(item)
    previous = None
    missing_sectors = any(not item.sector for item in selections)
    turnover, concentration = [], []
    for _, rows in sorted(by_day.items()):
        ids = {row.stock_id for row in rows}
        concentration.append(
            max(Counter(row.sector or "UNKNOWN" for row in rows).values()) / len(rows)
        )
        if previous is not None:
            turnover.append(len(ids - previous) / len(ids))
        previous = ids
    return {
        "mean_max_sector_weight": mean(concentration)
        if concentration and not missing_sectors
        else None,
        "mean_daily_replacement_fraction": mean(turnover) if turnover else None,
        "median_turnover_bdt": median(item.median_turnover or 0 for item in selections)
        if selections
        else None,
    }


def common_gate_reasons(evidence):
    reasons = list(evidence.get("coverage_gaps", []))
    if evidence.get("coverage_verified") is not True:
        reasons.append("COVERAGE_UNVERIFIED")
    if evidence.get("same_input_parity_failures") != 0 or not evidence.get("parity_comparisons"):
        reasons.append("SAME_INPUT_PARITY_NOT_ZERO_OR_UNVERIFIED")
    if evidence.get("safeguard_bypass_count") != 0:
        reasons.append("SAFEGUARD_BYPASS_OR_UNKNOWN")
    if evidence.get("comparison_invariants_verified") is not True:
        reasons.append("COMPARISON_INVARIANTS_UNVERIFIED")
    return reasons


def decision(reasons, evidence, diagnostics):
    statistical = not reasons
    unavailable = any(
        any(
            marker in reason
            for marker in (
                "UNKNOWN",
                "UNVERIFIED",
                "INSUFFICIENT",
                "MISSING",
                "INCOMPLETE",
                "UNAVAILABLE",
                "ABSENT",
                "DIFFER",
                "UNRESOLVED",
                "NO_EVALUATION",
            )
        )
        for reason in reasons
    )
    if diagnostics.get("paired_interval", {}).get("status") == "UNSUPPORTED":
        unavailable = True
    if not evidence.get("prospective_shadow_confirmed"):
        reasons = [*reasons, "PROSPECTIVE_SHADOW_REQUIRED"]
    return {
        "status": "PROMOTION_ELIGIBLE"
        if not reasons
        else "SHADOW"
        if statistical
        else "UNSUPPORTED"
        if unavailable
        else "REJECTED",
        "statistical_gate_passed": statistical,
        "promoted": False,
        "reasons": sorted(set(reasons)),
        **diagnostics,
    }


def ranking_gate(
    baseline, challenger, baseline_selections, challenger_selections, evidence, *, feature_coverage
):
    reasons = common_gate_reasons(evidence)
    base = {row["date"]: row for row in baseline["daily"]}
    other = {row["date"]: row for row in challenger["daily"]}
    if set(base) != set(other):
        reasons.append("COMPARISON_DATES_DIFFER")
    if feature_coverage["available"] != feature_coverage["total"]:
        reasons.append("CHALLENGER_FEATURE_COVERAGE_INCOMPLETE")
    pairs = [(day, base[day], other[day]) for day in sorted(base.keys() & other.keys())]
    mature = [row for row in pairs if row[1]["fully_observed"] and row[2]["fully_observed"]]
    evaluable = sum(row[2]["evaluable_selection_count"] for row in mature)
    if len(mature) < 60 or evaluable < 200:
        reasons.append("INSUFFICIENT_RANKING_SAMPLE")
    if any(
        a["universe_count"] != b["universe_count"] or a["selection_count"] != b["selection_count"]
        for _, a, b in pairs
    ):
        reasons.append("COHORT_OR_SELECTION_DENOMINATORS_DIFFER")
    if challenger["missing_selection_count"] > baseline["missing_selection_count"]:
        reasons.append("WORSE_OUTCOME_COVERAGE")
    differences = [
        (day, b["mean_net_excess_percent"] - a["mean_net_excess_percent"])
        for day, a, b in mature
        if a["mean_net_excess_percent"] is not None and b["mean_net_excess_percent"] is not None
    ]
    gain = mean(value for _, value in differences) if differences else None
    precisions = [
        (a["precision"], b["precision"])
        for _, a, b in mature
        if a["precision"] is not None and b["precision"] is not None
    ]
    base_precision = mean(a for a, _ in precisions) if precisions else None
    relative = mean(b for _, b in precisions) / base_precision - 1 if base_precision else None
    interval = paired_block_interval(differences)
    if gain is None or gain < 0.25:
        reasons.append("EXCESS_PRACTICAL_TARGET_NOT_MET")
    if relative is None or relative < 0.10:
        reasons.append("PRECISION_PRACTICAL_TARGET_NOT_MET")
    if interval["lower"] is None or interval["lower"] <= 0:
        reasons.append("PAIRED_UNCERTAINTY_NOT_POSITIVE")
    mature_days = {day for day, _, _ in mature}
    base_risk, other_risk = (
        concentration_and_turnover([item for item in baseline_selections if item.as_of_date in mature_days]),
        concentration_and_turnover([item for item in challenger_selections if item.as_of_date in mature_days]),
    )
    safeguards = EXPERIMENT["safeguards"]
    for metric in base_risk:
        if base_risk[metric] is None or other_risk[metric] is None:
            reasons.append("LIQUIDITY_CONCENTRATION_TURNOVER_UNVERIFIED")
    if (
        base_risk["mean_max_sector_weight"] is not None
        and other_risk["mean_max_sector_weight"] is not None
    ):
        if (
            other_risk["mean_max_sector_weight"]
            > base_risk["mean_max_sector_weight"]
            + safeguards["maximum_sector_concentration_increase"]
        ):
            reasons.append("CONCENTRATION_DETERIORATION")
        if (
            other_risk["median_turnover_bdt"]
            < base_risk["median_turnover_bdt"] * safeguards["minimum_relative_median_turnover"]
        ):
            reasons.append("LIQUIDITY_DETERIORATION")
    if (
        base_risk["mean_daily_replacement_fraction"] is not None
        and other_risk["mean_daily_replacement_fraction"] is not None
    ):
        if (
            other_risk["mean_daily_replacement_fraction"]
            > base_risk["mean_daily_replacement_fraction"] + safeguards["maximum_turnover_increase"]
        ):
            reasons.append("TURNOVER_DETERIORATION")
    return decision(
        reasons,
        evidence,
        {
            "mature_dates": len(mature),
            "excluded_partial_dates": [day for day, _, _ in pairs if day not in mature_days],
            "partial_date_count": len(pairs) - len(mature),
            "evaluable_selections": evaluable,
            "mean_net_excess_improvement_pp": gain,
            "relative_precision_improvement": relative,
            "paired_interval": interval,
            "baseline_safeguards": base_risk,
            "challenger_safeguards": other_risk,
        },
    )


def entry_cohorts(selections, base_executions, other_executions, base_outcomes, other_outcomes):
    groups = defaultdict(list)
    for item in selections:
        for dimension, value in (
            ("regime", item.market_regime),
            ("liquidity", item.liquidity_tier),
            ("abstention_reason", item.controlling_reason or "UNKNOWN"),
        ):
            groups[f"{dimension}:{value}"].append(item)
    reports = {}
    for name, rows in groups.items():
        dates = len({row.as_of_date for row in rows})
        filled = [
            sum(executions.get(observation_key(row), ExecutionResult("NO_STOCK_HISTORY")).is_filled for row in rows) / len(rows)
            for executions in (base_executions, other_executions)
        ]
        paired = []
        missing = 0
        for row in rows:
            key = observation_key(row)
            values = []
            for executions, outcomes in (
                (base_executions, base_outcomes),
                (other_executions, other_outcomes),
            ):
                out = outcomes.get(key)
                execution = executions.get(key, ExecutionResult("NO_STOCK_HISTORY"))
                # Cash on a genuinely unfilled attempt is zero; missing FILLED outcomes are unknown.
                values.append(out.net_return_percent if out and execution.is_filled else None if execution.is_filled or not execution.is_known else 0.0)
            if any(value is None for value in values):
                missing += 1
            else:
                paired.append(values[1] - values[0])
        adequate = dates >= 20 and len(rows) >= 30 and missing == 0
        gain = mean(paired) if paired else None
        reports[name] = {
            "status": "AVAILABLE" if adequate else "INCONCLUSIVE",
            "dates": dates,
            "selections": len(rows),
            "missing_filled_outcomes": missing,
            "mean_net_outcome_change_pp": gain,
            "fill_rate_change": filled[1] - filled[0],
            "fails_gate": adequate and (gain < -0.5 or filled[1] - filled[0] < -0.05),
        }
    return reports


def entry_policy_gate(
    baseline,
    challenger,
    selections,
    base_executions,
    other_executions,
    base_outcomes,
    other_outcomes,
    evidence,
):
    reasons = common_gate_reasons(evidence)
    if set(base_executions) != set(other_executions) or set(base_executions) != {
        observation_key(item) for item in selections
    }:
        reasons.append("ENTRY_CANDIDATES_DIFFER")
    accepted = set(challenger["accepted_keys"])
    filled = [
        out
        for out in other_outcomes.values()
        if out.status == "AVAILABLE"
        and out.execution_status == "FILLED"
        and f"{out.stock_id}:{out.as_of_date}" in accepted
    ]
    mature_dates = len({out.as_of_date for out in filled})
    base_accepted = set(baseline["accepted_keys"])
    base_filled = [
        out
        for out in base_outcomes.values()
        if out.status == "AVAILABLE"
        and out.execution_status == "FILLED"
        and f"{out.stock_id}:{out.as_of_date}" in base_accepted
    ]
    if mature_dates < 60 or len(filled) < 200 or len(base_filled) < 200:
        reasons.append("INSUFFICIENT_FILLED_SAMPLE")
    base_return, other_return = (
        baseline["cash_inclusive_net_return_percent"],
        challenger["cash_inclusive_net_return_percent"],
    )
    improvement = (
        other_return - base_return if base_return is not None and other_return is not None else None
    )
    if improvement is None or improvement <= 0:
        reasons.append("NO_POSITIVE_CASH_INCLUSIVE_GAIN")
    if (
        baseline["maximum_drawdown_percent"] is None
        or challenger["maximum_drawdown_percent"] is None
    ):
        reasons.append("DRAWDOWN_UNAVAILABLE")
    elif challenger["maximum_drawdown_percent"] < baseline["maximum_drawdown_percent"]:
        reasons.append("DRAWDOWN_INCREASED")

    def daily_returns(ledger):
        result, previous = {}, ledger["initial_capital_bdt"]
        for row in ledger["daily"]:
            result[row["date"]] = (row["equity_bdt"] / previous - 1) * 100
            previous = row["equity_bdt"]
        return result

    left, right = daily_returns(baseline), daily_returns(challenger)
    interval = paired_block_interval(
        [(day, right[day] - left[day]) for day in sorted(left.keys() & right.keys())]
    )
    if interval["lower"] is None or interval["lower"] <= 0:
        reasons.append("PAIRED_CASH_UNCERTAINTY_NOT_POSITIVE")
    def accepted_executions(executions, portfolio):
        result = {}
        for key, value in executions.items():
            evidence = portfolio.get("acceptance_by_key", {}).get(f"{key[0]}:{key[1]}", f"{key[0]}:{key[1]}" in portfolio["accepted_keys"])
            result[key] = replace(value, status="EXECUTION_UNVERIFIED", uncertainty_reasons=("PORTFOLIO_PATH_UNVERIFIED",)) if value.is_filled and evidence is None else replace(value, status="PORTFOLIO_REJECTED") if value.is_filled and not evidence else value
        return result
    cohorts = entry_cohorts(selections, accepted_executions(base_executions, baseline),
        accepted_executions(other_executions, challenger), base_outcomes, other_outcomes)
    if any(row["fails_gate"] for row in cohorts.values()):
        reasons.append("MATERIAL_COHORT_DETERIORATION")
    return decision(
        reasons,
        evidence,
        {
            "mature_dates": mature_dates,
            "filled_outcomes": len(filled),
            "missed_baseline_executable_opportunities": sum(
                base_executions[key].is_filled and not other_executions[key].is_filled
                for key in base_executions.keys() & other_executions.keys()
            ),
            "selection_denominator": len(selections),
            "cash_return_improvement_pp": improvement,
            "paired_interval": interval,
            "cohorts": cohorts,
        },
    )
