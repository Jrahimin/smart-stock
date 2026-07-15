from __future__ import annotations

from bisect import bisect_right
from datetime import date

from app.models import DailyMarketSummary
from app.modules.backtesting.backtesting_models import (
    BacktestConfig,
    ExecutionResult,
    ForwardOutcome,
    ReplayObservation,
    StockReplayHistory,
)


def _slippage_bps(median_turnover: float | None, config: BacktestConfig) -> float:
    turnover = median_turnover or 0.0
    ordered = sorted(
        config.slippage_tiers,
        key=lambda tier: tier.minimum_median_turnover,
        reverse=True,
    )
    return next(
        (
            tier.slippage_bps
            for tier in ordered
            if turnover >= tier.minimum_median_turnover
        ),
        ordered[-1].slippage_bps,
    )


def simulate_next_session_execution(
    observation: ReplayObservation,
    history: StockReplayHistory,
    session_dates: tuple[date, ...],
    config: BacktestConfig,
) -> ExecutionResult:
    """Use exactly the next exchange session; never fill at the signal close or carry forward."""
    next_index = bisect_right(session_dates, observation.as_of_date)
    if next_index >= len(session_dates):
        return ExecutionResult(status="NO_NEXT_SESSION")

    execution_date = session_dates[next_index]
    price_by_date = {price.trade_date: price for price in history.prices}
    bar = price_by_date.get(execution_date)
    if bar is None:
        return ExecutionResult(status="NO_STOCK_BAR", execution_date=execution_date)
    if execution_date in history.suspension_dates:
        return ExecutionResult(status="SUSPENDED", execution_date=execution_date)
    if execution_date in history.circuit_locked_dates:
        return ExecutionResult(status="CIRCUIT_LOCKED", execution_date=execution_date)
    if bar.volume <= 0:
        return ExecutionResult(status="ZERO_VOLUME", execution_date=execution_date)

    raw_price = float(bar.open_price if config.execution_price == "open" else bar.close_price)
    if raw_price <= 0:
        return ExecutionResult(status="INVALID_EXECUTION_PRICE", execution_date=execution_date)

    capacity = (observation.median_turnover or 0.0) * config.maximum_turnover_fraction
    if capacity <= 0 or config.order_value_bdt > capacity:
        return ExecutionResult(status="CAPACITY_EXCEEDED", execution_date=execution_date)

    slippage = _slippage_bps(observation.median_turnover, config)
    return ExecutionResult(
        status="FILLED",
        execution_date=execution_date,
        raw_price=raw_price,
        fill_price=raw_price * (1 + slippage / 10_000),
        slippage_bps=slippage,
    )


def _benchmark_close_by_date(
    summaries: tuple[DailyMarketSummary, ...],
) -> dict[date, float]:
    preferred = [row for row in summaries if row.index_name == "DSEX"]
    relevant = preferred or [row for row in summaries if row.index_name == "GENERAL"]
    return {
        row.trade_date: float(row.index_close)
        for row in relevant
        if row.index_close is not None and row.index_close > 0
    }


def compute_forward_outcome(
    observation: ReplayObservation,
    execution: ExecutionResult,
    history: StockReplayHistory,
    session_dates: tuple[date, ...],
    market_summaries: tuple[DailyMarketSummary, ...],
    config: BacktestConfig,
    horizon_sessions: int,
) -> ForwardOutcome:
    if not execution.is_filled or execution.fill_price is None:
        return ForwardOutcome(
            stock_id=observation.stock_id,
            as_of_date=observation.as_of_date,
            horizon_sessions=horizon_sessions,
            status="UNFILLED",
            execution_status=execution.status,
        )

    signal_index = bisect_right(session_dates, observation.as_of_date) - 1
    horizon_index = signal_index + horizon_sessions
    if signal_index < 0 or horizon_index >= len(session_dates):
        return ForwardOutcome(
            stock_id=observation.stock_id,
            as_of_date=observation.as_of_date,
            horizon_sessions=horizon_sessions,
            status="INSUFFICIENT_HORIZON",
            execution_status=execution.status,
        )

    horizon_date = session_dates[horizon_index]
    price_by_date = {price.trade_date: price for price in history.prices}
    horizon_bar = price_by_date.get(horizon_date)
    if horizon_bar is None:
        return ForwardOutcome(
            stock_id=observation.stock_id,
            as_of_date=observation.as_of_date,
            horizon_sessions=horizon_sessions,
            status="NO_HORIZON_BAR",
            execution_status=execution.status,
            horizon_date=horizon_date,
        )
    if horizon_bar.volume <= 0:
        return ForwardOutcome(
            stock_id=observation.stock_id,
            as_of_date=observation.as_of_date,
            horizon_sessions=horizon_sessions,
            status="ZERO_VOLUME_AT_HORIZON",
            execution_status=execution.status,
            horizon_date=horizon_date,
        )

    unresolved_actions = [
        action_date
        for action_date in history.corporate_action_dates
        if observation.as_of_date < action_date <= horizon_date
    ]
    if unresolved_actions and any(
        price.adjusted_close_price is None
        for price in history.prices
        if observation.as_of_date <= price.trade_date <= horizon_date
    ):
        return ForwardOutcome(
            stock_id=observation.stock_id,
            as_of_date=observation.as_of_date,
            horizon_sessions=horizon_sessions,
            status="CORPORATE_ACTION_UNRESOLVED",
            execution_status=execution.status,
            horizon_date=horizon_date,
        )

    raw_close_return = (
        (float(horizon_bar.close_price) / observation.close_price - 1) * 100
        if observation.close_price > 0
        else None
    )
    exit_price = float(horizon_bar.close_price) * (
        1 - ((execution.slippage_bps or 0) + config.one_way_cost_bps) / 10_000
    )
    entry_cost_price = execution.fill_price * (1 + config.one_way_cost_bps / 10_000)
    net_return = (exit_price / entry_cost_price - 1) * 100

    benchmark = _benchmark_close_by_date(market_summaries)
    benchmark_return: float | None = None
    if observation.as_of_date in benchmark and horizon_date in benchmark:
        benchmark_return = (
            benchmark[horizon_date] / benchmark[observation.as_of_date] - 1
        ) * 100

    path = [
        float(price.close_price)
        for price in history.prices
        if execution.execution_date is not None
        and execution.execution_date <= price.trade_date <= horizon_date
        and price.volume > 0
    ]
    mfe = (max(path) / entry_cost_price - 1) * 100 if path else None
    mae = (min(path) / entry_cost_price - 1) * 100 if path else None
    return ForwardOutcome(
        stock_id=observation.stock_id,
        as_of_date=observation.as_of_date,
        horizon_sessions=horizon_sessions,
        status="AVAILABLE",
        execution_status=execution.status,
        horizon_date=horizon_date,
        raw_close_return_percent=raw_close_return,
        net_return_percent=net_return,
        benchmark_return_percent=benchmark_return,
        excess_return_percent=(
            net_return - benchmark_return if benchmark_return is not None else None
        ),
        maximum_favorable_excursion_percent=mfe,
        maximum_adverse_excursion_percent=mae,
    )
