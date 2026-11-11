"""Explicit, once-only formal comparison of sealed forward receipt evidence."""
from dataclasses import fields, replace
from datetime import date, datetime
from uuid import UUID

from app.core.audit_hashing import canonicalize_audit_value, stable_audit_hash
from app.core.constants.trading_constants import TRADING_STRATEGY_VERSION
from app.modules.backtesting.backtesting_challengers import EXPERIMENT, EXPERIMENT_ID
from app.modules.backtesting.backtesting_evaluation import rank_metrics, observation_key
from app.modules.backtesting.backtesting_models import ForwardOutcome, ExecutionResult
from app.modules.backtesting.backtesting_promotion import coverage_evidence, ranking_gate, entry_policy_gate
from app.modules.backtesting.backtesting_shadow_repository import TradingShadowRepository


def restore_outcome(payload):
    value = {field.name: payload[field.name] for field in fields(ForwardOutcome) if field.name in payload}
    for key in ("as_of_date", "horizon_date", "outcome_end_date"):
        if value.get(key):
            value[key] = date.fromisoformat(value[key])
    value["stock_id"] = UUID(value["stock_id"])
    return ForwardOutcome(**value)


def restore_execution(payload):
    value = dict(payload)
    for key in ("execution_date", "activation_date", "settlement_date"):
        if value.get(key):
            value[key] = date.fromisoformat(value[key])
    return ExecutionResult(**value)


def endpoint_mature(cohort, latest, dataset):
    """Empty dates advance the clock, but still wait for the primary calendar label."""
    for selection in cohort:
        payload = latest[selection.id].payload
        rows = [row for values in selection.payload["entry_arms"].values() for row in values]
        required = 10 + max((row.get("expiry_sessions") or 1 for row in rows), default=0)
        through = date.fromisoformat(payload["through_date"])
        if sum(selection.session_date < day <= through for day in dataset.session_dates) < required:
            return False
        if any(row.get("status") in {"INSUFFICIENT_HORIZON", "EXIT_BLOCKED"} for kind in ("ranking_arms", "entry_arms")
            for values in payload[kind].values() for row in values):
            return False
    return True


