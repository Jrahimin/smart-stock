from __future__ import annotations

from bisect import bisect_right
from dataclasses import replace
from datetime import UTC, datetime, time

from app.core.constants.trading_constants import (
    DECISION_RECOMMENDATION_LOOKBACK,
    ELIGIBILITY_SESSION_LOOKBACK,
)
from app.core.enums import EligibilityStatus, MarketDataState
from app.modules.backtesting.backtesting_execution import (
    compute_forward_outcome,
    observation_block,
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
from app.modules.stock_details.decision.event_availability import utc_instant
from app.modules.stock_details.decision.market_regime import (
    resolve_regime_result_from_summaries,
)
from app.modules.stock_details.decision.summary import build_trader_decision_summary
from app.modules.trading_intelligence.input_capture import restore_strategy_input


def replay_canonical_engine(
    dataset: BacktestDataset,
    config: BacktestConfig,
) -> tuple[tuple[ReplayObservation, ...], tuple[ForwardOutcome, ...]]:
    """Replay each stock with only bars, events, sessions and summaries known as of that date."""
    observations: list[ReplayObservation] = []
    outcomes: list[ForwardOutcome] = []
    session_dates = dataset.session_dates

    for history in dataset.histories:
        price_dates = tuple(price.trade_date for price in history.prices)
        for as_of_date in price_dates:
            if not config.start_date <= as_of_date <= config.end_date:
                continue
            if as_of_date not in session_dates:
                continue
            prefix_end = bisect_right(price_dates, as_of_date)
            if prefix_end < config.minimum_history_rows:
                continue

            price_start = max(0, prefix_end - DECISION_RECOMMENDATION_LOOKBACK)
            price_window = list(history.prices[price_start:prefix_end])
            session_end = bisect_right(session_dates, as_of_date)
            session_start = max(0, session_end - ELIGIBILITY_SESSION_LOOKBACK)
            # The exchange calendar retains missing stock sessions within the policy window.
            decision_sessions = session_dates[session_start:session_end]
            summary_prefix = [
                summary for summary in dataset.market_summaries if summary.trade_date <= as_of_date
            ]
            market_regime = resolve_regime_result_from_summaries(
                summary_prefix,
                decision_session_date=as_of_date,
            )
            strategy_input = build_strategy_input(
                history.stock,
                price_window,
                reference_date=as_of_date,
                # Effective dates without knowledge timestamps are an outcome exclusion,
                # never evidence that an earlier decision knew an event.
                event_observations=history.event_observations,
                exchange_session_dates=decision_sessions,
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
            cutoff = datetime.combine(as_of_date, time(18), tzinfo=UTC)
            captures = [
                row
                for row in history.captured_inputs
                if row["input"]["reference_date"] == as_of_date.isoformat()
                and utc_instant(row["observed_at"]) <= cutoff
            ]
            if captures:
                captured = max(captures, key=lambda row: utc_instant(row["observed_at"]))
                strategy_input = restore_strategy_input(captured["input"])
                if (
                    strategy_input.finality != MarketDataState.FINALIZED
                    or any(row.trade_date > as_of_date for row in strategy_input.prices)
                    or utc_instant(strategy_input.calculated_at) > cutoff
                ):
                    raise ValueError("Captured replay input exceeds its finalized as-of boundary")
            market_regime = strategy_input.market_regime
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
            latest_bar = strategy_input.prices[-1]
            observation = ReplayObservation(
                stock_id=history.stock.id,
                symbol=history.stock.symbol,
                # Current instrument metadata is not evidence of a historical sector.
                sector=None,
                category=history.stock.category,
                as_of_date=as_of_date,
                market_regime=market_regime.label,
                recommendation=bundle.decision.recommendation,
                eligibility_status=bundle.eligibility.status,
                eligibility_reason_codes=bundle.eligibility.reason_codes,
                evidence_strength=bundle.evidence_strength.score,
                opportunity_score=bundle.opportunity.score,
                pulse_score=pulse.total,
                median_turnover=bundle.eligibility.median_turnover,
                traded_session_ratio=bundle.eligibility.traded_session_ratio,
                close_price=(
                    float(latest_bar.close_price)
                    if latest_bar.trade_date == as_of_date and not observation_block(latest_bar)
                    else None
                ),
                sma20=bundle.snapshot.sma20,
                sma50=bundle.snapshot.sma50,
                rsi=bundle.snapshot.rsi,
                shared_decision_id=bundle.canonical_result.shared_decision_id,
                opportunity_quality=bundle.canonical_result.opportunity_quality,
                entry_readiness=bundle.canonical_result.entry_readiness,
                entry_timing=bundle.canonical_result.entry_timing,
                blocker_codes=bundle.canonical_result.blocker_codes,
                regime_score=bundle.canonical_result.regime_score,
                regime_phase=bundle.canonical_result.regime_phase,
                regime_confidence=bundle.canonical_result.regime_confidence,
                internal_action=bundle.canonical_result.internal_action,
                display_action=bundle.canonical_result.display_action,
                decision_taxonomy_version=(bundle.canonical_result.decision_taxonomy_version),
                entry_condition=bundle.canonical_result.entry_condition,
                preferred_entry_zone_low=bundle.trade_plan.preferred_entry_zone_low,
                preferred_entry_zone_high=bundle.trade_plan.preferred_entry_zone_high,
                trigger_price=bundle.trade_plan.trigger_price,
                invalidation_price=bundle.trade_plan.invalidation_price,
                expiry_sessions=bundle.trade_plan.expiry_sessions,
                average_volume=bundle.snapshot.average_volume,
                target_price=bundle.trade_plan.target_low,
                controlling_reason=bundle.canonical_result.primary_reason_code,
                liquidity_tier=bundle.liquidity.label.value,
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
        item for item in observations if item.eligibility_status == EligibilityStatus.ELIGIBLE
    )
