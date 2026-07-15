from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Callable
from datetime import date
from statistics import mean, median
from uuid import UUID

from app.core.enums import EligibilityStatus, TraderRecommendation
from app.modules.backtesting.backtesting_models import (
    BacktestConfig,
    ForwardOutcome,
    FrozenTestPeriod,
    ReplayObservation,
)


def _round(value: float | None, digits: int = 4) -> float | None:
    return round(value, digits) if value is not None else None


def _outcome_index(
    outcomes: tuple[ForwardOutcome, ...],
    horizon: int,
) -> dict[tuple[UUID, date], ForwardOutcome]:
    return {
        (outcome.stock_id, outcome.as_of_date): outcome
        for outcome in outcomes
        if outcome.horizon_sessions == horizon
    }


def select_pulse_top_k(
    observations: tuple[ReplayObservation, ...],
    *,
    threshold: int,
    top_k: int,
) -> tuple[ReplayObservation, ...]:
    by_date: dict[date, list[ReplayObservation]] = defaultdict(list)
    for observation in observations:
        if (
            observation.eligibility_status == EligibilityStatus.ELIGIBLE
            and observation.pulse_score >= threshold
        ):
            by_date[observation.as_of_date].append(observation)

    selected: list[ReplayObservation] = []
    for as_of_date in sorted(by_date):
        ranked = sorted(
            by_date[as_of_date],
            key=lambda item: (
                -item.pulse_score,
                -(item.median_turnover or 0),
                item.symbol.casefold(),
                str(item.stock_id),
            ),
        )
        selected.extend(ranked[:top_k])
    return tuple(selected)


def _strategy_summary(
    candidates: tuple[ReplayObservation, ...],
    outcome_by_key: dict[tuple[UUID, date], ForwardOutcome],
) -> dict[str, object]:
    candidate_outcomes = [
        outcome_by_key[(item.stock_id, item.as_of_date)]
        for item in candidates
        if (item.stock_id, item.as_of_date) in outcome_by_key
    ]
    filled = [outcome for outcome in candidate_outcomes if outcome.execution_status == "FILLED"]
    available = [outcome for outcome in candidate_outcomes if outcome.status == "AVAILABLE"]
    net_returns = [
        outcome.net_return_percent
        for outcome in available
        if outcome.net_return_percent is not None
    ]
    excess_returns = [
        outcome.excess_return_percent
        for outcome in available
        if outcome.excess_return_percent is not None
    ]
    mfe = [
        outcome.maximum_favorable_excursion_percent
        for outcome in available
        if outcome.maximum_favorable_excursion_percent is not None
    ]
    mae = [
        outcome.maximum_adverse_excursion_percent
        for outcome in available
        if outcome.maximum_adverse_excursion_percent is not None
    ]
    status_counts = Counter(outcome.status for outcome in candidate_outcomes)
    return {
        "candidate_count": len(candidates),
        "execution_fill_count": len(filled),
        "execution_fill_rate": _round(len(filled) / len(candidates) if candidates else None),
        "available_outcome_count": len(available),
        "outcome_status_counts": dict(sorted(status_counts.items())),
        "median_net_return_percent": _round(median(net_returns) if net_returns else None),
        "median_excess_return_percent": _round(
            median(excess_returns) if excess_returns else None
        ),
        "positive_net_hit_rate": _round(
            sum(value > 0 for value in net_returns) / len(net_returns)
            if net_returns
            else None
        ),
        "positive_excess_hit_rate": _round(
            sum(value > 0 for value in excess_returns) / len(excess_returns)
            if excess_returns
            else None
        ),
        "median_mfe_percent": _round(median(mfe) if mfe else None),
        "median_mae_percent": _round(median(mae) if mae else None),
    }


def build_decision_metrics(
    observations: tuple[ReplayObservation, ...],
) -> dict[str, object]:
    actions = Counter(item.recommendation.value for item in observations)
    eligibility = Counter(item.eligibility_status.value for item in observations)
    eligibility_reasons = Counter(
        reason
        for item in observations
        for reason in item.eligibility_reason_codes
    )
    eligible_count = eligibility.get(EligibilityStatus.ELIGIBLE.value, 0)
    return {
        "action_counts": dict(sorted(actions.items())),
        "eligibility_counts": dict(sorted(eligibility.items())),
        "eligibility_reason_counts": dict(sorted(eligibility_reasons.items())),
        "eligible_coverage": _round(
            eligible_count / len(observations) if observations else None
        ),
    }


