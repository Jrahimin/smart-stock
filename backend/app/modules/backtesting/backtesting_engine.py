from __future__ import annotations

from bisect import bisect_right
from dataclasses import replace
from datetime import UTC, datetime, time

from app.core.enums import EligibilityStatus
from app.modules.backtesting.backtesting_execution import (
    compute_forward_outcome,
    simulate_next_session_execution,
)
from app.modules.backtesting.backtesting_models import (
    BacktestConfig,
    BacktestDataset,
    ForwardOutcome,
    ReplayObservation,
)
from app.modules.market_pulse.pulse_score import compute_pulse_score
from app.modules.stock_details.decision.canonical import build_strategy_input
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.stock_details.decision.market_regime import resolve_regime_from_summaries
from app.modules.stock_details.decision.summary import build_trader_decision_summary


def replay_canonical_engine(
    dataset: BacktestDataset,
    config: BacktestConfig,
) -> tuple[tuple[ReplayObservation, ...], tuple[ForwardOutcome, ...]]:
    """Replay each stock with only bars, events, sessions and summaries known as of that date."""
    observations: list[ReplayObservation] = []
    outcomes: list[ForwardOutcome] = []
    session_dates = dataset.session_dates
    maximum_horizon = max(config.horizons)
    signal_dates = (
        frozenset(session_dates[:-maximum_horizon])
        if len(session_dates) > maximum_horizon
        else frozenset()
    )

    for history in dataset.histories:
        price_dates = tuple(price.trade_date for price in history.prices)
        for as_of_date in price_dates:
            if not config.start_date <= as_of_date <= config.end_date:
                continue
            if as_of_date not in signal_dates:
                continue
            prefix_end = bisect_right(price_dates, as_of_date)
            if prefix_end < config.minimum_history_rows:
                continue

            price_prefix = list(history.prices[:prefix_end])
            session_prefix = session_dates[: bisect_right(session_dates, as_of_date)]
            summary_prefix = [
                summary
                for summary in dataset.market_summaries
                if summary.trade_date <= as_of_date
            ]
            market_regime = resolve_regime_from_summaries(summary_prefix)
            known_action_dates = {
                action_date
                for action_date in history.corporate_action_dates
                if action_date <= as_of_date
            }
            strategy_input = build_strategy_input(
                history.stock,
                price_prefix,
                reference_date=as_of_date,
                known_corporate_action_dates=known_action_dates,
                exchange_session_dates=session_prefix,
                market_regime=market_regime,
                calculated_at=datetime.combine(as_of_date, time(18), tzinfo=UTC),
            )
            strategy_input = replace(
                strategy_input,
                category=(history.stock.category if config.use_current_category_proxy else None),
                # Observed historical price rows establish historical presence. Current active
                # status must not remove a delisted/inactive name from an earlier replay.
                is_active=True,
            )
            bundle = compute_trader_decision(strategy_input)
            if (
                bundle is None
                or bundle.eligibility is None
                or bundle.evidence_strength is None
                or bundle.canonical_result is None
            ):
                continue
            decision_read = build_trader_decision_summary(bundle)
            pulse = compute_pulse_score(bundle.snapshot, decision_read)
            observation = ReplayObservation(
                stock_id=history.stock.id,
                symbol=history.stock.symbol,
                sector=history.stock.sector,
                category=history.stock.category,
                as_of_date=as_of_date,
                market_regime=market_regime,
                recommendation=bundle.decision.recommendation,
                eligibility_status=bundle.eligibility.status,
                eligibility_reason_codes=bundle.eligibility.reason_codes,
                evidence_strength=bundle.evidence_strength.score,
                opportunity_score=bundle.opportunity.score,
                pulse_score=pulse.total,
                median_turnover=bundle.eligibility.median_turnover,
                traded_session_ratio=bundle.eligibility.traded_session_ratio,
                close_price=float(price_prefix[-1].close_price),
                sma20=bundle.snapshot.sma20,
                sma50=bundle.snapshot.sma50,
                rsi=bundle.snapshot.rsi,
                shared_decision_id=bundle.canonical_result.shared_decision_id,
            )
            observations.append(observation)
            execution = simulate_next_session_execution(
                observation,
                history,
                session_dates,
                config,
            )
            for horizon in config.horizons:
                outcomes.append(
                    compute_forward_outcome(
                        observation,
                        execution,
                        history,
                        session_dates,
                        dataset.market_summaries,
                        config,
                        horizon,
                    )
                )

    observations.sort(
        key=lambda item: (
            item.as_of_date,
            item.symbol.casefold(),
            str(item.stock_id),
        )
    )
    outcomes.sort(
        key=lambda item: (
            item.as_of_date,
            str(item.stock_id),
            item.horizon_sessions,
        )
    )
    return tuple(observations), tuple(outcomes)


def eligible_observations(
    observations: tuple[ReplayObservation, ...],
) -> tuple[ReplayObservation, ...]:
    return tuple(
        item
        for item in observations
        if item.eligibility_status == EligibilityStatus.ELIGIBLE
    )
