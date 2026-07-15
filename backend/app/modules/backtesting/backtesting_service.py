from __future__ import annotations

from collections import Counter

from app.core.enums import EligibilityStatus
from app.modules.backtesting.backtesting_engine import replay_canonical_engine
from app.modules.backtesting.backtesting_manifest import build_replay_manifest
from app.modules.backtesting.backtesting_metrics import (
    build_calibration_diagnostic,
    build_decision_metrics,
    build_pulse_metrics,
    build_sensitivity_results,
    build_strategy_metrics,
    build_stratified_metrics,
)
from app.modules.backtesting.backtesting_models import (
    BacktestConfig,
    BacktestReport,
)
from app.modules.backtesting.backtesting_repository import BacktestingRepository
from app.modules.backtesting.backtesting_walk_forward import build_walk_forward_splits


class BacktestingService:
    def __init__(self, repository: BacktestingRepository) -> None:
        self.repository = repository

    async def run(self, config: BacktestConfig) -> BacktestReport:
        dataset = await self.repository.load_dataset(config)
        observations, outcomes = replay_canonical_engine(dataset, config)
        manifest = build_replay_manifest(config, dataset, observations, outcomes)
        observation_session_dates = tuple(
            sorted({observation.as_of_date for observation in observations})
        )
        folds, frozen_test = build_walk_forward_splits(observation_session_dates, config)
        outcome_statuses = Counter(outcome.status for outcome in outcomes)
        eligible_count = sum(
            observation.eligibility_status == EligibilityStatus.ELIGIBLE
            for observation in observations
        )
        limitations = list(dataset.limitations)
        if not folds:
            limitations.append(
                "The available post-warmup signal history is too short for one validation fold "
                "after max-horizon purging and the frozen-test reservation."
            )
        if eligible_count == 0:
            limitations.append(
                "No replay observation passed the current ELIGIBLE policy; canonical BUY, Pulse "
                "top-k, and held-out calibration conclusions are unavailable for this run."
            )
        return BacktestReport(
            config=config,
            manifest=manifest,
            session_count=len(dataset.session_dates),
            stock_count=len(dataset.histories),
            observation_count=len(observations),
            outcome_count=len(outcomes),
            folds=folds,
            frozen_test=frozen_test,
            coverage={
                "history_start": dataset.session_dates[0] if dataset.session_dates else None,
                "history_end": dataset.session_dates[-1] if dataset.session_dates else None,
                "market_summary_rows": len(dataset.market_summaries),
                "signal_session_count": len(observation_session_dates),
                "stocks_with_stored_corporate_actions": sum(
                    bool(history.corporate_action_dates) for history in dataset.histories
                ),
                "outcome_status_counts": dict(sorted(outcome_statuses.items())),
            },
            decision_metrics=build_decision_metrics(observations),
            strategy_metrics=build_strategy_metrics(observations, outcomes, config),
            stratified_metrics=build_stratified_metrics(observations, outcomes, config),
            pulse_metrics=build_pulse_metrics(observations, outcomes, config),
            calibration=build_calibration_diagnostic(
                observations,
                outcomes,
                config,
                frozen_test,
            ),
            sensitivity=build_sensitivity_results(observations, outcomes, config),
            limitations=tuple(limitations),
        )
