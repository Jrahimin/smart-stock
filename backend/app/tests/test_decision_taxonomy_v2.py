from dataclasses import replace
from datetime import date
from uuid import uuid4

import pytest

from app.core.constants.trading_constants import (
    LEGACY_TRADING_ACTION_TAXONOMY,
    TRADING_ACTION_TAXONOMY,
)
from app.core.enums import (
    DecisionDisplayAction,
    EligibilityStatus,
    EntryReadiness,
    EntryTiming,
    ExchangeCode,
    HolderAction,
    OpportunityQuality,
    TradePlanStatus,
    TraderRecommendation,
)
from app.modules.backtesting.backtesting_metrics import (
    build_decision_metrics,
    build_strategy_metrics,
    build_stratified_metrics,
)
from app.modules.backtesting.backtesting_models import (
    BacktestConfig,
    ForwardOutcome,
    ReplayObservation,
)
from app.modules.market_universe.market_universe_cache import universe_cache_key
from app.modules.stock_details.decision.display_taxonomy import (
    resolve_display_decision,
    resolve_holder_display_action,
    resolve_versioned_internal_action,
)


@pytest.mark.parametrize("timing", list(EntryTiming))
def test_valid_internal_buy_uses_one_public_badge_with_condition(
    timing: EntryTiming,
) -> None:
    resolved = resolve_display_decision(
        TraderRecommendation.BUY,
        opportunity_quality=OpportunityQuality.STRONG,
        entry_readiness=(
            EntryReadiness.READY
            if timing == EntryTiming.READY
            else EntryReadiness.CONDITIONAL
        ),
        entry_timing=timing,
        trade_plan_status=TradePlanStatus.VALID_ENTRY_PLAN,
        entry_condition=f"Follow the {timing.value.lower()} condition.",
    )

    assert resolved.internal_action == TraderRecommendation.BUY
    assert resolved.display_action == DecisionDisplayAction.POTENTIAL_BUY
    assert resolved.entry_timing == timing
    assert resolved.entry_condition


def test_v2_resolver_fails_closed_without_an_actionable_plan() -> None:
    resolved = resolve_display_decision(
        TraderRecommendation.BUY,
        opportunity_quality=OpportunityQuality.STRONG,
        entry_readiness=EntryReadiness.NOT_READY,
        entry_timing=None,
        trade_plan_status=TradePlanStatus.WATCH_ONLY,
        entry_condition=None,
    )

    assert resolved.display_action == DecisionDisplayAction.WAIT
    assert resolved.entry_timing is None
    assert resolved.entry_condition is None


def test_holder_context_does_not_change_generic_base_decision() -> None:
    generic = resolve_display_decision(
        TraderRecommendation.BUY,
        opportunity_quality=OpportunityQuality.STRONG,
        entry_readiness=EntryReadiness.READY,
        entry_timing=EntryTiming.READY,
        trade_plan_status=TradePlanStatus.VALID_ENTRY_PLAN,
        entry_condition="Entry setup is available near the shown range.",
    )

    assert generic.display_action == DecisionDisplayAction.POTENTIAL_BUY
    assert resolve_holder_display_action(HolderAction.HOLD) == DecisionDisplayAction.HOLD
    assert resolve_holder_display_action(HolderAction.REVIEW) == DecisionDisplayAction.WAIT
    assert resolve_holder_display_action(HolderAction.SELL) == DecisionDisplayAction.SELL


def test_taxonomy_versioning_keeps_legacy_actions_non_comparable() -> None:
    assert (
        resolve_versioned_internal_action(
            TraderRecommendation.BUY,
            action_taxonomy=TRADING_ACTION_TAXONOMY,
        )
        == DecisionDisplayAction.POTENTIAL_BUY
    )
    assert (
        resolve_versioned_internal_action(
            TraderRecommendation.BUY,
            action_taxonomy=LEGACY_TRADING_ACTION_TAXONOMY,
        )
        is None
    )
    assert universe_cache_key(
        "scored",
        ExchangeCode.DSE,
        decision_taxonomy_version="v1",
    ) != universe_cache_key(
        "scored",
        ExchangeCode.DSE,
        decision_taxonomy_version="v2",
    )