def build_strategy_metrics(
    observations: tuple[ReplayObservation, ...],
    outcomes: tuple[ForwardOutcome, ...],
    config: BacktestConfig,
) -> dict[str, object]:
    horizon = 10 if 10 in config.horizons else config.horizons[0]
    outcome_by_key = _outcome_index(outcomes, horizon)
    eligible = tuple(
        item
        for item in observations
        if item.eligibility_status == EligibilityStatus.ELIGIBLE
    )
    strategies: dict[str, Callable[[ReplayObservation], bool]] = {
        "canonical_buy": lambda item: item.recommendation == TraderRecommendation.BUY,
        "price_above_sma20": lambda item: (
            item.sma20 is not None and item.close_price > item.sma20
        ),
        "price_above_sma20_above_sma50": lambda item: (
            item.sma20 is not None
            and item.sma50 is not None
            and item.close_price > item.sma20 > item.sma50
        ),
        "rsi_oversold": lambda item: item.rsi is not None and item.rsi < 30,
    }
    metrics = {
        name: _strategy_summary(
            tuple(item for item in eligible if predicate(item)),
            outcome_by_key,
        )
        for name, predicate in strategies.items()
    }
    pulse = select_pulse_top_k(
        observations,
        threshold=config.pulse_focus_threshold,
        top_k=config.pulse_top_k,
    )
    metrics["pulse_top_k"] = _strategy_summary(pulse, outcome_by_key)
    canonical_buy_outcomes = [
        outcome_by_key[(item.stock_id, item.as_of_date)]
        for item in eligible
        if item.recommendation == TraderRecommendation.BUY
        and (item.stock_id, item.as_of_date) in outcome_by_key
        and outcome_by_key[(item.stock_id, item.as_of_date)].status == "AVAILABLE"
        and outcome_by_key[(item.stock_id, item.as_of_date)].benchmark_return_percent is not None
    ]
    benchmark_returns: list[float] = []
    for outcome in canonical_buy_outcomes:
        if outcome.benchmark_return_percent is not None:
            benchmark_returns.append(outcome.benchmark_return_percent)
    metrics["dsex_benchmark_on_canonical_buy_dates"] = {
        "sample_count": len(benchmark_returns),
        "median_return_percent": _round(
            median(benchmark_returns) if benchmark_returns else None
        ),
        "description": "DSEX close-to-close return over the same signal horizons.",
    }
    metrics["no_trade"] = {
        "candidate_count": 0,
        "assumed_return_percent": 0.0,
        "description": "Predeclared no-exposure baseline.",
    }
    return {"primary_horizon_sessions": horizon, "strategies": metrics}


def build_stratified_metrics(
    observations: tuple[ReplayObservation, ...],
    outcomes: tuple[ForwardOutcome, ...],
    config: BacktestConfig,
) -> dict[str, object]:
    """Stratify canonical BUY outcomes with counts; current category is labeled as a snapshot."""
    horizon = 10 if 10 in config.horizons else config.horizons[0]
    outcome_by_key = _outcome_index(outcomes, horizon)
    buys = tuple(
        item
        for item in observations
        if item.eligibility_status == EligibilityStatus.ELIGIBLE
        and item.recommendation == TraderRecommendation.BUY
    )

    def liquidity_bucket(item: ReplayObservation) -> str:
        turnover = item.median_turnover or 0
        if turnover >= 50_000_000:
            return "HIGH_CAPACITY"
        if turnover >= 10_000_000:
            return "MEDIUM_CAPACITY"
        if turnover >= 2_000_000:
            return "LOW_CAPACITY"
        return "THIN_OR_UNKNOWN"

    def traded_bucket(item: ReplayObservation) -> str:
        ratio = item.traded_session_ratio
        if ratio is None:
            return "UNKNOWN"
        if ratio >= 0.9:
            return "90_TO_100_PERCENT"
        if ratio >= 0.7:
            return "70_TO_90_PERCENT"
        return "BELOW_70_PERCENT"

    dimensions: dict[str, Callable[[ReplayObservation], str]] = {
        "market_regime": lambda item: item.market_regime,
        "sector": lambda item: item.sector or "UNKNOWN",
        "liquidity_capacity": liquidity_bucket,
        "traded_session_coverage": traded_bucket,
        "current_category_snapshot": lambda item: item.category or "UNKNOWN",
    }
    result: dict[str, object] = {"horizon_sessions": horizon}
    for dimension, resolver in dimensions.items():
        grouped: dict[str, list[ReplayObservation]] = defaultdict(list)
        for item in buys:
            grouped[resolver(item)].append(item)
        result[dimension] = {
            key: _strategy_summary(tuple(grouped[key]), outcome_by_key)
            for key in sorted(grouped)
        }
    return result


