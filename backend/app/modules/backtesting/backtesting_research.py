"""Frozen challenger comparisons on the same partitions and independent promotion gates."""

from dataclasses import asdict, replace

from app.modules.backtesting.backtesting_challengers import (
    EXPERIMENT,
    EXPERIMENT_ID,
    challenger_ranking,
    enrich_features,
    variants,
)
from app.modules.backtesting.backtesting_evaluation import (
    evaluate_selections,
    observation_key,
    rank_metrics,
    summarize_policy,
    top_five,
)
from app.modules.backtesting.backtesting_promotion import (
    coverage_evidence,
    entry_policy_gate,
    ranking_gate,
)


def evaluate_challengers(dataset, config, observations, markouts, folds, frozen):
    rows = enrich_features(observations, dataset)
    partitions = {"all_descriptive": rows}
    for fold in folds:
        partitions[f"fold_{fold.fold}_train"] = tuple(
            row for row in rows if fold.train_start <= row.as_of_date <= fold.train_end
        )
        partitions[f"fold_{fold.fold}_validation"] = tuple(
            row for row in rows if fold.validation_start <= row.as_of_date <= fold.validation_end
        )
    partitions["frozen_test"] = tuple(
        row for row in rows if frozen and frozen.start <= row.as_of_date <= frozen.end
    )
    evidence = coverage_evidence(dataset, partitions["frozen_test"], config)
    evidence["comparison_invariants_verified"] = True
    report = {
        "experiment_id": EXPERIMENT_ID,
        "predeclared_protocol": EXPERIMENT,
        "evidence": evidence,
        "production_changes": False,
        "ranking_challengers": {},
        "model": {"status": "NOT_FIT", "reason": EXPERIMENT["model"]},
        "features": [
            {
                "stock_id": str(row.stock_id),
                "as_of_date": row.as_of_date,
                "values": dict(row.research_features),
            }
            for row in rows
        ],
    }
    baseline_selected = top_five(rows)
    baseline_executions, baseline_outcomes = evaluate_selections(
        baseline_selected, dataset, config, "canonical-plan-v1"
    )
    horizon = 10 if 10 in config.horizons else config.horizons[0]
    for variant, families in variants().items():
        selected, ranking, coverage = challenger_ranking(rows, families)
        executions, outcomes = evaluate_selections(selected, dataset, config, "canonical-plan-v1")
        metrics = {}
        for name, partition in partitions.items():
            boundary = None
            if name.endswith("_train"):
                number = int(name.split("_")[1])
                boundary = next(fold.validation_start for fold in folds if fold.fold == number)
            elif name.endswith("_validation") and frozen:
                boundary = frozen.start
            if boundary:
                end_by_key = {}
                for out in (*markouts, *outcomes, *baseline_outcomes):
                    end_by_key.setdefault(observation_key(out), []).append(out.outcome_end_date)
                partition = tuple(
                    row
                    for row in partition
                    if end_by_key.get(observation_key(row))
                    and all(
                        end is not None and end < boundary
                        for end in end_by_key[observation_key(row)]
                    )
                )
            keys = {observation_key(row) for row in partition}
            subset = tuple(row for row in selected if observation_key(row) in keys)
            metrics[name] = summarize_policy(
                partition, subset, executions, outcomes, markouts, dataset, config, ranking
            )
        heldout = partitions["frozen_test"]
        heldout_keys = {observation_key(row) for row in heldout}
        base_selected = tuple(
            row for row in baseline_selected if observation_key(row) in heldout_keys
        )
        other_selected = tuple(row for row in selected if observation_key(row) in heldout_keys)
        _, _, heldout_coverage = challenger_ranking(heldout, families)
        gate_evidence = dict(evidence)
        if 10 not in config.horizons:
            gate_evidence["coverage_gaps"] = [
                *evidence["coverage_gaps"],
                "PRIMARY_TEN_SESSION_HORIZON_ABSENT",
            ]
        gate = ranking_gate(
            rank_metrics(heldout, base_selected, markouts, horizon),
            rank_metrics(heldout, other_selected, markouts, horizon, ranking),
            base_selected,
            other_selected,
            gate_evidence,
            feature_coverage=heldout_coverage,
        )
        report["ranking_challengers"][variant] = {
            "version": f"{EXPERIMENT['version']}:{variant}",
            "families": families,
            "feature_coverage": coverage,
            "partitions": metrics,
            "promotion": gate,
            "selections": [
                {"stock_id": str(row.stock_id), "as_of_date": row.as_of_date} for row in selected
            ],
            "executions": [
                {"stock_id": str(sid), "as_of_date": day, **asdict(value)}
                for (sid, day), value in executions.items()
            ],
            "outcomes": [asdict(out) for out in outcomes],
        }
    # Entry experiment: the exact same ranking/candidates and all canonical safeguards.
    policy = EXPERIMENT["entry_challenger"]
    tighter = replace(config, maximum_entry_gap_percent=policy["maximum_entry_gap_percent"])
    other_executions, other_outcomes = evaluate_selections(
        baseline_selected, dataset, tighter, policy["version"]
    )
    entry_partitions = {}
    for name, partition in partitions.items():
        boundary = None
        if name.endswith("_train"):
            boundary = next(
                fold.validation_start for fold in folds if fold.fold == int(name.split("_")[1])
            )
        elif name.endswith("_validation") and frozen:
            boundary = frozen.start
        if boundary:
            ends = {}
            for out in (*markouts, *baseline_outcomes, *other_outcomes):
                ends.setdefault(observation_key(out), []).append(out.outcome_end_date)
            partition = tuple(
                row
                for row in partition
                if ends.get(observation_key(row))
                and all(end is not None and end < boundary for end in ends[observation_key(row)])
            )
        keys = {observation_key(row) for row in partition}
        selected = tuple(row for row in baseline_selected if observation_key(row) in keys)
        entry_partitions[name] = {
            "baseline": summarize_policy(
                partition,
                selected,
                baseline_executions,
                baseline_outcomes,
                markouts,
                dataset,
                config,
            ),
            "challenger": summarize_policy(
                partition, selected, other_executions, other_outcomes, markouts, dataset, tighter
            ),
        }
    selected = tuple(
        row
        for row in baseline_selected
        if observation_key(row) in {observation_key(row) for row in partitions["frozen_test"]}
    )
    keys = {observation_key(row) for row in selected}
    base_index = {
        observation_key(out): out
        for out in baseline_outcomes
        if out.horizon_sessions == horizon and observation_key(out) in keys
    }
    other_index = {
        observation_key(out): out
        for out in other_outcomes
        if out.horizon_sessions == horizon and observation_key(out) in keys
    }
    entry_evidence = {
        **evidence,
        "coverage_verified": evidence["canonical_coverage_verified"],
        "coverage_gaps": evidence["canonical_coverage_gaps"],
    }
    if 10 not in config.horizons:
        entry_evidence["coverage_gaps"] = [
            *evidence["coverage_gaps"],
            "PRIMARY_TEN_SESSION_HORIZON_ABSENT",
        ]
    gate = entry_policy_gate(
        entry_partitions["frozen_test"]["baseline"]["by_horizon"][str(horizon)]["portfolio"],
        entry_partitions["frozen_test"]["challenger"]["by_horizon"][str(horizon)]["portfolio"],
        selected,
        {key: baseline_executions[key] for key in keys},
        {key: other_executions[key] for key in keys},
        base_index,
        other_index,
        entry_evidence,
    )
    report["entry_policy_challenger"] = {
        "version": policy["version"],
        "ranking_fixed": True,
        "partitions": entry_partitions,
        "promotion": gate,
        "executions": [
            {"stock_id": str(sid), "as_of_date": day, **asdict(value)}
            for (sid, day), value in other_executions.items()
        ],
        "outcomes": [asdict(out) for out in other_outcomes],
    }
    return report
