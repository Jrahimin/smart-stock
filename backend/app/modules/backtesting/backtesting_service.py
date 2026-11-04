from __future__ import annotations

from dataclasses import replace

from app.modules.backtesting.backtesting_archive import dataset_archive
from app.modules.backtesting.backtesting_engine import replay_canonical_engine
from app.modules.backtesting.backtesting_evaluation import evaluate_replay, reconcile_coverage
from app.modules.backtesting.backtesting_manifest import build_replay_manifest
from app.modules.backtesting.backtesting_models import BacktestConfig, BacktestReport
from app.modules.backtesting.backtesting_repository import BacktestingRepository
from app.modules.backtesting.backtesting_research import evaluate_challengers
from app.modules.backtesting.backtesting_walk_forward import build_walk_forward_splits


def run_dataset(dataset, config: BacktestConfig, *, sensitivities=True) -> BacktestReport:
    observations, outcomes = replay_canonical_engine(dataset, config)
    # Reserve enough future sessions for the longest configured label and conditional expiry.
    mature_dates = tuple(
        sorted(
            {
                item.as_of_date
                for item in observations
                if sum(day > item.as_of_date for day in dataset.session_dates)
                >= max(config.horizons) + max(1, item.expiry_sessions or 1)
            }
        )
    )
    folds, frozen = build_walk_forward_splits(mature_dates, config)
    partitions, audit, markouts = evaluate_replay(dataset, config, observations, folds, frozen)
    audit["dataset"] = dataset_archive(dataset)
    descriptive = partitions["all_descriptive"]
    baseline = descriptive["strategies"]["corrected_engine"]
    sensitivity = []
    if sensitivities:
        variants = [
            ("one_way_cost_bps", value, replace(config, one_way_cost_bps=value))
            for value in config.sensitivity_cost_bps
        ]
        variants += [
            ("order_value_bdt", value, replace(config, order_value_bdt=value))
            for value in config.sensitivity_order_values
        ]
        variants += [("slippage_multiplier", 2.0, replace(config, slippage_multiplier=2.0))]
        # Unknown constraints are bounded assumptions only, never verified execution evidence.
        variants += [
            (
                "unverified_rules",
                label,
                replace(
                    config,
                    unknown_rule_policy="assume",
                    assumed_tick_size=tick,
                    assumed_lot_size=lot,
                    assumed_settlement_sessions=settle,
                ),
            )
            for label, tick, lot, settle in (
                ("tick0.1_lot1_T2", 0.1, 1, 2),
                ("tick1_lot100_T3", 1.0, 100, 3),
            )
        ]
        from app.modules.backtesting.backtesting_evaluation import (
            common_markouts,
            evaluate_selections,
            observation_key,
            partition_observations,
            strategy_selections,
            summarize_policy,
        )

        for kind, value, variant in variants:
            selected, policy = strategy_selections(observations, variant)["corrected_engine"]
            executions, variant_outcomes = evaluate_selections(selected, dataset, variant, policy)
            marks = common_markouts(observations, dataset, variant)
            variant_partitions = partition_observations(
                observations, marks + variant_outcomes, folds, frozen, variant, dataset
            )
            variant_reports = {}
            for name, partition_rows in variant_partitions.items():
                keys = {observation_key(row) for row in partition_rows}
                subset = tuple(row for row in selected if observation_key(row) in keys)
                variant_reports[name] = summarize_policy(
                    partition_rows, subset, executions, variant_outcomes, marks, dataset, variant
                )
            sensitivity.append(
                {
                    "kind": kind,
                    "value": value,
                    "partitions": variant_reports,
                }
            )
    limitations = tuple(dataset.limitations) + (
        "50 bps each way plus liquidity slippage are research assumptions, not "
        "verified broker fees.",
        "Stock open-entry policy excess returns are unavailable without matching "
        "benchmark opens; ranking uses same-date close-to-close total-return markouts.",
        "Rule exclusions are the default. Unverified-rule sensitivities do not "
        "establish tradability or promotion eligibility.",
        "All-descriptive metrics include immature selections. Fold training labels are "
        "purged by actual outcome end; no transformations are fitted.",
    )
    if not folds:
        limitations += (
            "Insufficient chronological history for a validation fold; predictive "
            "conclusions unsupported.",
        )
    research = evaluate_challengers(dataset, config, observations, markouts, folds, frozen)
    manifest = build_replay_manifest(
        config, dataset, observations, outcomes, audit=audit, research=research
    )
    return BacktestReport(
        config,
        manifest,
        len(dataset.session_dates),
        len(dataset.histories),
        len(observations),
        len(outcomes),
        folds,
        frozen,
        reconcile_coverage(dataset, config, observations),
        descriptive["decision_metrics"],
        descriptive["strategies"],
        {horizon: result["stratified"] for horizon, result in baseline["by_horizon"].items()},
        descriptive["strategies"]["pulse_top_k"],
        {
            "probability_exposed": False,
            "status": "NOT_ASSESSED",
            "reason": "Heuristic evidence is not a probability.",
        },
        tuple(sensitivity),
        limitations,
        partitions=partitions,
        audit=audit,
        research=research,
    )


class BacktestingService:
    def __init__(self, repository: BacktestingRepository) -> None:
        self.repository = repository

    async def run(self, config: BacktestConfig) -> BacktestReport:
        return run_dataset(await self.repository.load_dataset(config), config)