def _observation(timing: EntryTiming) -> ReplayObservation:
    return ReplayObservation(
        stock_id=uuid4(),
        symbol=timing.value,
        sector="TEST",
        category="A",
        as_of_date=date(2026, 1, 1),
        market_regime="BULLISH",
        recommendation=TraderRecommendation.BUY,
        eligibility_status=EligibilityStatus.ELIGIBLE,
        eligibility_reason_codes=(),
        evidence_strength=70,
        opportunity_score=70,
        pulse_score=65,
        median_turnover=20_000_000,
        traded_session_ratio=1.0,
        close_price=100.0,
        sma20=95.0,
        sma50=90.0,
        rsi=58.0,
        shared_decision_id=str(uuid4()),
        internal_action=TraderRecommendation.BUY,
        display_action=DecisionDisplayAction.POTENTIAL_BUY,
        entry_timing=timing,
        entry_condition=f"{timing.value} condition",
    )


def test_replay_reports_every_entry_timing_at_all_required_horizons() -> None:
    observations = tuple(_observation(timing) for timing in EntryTiming)
    outcomes = tuple(
        ForwardOutcome(
            stock_id=observation.stock_id,
            as_of_date=observation.as_of_date,
            horizon_sessions=horizon,
            status="AVAILABLE",
            execution_status="FILLED",
            net_return_percent=2.0,
            maximum_favorable_excursion_percent=3.0,
            maximum_adverse_excursion_percent=-1.0,
        )
        for observation in observations
        for horizon in (3, 5, 10, 20)
    )
    config = BacktestConfig(
        exchange=ExchangeCode.DSE,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 2, 28),
    )

    metrics = build_strategy_metrics(observations, outcomes, config)
    cohorts = metrics["entry_timing_cohorts"]
    stratified = build_stratified_metrics(observations, outcomes, config)

    assert set(cohorts) == {"3", "5", "10", "20"}
    for horizon in cohorts.values():
        assert set(horizon) == {timing.value for timing in EntryTiming}
        assert all(summary["candidate_count"] == 1 for summary in horizon.values())
        assert all(summary["trigger_activation_rate"] == 1.0 for summary in horizon.values())
    assert set(stratified["by_horizon"]) == {"3", "5", "10", "20"}
    assert all(
        "entry_timing" in horizon_summary
        and "liquidity_capacity" in horizon_summary
        and "market_regime" in horizon_summary
        and "regime_phase" in horizon_summary
        for horizon_summary in stratified["by_horizon"].values()
    )


def test_replay_decision_distribution_reports_v2_actions_and_blockers() -> None:
    observation = _observation(EntryTiming.READY)
    observation = replace(
        observation,
        blocker_codes=("near_resistance", "needs_confirmation"),
    )

    metrics = build_decision_metrics((observation,))

    assert metrics["action_counts"] == {"POTENTIAL_BUY": 1}
    assert metrics["blocker_code_counts"] == {
        "near_resistance": 1,
        "needs_confirmation": 1,
    }


def test_replay_reports_expired_conditional_entries_without_counting_a_fill() -> None:
    observation = _observation(EntryTiming.PULLBACK)
    expired = ForwardOutcome(
        stock_id=observation.stock_id,
        as_of_date=observation.as_of_date,
        horizon_sessions=10,
        status="UNFILLED",
        execution_status="EXPIRED_WITHOUT_ENTRY",
    )
    config = BacktestConfig(
        exchange=ExchangeCode.DSE,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 2, 28),
        horizons=(10,),
    )

    metrics = build_strategy_metrics((observation,), (expired,), config)
    pullback = metrics["entry_timing_cohorts"]["10"]["PULLBACK"]

    assert pullback["trigger_activation_rate"] == 0.0
    assert pullback["expired_without_entry_rate"] == 1.0
    assert pullback["execution_fill_count"] == 0