def _average_ranks(values: list[float]) -> list[float]:
    order = sorted(range(len(values)), key=values.__getitem__)
    ranks = [0.0] * len(values)
    position = 0
    while position < len(order):
        end = position
        while end + 1 < len(order) and values[order[end + 1]] == values[order[position]]:
            end += 1
        average_rank = (position + end + 2) / 2
        for offset in range(position, end + 1):
            ranks[order[offset]] = average_rank
        position = end + 1
    return ranks


def _spearman(left: list[float], right: list[float]) -> float | None:
    if len(left) < 3 or len(left) != len(right):
        return None
    left_ranks = _average_ranks(left)
    right_ranks = _average_ranks(right)
    left_mean = mean(left_ranks)
    right_mean = mean(right_ranks)
    numerator = sum(
        (x - left_mean) * (y - right_mean)
        for x, y in zip(left_ranks, right_ranks, strict=True)
    )
    denominator_left = sum((value - left_mean) ** 2 for value in left_ranks)
    denominator_right = sum((value - right_mean) ** 2 for value in right_ranks)
    denominator = (denominator_left * denominator_right) ** 0.5
    return numerator / denominator if denominator else None


def build_pulse_metrics(
    observations: tuple[ReplayObservation, ...],
    outcomes: tuple[ForwardOutcome, ...],
    config: BacktestConfig,
) -> dict[str, object]:
    horizon = 10 if 10 in config.horizons else config.horizons[0]
    outcome_by_key = _outcome_index(outcomes, horizon)
    selected = select_pulse_top_k(
        observations,
        threshold=config.pulse_focus_threshold,
        top_k=config.pulse_top_k,
    )
    selected_summary = _strategy_summary(selected, outcome_by_key)
    eligible_pairs = [
        (item, outcome_by_key.get((item.stock_id, item.as_of_date)))
        for item in observations
        if item.eligibility_status == EligibilityStatus.ELIGIBLE
    ]
    available_pairs: list[tuple[ReplayObservation, ForwardOutcome]] = []
    for item, outcome in eligible_pairs:
        if (
            outcome is not None
            and outcome.status == "AVAILABLE"
            and outcome.excess_return_percent is not None
        ):
            available_pairs.append((item, outcome))
    universe_excess = [
        outcome.excess_return_percent
        for _, outcome in available_pairs
        if outcome.excess_return_percent is not None
    ]
    rank_ic = _spearman(
        [float(item.pulse_score) for item, _ in available_pairs],
        universe_excess,
    )
    selected_excess: list[float] = []
    for item in selected:
        outcome = outcome_by_key.get((item.stock_id, item.as_of_date))
        if (
            outcome is not None
            and outcome.status == "AVAILABLE"
            and outcome.excess_return_percent is not None
        ):
            selected_excess.append(outcome.excess_return_percent)
    return {
        "horizon_sessions": horizon,
        "threshold": config.pulse_focus_threshold,
        "top_k": config.pulse_top_k,
        "selection": selected_summary,
        "spearman_rank_ic": _round(rank_ic),
        "mean_selected_excess_return_percent": _round(
            mean(selected_excess) if selected_excess else None
        ),
        "mean_eligible_universe_excess_return_percent": _round(
            mean(universe_excess) if universe_excess else None
        ),
        "top_k_lift_percent_points": _round(
            mean(selected_excess) - mean(universe_excess)
            if selected_excess and universe_excess
            else None
        ),
    }


