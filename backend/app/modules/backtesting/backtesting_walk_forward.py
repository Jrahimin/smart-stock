from __future__ import annotations

from app.modules.backtesting.backtesting_models import (
    BacktestConfig,
    FrozenTestPeriod,
    WalkForwardSplit,
)


def build_walk_forward_splits(
    session_dates: tuple,
    config: BacktestConfig,
) -> tuple[tuple[WalkForwardSplit, ...], FrozenTestPeriod | None]:
    """Build chronological folds with a max-horizon purge before validation/test."""
    if not session_dates:
        return (), None

    purge = max(config.horizons)
    test_count = min(config.frozen_test_sessions, len(session_dates))
    test_start_index = len(session_dates) - test_count
    frozen = (
        FrozenTestPeriod(
            start=session_dates[test_start_index],
            end=session_dates[-1],
            sessions=test_count,
        )
        if test_count > 0
        else None
    )

    validation_limit = max(0, test_start_index - purge)
    folds: list[WalkForwardSplit] = []
    validation_start = config.initial_train_sessions + purge
    fold_number = 1
    while validation_start + config.validation_sessions <= validation_limit:
        validation_end = validation_start + config.validation_sessions - 1
        train_end = validation_start - purge - 1
        if config.walk_forward_mode == "rolling":
            train_start = max(0, train_end - config.rolling_train_sessions + 1)
        else:
            train_start = 0
        if train_end < train_start:
            break
        folds.append(
            WalkForwardSplit(
                fold=fold_number,
                train_start=session_dates[train_start],
                train_end=session_dates[train_end],
                validation_start=session_dates[validation_start],
                validation_end=session_dates[validation_end],
                purged_sessions=purge,
                mode=config.walk_forward_mode,
            )
        )
        fold_number += 1
        validation_start += config.validation_sessions
    return tuple(folds), frozen