async def assess_shadow_receipts(session, dataset, *, exchange, strategy_version=TRADING_STRATEGY_VERSION):
    from app.modules.backtesting.backtesting_shadow import active_receipt_cohort, assessment_valid, receipt_rows, restore_shadow_config
    repository = TradingShadowRepository(session)
    if not await repository.available():
        return {"status": "SCHEMA_UNAVAILABLE", "promoted": False}
    existing = await repository.assessment(exchange=exchange, experiment_id=EXPERIMENT_ID, strategy_version=strategy_version)
    if existing:
        active, latest, _ = await active_receipt_cohort(repository, exchange, strategy_version)
        if not await assessment_valid(repository, existing, active, latest):
            return {"status": "ASSESSMENT_INVALIDATED_OR_SUPERSEDED", "assessment_id": str(existing.id), "promoted": False, "reused": True}
        return {**existing.payload, "assessment_id": str(existing.id), "reused": True}
    _, latest, cohort = await active_receipt_cohort(repository, exchange, strategy_version)
    if len(cohort) != EXPERIMENT["forward_cohort"]["selection_sessions"]:
        return {"status": "AWAITING_FROZEN_ENDPOINT", "eligible_cohort_dates": len(cohort), "promoted": False}
    if not endpoint_mature(cohort, latest, dataset):
        return {"status": "AWAITING_PRIMARY_MATURITY", "eligible_cohort_dates": len(cohort), "promoted": False}
    config = restore_shadow_config(cohort[0].payload["config"])
    def confirmed_rows(selection, kind, arm=None):
        # This is an availability projection over immutable bytes, not a new
        # selection. The later calendar receipt verifies the previously unknown deadline.
        deadline = datetime.fromisoformat(latest[selection.id].payload["next_open_at"])
        return tuple(replace(row, replay_classification="TIMELY_CAPTURED", next_open_at=deadline)
            for row in receipt_rows(selection, kind, arm))
    universe = tuple(row for selection in cohort if "universe" in selection.payload for row in confirmed_rows(selection, "universe"))
    arms = {kind: {arm: tuple(row for selection in cohort for row in confirmed_rows(selection, kind, arm))
        for arm in ("baseline", "challenger")} for kind in ("ranking_arms", "entry_arms")}
    markouts = tuple(restore_outcome(row) for selection in cohort for row in latest[selection.id].payload.get("universe_markouts", ()))
    evidence = coverage_evidence(dataset, universe, config)
    evidence["comparison_invariants_verified"] = bool(universe) and len({observation_key(row) for row in universe}) == len(universe)
    if any("universe" not in row.payload for row in cohort):
        evidence["coverage_gaps"].append("FROZEN_UNIVERSE_MISSING")
        evidence["coverage_verified"] = False
    feature_coverage = {"available": sum(row.payload["feature_coverage"]["available"] for row in cohort),
        "total": sum(row.payload["feature_coverage"]["total"] for row in cohort)}
    ranking = ranking_gate(rank_metrics(universe, arms["ranking_arms"]["baseline"], markouts, 10),
        rank_metrics(universe, arms["ranking_arms"]["challenger"], markouts, 10),
        arms["ranking_arms"]["baseline"], arms["ranking_arms"]["challenger"], evidence, feature_coverage=feature_coverage)
    entries, executions = {}, {}
    for arm in ("baseline", "challenger"):
        values = [row for selection in cohort for row in latest[selection.id].payload["entry_arms"][arm]]
        entries[arm] = {observation_key(out): out for row in values if "horizon_sessions" in row for out in (restore_outcome(row),)}
        executions[arm] = {(row.stock_id, row.as_of_date): restore_execution(value["execution"])
            for row, value in zip(arms["entry_arms"][arm], values) if value.get("execution")}
    portfolios = latest[cohort[-1].id].payload["portfolios"]
    entry_evidence = coverage_evidence(dataset, tuple(arms["entry_arms"]["baseline"]), config, families=())
    entry_evidence["comparison_invariants_verified"] = {observation_key(row) for row in arms["entry_arms"]["baseline"]} == {observation_key(row) for row in arms["entry_arms"]["challenger"]}
    if not all(portfolios[arm].get("acceptance_verified") for arm in portfolios):
        entry_evidence["coverage_gaps"].append("PORTFOLIO_ACCEPTANCE_UNKNOWN")
        entry_evidence["coverage_verified"] = False
    entry = entry_policy_gate(portfolios["baseline"], portfolios["challenger"], arms["entry_arms"]["baseline"],
        executions["baseline"], executions["challenger"], entries["baseline"], entries["challenger"], entry_evidence)
    payload = canonicalize_audit_value({"kind": "FORMAL_ASSESSMENT", "status": "ASSESSED_AT_FROZEN_ENDPOINT",
        "experiment_id": EXPERIMENT_ID, "strategy_version": strategy_version, "primary_horizon": 10,
        "selection_dates": 120, "selection_ids": [str(row.id) for row in cohort],
        "selection_hashes": {str(row.id): row.record_hash for row in cohort},
        "outcome_ids": {str(row.id): str(latest[row.id].id) for row in cohort},
        "outcome_revisions": {str(row.id): latest[row.id].outcome_revision for row in cohort},
        "ranking": ranking, "entry": entry, "promoted": False})
    revision = stable_audit_hash({"kind": "FORMAL_ASSESSMENT", "experiment": EXPERIMENT_ID, "strategy": strategy_version})
    stored = await repository.record_outcome(cohort[-1], through_date=dataset.session_dates[-1], revision=revision, payload=payload)
    return {**stored.payload, "assessment_id": str(stored.id), "reused": False}