def build_calibration_diagnostic(
    observations: tuple[ReplayObservation, ...],
    outcomes: tuple[ForwardOutcome, ...],
    config: BacktestConfig,
    frozen_test: FrozenTestPeriod | None,
) -> dict[str, object]:
    event_definition = (
        "Positive DSEX-relative return after modeled round-trip costs at 10 exchange sessions."
    )
    if frozen_test is None or 10 not in config.horizons:
        return {
            "event_definition": event_definition,
            "sample_count": 0,
            "probability_exposed": False,
            "reason": "No frozen 10-session test period is available.",
        }

    outcome_by_key = _outcome_index(outcomes, 10)
    samples: list[tuple[float, int]] = []
    for observation in observations:
        if not frozen_test.start <= observation.as_of_date <= frozen_test.end:
            continue
        if observation.recommendation != TraderRecommendation.BUY:
            continue
        outcome = outcome_by_key.get((observation.stock_id, observation.as_of_date))
        if (
            outcome is None
            or outcome.status != "AVAILABLE"
            or outcome.excess_return_percent is None
        ):
            continue
        samples.append(
            (
                observation.evidence_strength / 100,
                int(outcome.excess_return_percent > 0),
            )
        )

    if not samples:
        return {
            "event_definition": event_definition,
            "sample_count": 0,
            "probability_exposed": False,
            "reason": "No held-out canonical BUY outcome has complete benchmark coverage.",
        }

    base_rate = mean(label for _, label in samples)
    brier = mean((score - label) ** 2 for score, label in samples)
    base_brier = mean((base_rate - label) ** 2 for _, label in samples)
    buckets: list[dict[str, object]] = []
    empirical_rates: list[float] = []
    for lower in range(0, 100, 20):
        upper = lower + 20
        bucket = [
            (score, label)
            for score, label in samples
            if lower / 100 <= score <= upper / 100
            and (upper == 100 or score < upper / 100)
        ]
        if not bucket:
            continue
        event_rate = mean(label for _, label in bucket)
        empirical_rates.append(event_rate)
        buckets.append(
            {
                "score_range": f"{lower}-{upper}",
                "sample_count": len(bucket),
                "mean_evidence_score": _round(mean(score for score, _ in bucket)),
                "event_rate": _round(event_rate),
            }
        )
    monotonic = all(
        current >= previous
        for previous, current in zip(empirical_rates, empirical_rates[1:], strict=False)
    )
    adequate = len(samples) >= 100 and monotonic and brier < base_brier
    return {
        "event_definition": event_definition,
        "held_out_start": frozen_test.start,
        "held_out_end": frozen_test.end,
        "sample_count": len(samples),
        "base_rate": _round(base_rate),
        "evidence_score_brier_diagnostic": _round(brier),
        "base_rate_brier": _round(base_brier),
        "reliability_buckets": buckets,
        "bucket_event_rate_monotonic": monotonic,
        "eligible_to_expose_probability": adequate,
        "probability_exposed": False,
        "reason": (
            "Production contracts retain heuristic evidence semantics; a diagnostic alone does "
            "not create a calibrated probability."
        ),
    }


def build_sensitivity_results(
    observations: tuple[ReplayObservation, ...],
    outcomes: tuple[ForwardOutcome, ...],
    config: BacktestConfig,
) -> tuple[dict[str, object], ...]:
    horizon = 10 if 10 in config.horizons else config.horizons[0]
    outcome_by_key = _outcome_index(outcomes, horizon)
    buys = tuple(
        item
        for item in observations
        if item.eligibility_status == EligibilityStatus.ELIGIBLE
        and item.recommendation == TraderRecommendation.BUY
    )
    available_buy_returns = [
        outcome.net_return_percent
        for item in buys
        if (outcome := outcome_by_key.get((item.stock_id, item.as_of_date))) is not None
        and outcome.status == "AVAILABLE"
        and outcome.net_return_percent is not None
    ]
    results: list[dict[str, object]] = []
    for cost_bps in config.sensitivity_cost_bps:
        adjustment = 2 * (cost_bps - config.one_way_cost_bps) / 100
        adjusted = [value - adjustment for value in available_buy_returns]
        results.append(
            {
                "kind": "one_way_cost_bps",
                "value": cost_bps,
                "sample_count": len(adjusted),
                "canonical_buy_median_net_return_percent": _round(
                    median(adjusted) if adjusted else None
                ),
            }
        )
    for threshold in config.sensitivity_pulse_thresholds:
        selected = select_pulse_top_k(
            observations,
            threshold=threshold,
            top_k=config.pulse_top_k,
        )
        summary = _strategy_summary(selected, outcome_by_key)
        results.append(
            {
                "kind": "pulse_focus_threshold",
                "value": threshold,
                "candidate_count": summary["candidate_count"],
                "positive_excess_hit_rate": summary["positive_excess_hit_rate"],
                "median_excess_return_percent": summary["median_excess_return_percent"],
            }
        )
    return tuple(results)
