from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import pytest

from app.core.enums import (
    DataQualityFlag,
    DecisionDisplayAction,
    EligibilityStatus,
    EntryReadiness,
    EntryTiming,
    ExchangeCode,
    OpportunityQuality,
    TraderRecommendation,
)
from app.models import DailyMarketSummary, DailyPrice, Stock
from app.modules.backtesting.backtesting_archive import dataset_archive, restore_dataset
from app.modules.backtesting.backtesting_evaluation import (
    evaluate_selections,
    observation_key,
    partition_observations,
    portfolio_ledger,
    rank_metrics,
    strategy_selections,
)
from app.modules.backtesting.backtesting_execution import (
    compute_forward_outcome,
    compute_selection_markout,
    simulate_next_session_execution,
)
from app.modules.backtesting.backtesting_manifest import (
    build_dataset_revision,
    build_replay_manifest,
)
from app.modules.backtesting.backtesting_models import (
    BacktestConfig,
    BacktestDataset,
    CorporateActionTerms,
    ExecutionRule,
    ForwardOutcome,
    ReplayObservation,
    SlippageTier,
    StockReplayHistory,
    WalkForwardSplit,
)
from app.modules.backtesting.backtesting_service import run_dataset


def fixture():
    days = tuple(date(2026, 1, 1) + timedelta(days=i) for i in range(12))
    stock = Stock(
        id=UUID(int=1),
        symbol="FIX",
        name="Fixture",
        exchange=ExchangeCode.DSE,
        sector="Bank",
        category="A",
        is_active=True,
    )
    prices = tuple(
        DailyPrice(
            stock_id=stock.id,
            trade_date=day,
            open_price=Decimal(100),
            high_price=Decimal(102),
            low_price=Decimal(98),
            close_price=Decimal(100),
            volume=100000,
            turnover=Decimal(10000000),
            source="FIXTURE",
            data_quality_flag=DataQualityFlag.OK,
        )
        for day in days
    )
    rule = ExecutionRule(
        days[0], days[-1], datetime(2025, 12, 1, tzinfo=UTC), "fixture-rule-v1", 0.1, 10, 0
    )
    history = StockReplayHistory(stock, prices, execution_rules=(rule,))
    obs = ReplayObservation(
        stock.id,
        stock.symbol,
        stock.sector,
        stock.category,
        days[0],
        "NEUTRAL",
        TraderRecommendation.BUY,
        EligibilityStatus.ELIGIBLE,
        (),
        50,
        50,
        60,
        10000000.0,
        1.0,
        100.0,
        99.0,
        98.0,
        50.0,
        "fixture-decision",
        opportunity_quality=OpportunityQuality.CONSTRUCTIVE,
        entry_readiness=EntryReadiness.READY,
        entry_timing=EntryTiming.READY,
        display_action=DecisionDisplayAction.POTENTIAL_BUY,
        expiry_sessions=4,
    )
    config = BacktestConfig(
        ExchangeCode.DSE,
        days[0],
        days[-1],
        horizons=(3,),
        one_way_cost_bps=0,
        slippage_multiplier=0,
        minimum_history_rows=3,
        initial_train_sessions=2,
        validation_sessions=1,
        frozen_test_sessions=2,
    )
    summaries = tuple(
        DailyMarketSummary(
            exchange=ExchangeCode.DSE,
            trade_date=day,
            index_name="DSEX",
            index_close=Decimal(100 + i),
            is_finalized=True,
        )
        for i, day in enumerate(days)
    )
    return obs, history, days, config, BacktestDataset((history,), days, summaries)


def test_ambiguous_trigger_invalidation_never_fills_even_if_close_confirms():
    obs, history, days, config, _ = fixture()
    obs = replace(
        obs,
        entry_timing=EntryTiming.BREAKOUT,
        trigger_price=101,
        invalidation_price=99,
        average_volume=100,
    )
    history.prices[1].close_price = Decimal(102)
    result = simulate_next_session_execution(obs, history, days, config)
    assert result.status == "AMBIGUOUS_PRE_ENTRY"
    assert not result.is_filled and not result.attempt_dates
    assert result.events[-1]["state"] == "AMBIGUOUS_PRE_ENTRY"


def test_confirmation_waits_for_first_executable_session_and_revalidates_gap():
    obs, history, days, config, _ = fixture()
    obs = replace(
        obs,
        entry_timing=EntryTiming.BREAKOUT,
        trigger_price=101,
        invalidation_price=95,
        average_volume=100,
    )
    history.prices[1].close_price = Decimal(102)
    history = replace(history, suspension_dates=frozenset({days[2]}))
    result = simulate_next_session_execution(obs, history, days, config)
    assert result.activation_date == days[1]
    assert result.execution_date == days[3] and result.is_filled
    history.prices[3].open_price = Decimal(115)
    history.prices[3].high_price = Decimal(116)
    assert simulate_next_session_execution(obs, history, days, config).status == "GAP_REJECTED"


def test_strategy_specific_baseline_does_not_inherit_conditional_plan():
    obs, history, days, config, dataset = fixture()
    obs = replace(obs, entry_timing=EntryTiming.BREAKOUT, trigger_price=110, average_volume=100)
    canonical = simulate_next_session_execution(obs, history, days, config)
    selections = strategy_selections((obs,), config)
    selected, policy = selections["price_above_sma20"]
    executions, _ = evaluate_selections(selected, dataset, config, policy)
    assert not canonical.is_filled
    assert executions[observation_key(obs)].is_filled
    assert executions[observation_key(obs)].execution_date == days[1]


def test_tick_lot_capacity_and_unknown_rules():
    obs, history, days, config, _ = fixture()
    history.prices[1].open_price = Decimal("100.01")
    result = simulate_next_session_execution(obs, history, days, config)
    assert result.fill_price == 100.1 and result.quantity % 10 == 0
    assert result.quantity * result.fill_price <= config.order_value_bdt
    assert (
        simulate_next_session_execution(
            obs, replace(history, execution_rules=()), days, config
        ).status
        == "RULES_UNAVAILABLE"
    )
    assert (
        simulate_next_session_execution(
            obs, history, days, replace(config, order_value_bdt=250000)
        ).status
        == "CAPACITY_EXCEEDED"
    )


def test_open_stop_target_adverse_order_gap_stop_and_blocked_exit():
    obs, history, days, config, _ = fixture()
    obs = replace(obs, invalidation_price=95, target_price=110)
    execution = simulate_next_session_execution(obs, history, days, config)
    history.prices[2].high_price = Decimal(115)
    history.prices[2].low_price = Decimal(90)
    out = compute_forward_outcome(obs, execution, history, days, (), config, 3)
    assert out.exit_reason == "STOP" and out.exit_price == 95 and out.outcome_end_date == days[2]
    history.prices[2].open_price = Decimal(92)
    assert compute_forward_outcome(obs, execution, history, days, (), config, 3).exit_price == 92
    blocked = replace(history, circuit_locked_dates=frozenset({days[2]}))
    history.prices[3].open_price = Decimal(91)
    history.prices[3].low_price = Decimal(90)
    out = compute_forward_outcome(obs, execution, blocked, days, (), config, 3)
    assert out.outcome_end_date == days[3] and out.exit_price == 91
    assert any(event["state"] == "EXIT_BLOCKED" for event in out.events)


def test_settlement_prevents_early_sale_and_close_entry_ignores_prior_intraday_low():
    obs, history, days, config, _ = fixture()
    obs = replace(obs, invalidation_price=99)
    history = replace(
        history, execution_rules=(replace(history.execution_rules[0], settlement_sessions=2),)
    )
    execution = simulate_next_session_execution(obs, history, days, config)
    out = compute_forward_outcome(obs, execution, history, days, (), config, 3)
    assert out.outcome_end_date == days[3]
    assert any(event.get("reason") == "UNSETTLED_SHARES" for event in out.events)
    close_config = replace(config, execution_price="close")
    execution = simulate_next_session_execution(obs, history, days, close_config)
    assert execution.fill_timing == "CLOSE"
    out = compute_forward_outcome(obs, execution, history, days, (), close_config, 3)
    assert out.exit_reason == "STOP" and out.events[0]["date"] == days[2]


@pytest.mark.parametrize("execution_price", ["open", "close"])
def test_descending_pullback_cannot_take_target_that_may_precede_its_fill(execution_price):
    obs, history, days, config, dataset = fixture()
    obs = replace(
        obs,
        entry_timing=EntryTiming.PULLBACK,
        preferred_entry_zone_low=100,
        preferred_entry_zone_high=102,
        invalidation_price=95,
        target_price=108,
    )
    config = replace(config, execution_price=execution_price)
    bar = history.prices[1]
    bar.open_price, bar.high_price, bar.low_price, bar.close_price = map(
        Decimal, (110, 115, 100, 101)
    )
    execution = simulate_next_session_execution(obs, history, days, config)
    assert execution.fill_price == 102 and execution.fill_timing == "INTRADAY"
    assert execution.events[-1]["timing"] == "INTRADAY"
    outcome = compute_forward_outcome(
        obs, execution, history, days, dataset.market_summaries, config, 3
    )
    assert outcome.exit_reason == "HORIZON" and outcome.outcome_end_date == days[4]
    assert outcome.benchmark_return_percent is None
    assert outcome.net_return_percent < 0
    # The exact same OHLC can support a target after a known in-zone opening fill.
    bar.open_price = Decimal(101)
    opening_fill = simulate_next_session_execution(obs, history, days, config)
    assert opening_fill.fill_timing == "OPEN"
    opening_exit = compute_forward_outcome(obs, opening_fill, history, days, (), config, 3)
    assert opening_exit.exit_reason == "TARGET" and opening_exit.outcome_end_date == days[1]
    bar.low_price = Decimal(94)
    opening_fill = simulate_next_session_execution(obs, history, days, config)
    opening_exit = compute_forward_outcome(obs, opening_fill, history, days, (), config, 3)
    assert opening_exit.exit_reason == "STOP" and opening_exit.exit_price == 95


def test_close_entry_uses_close_benchmark_only_when_actual_fill_is_at_close():
    obs, history, days, config, dataset = fixture()
    config = replace(config, execution_price="close")
    execution = simulate_next_session_execution(obs, history, days, config)
    assert execution.fill_timing == "CLOSE"
    outcome = compute_forward_outcome(
        obs, execution, history, days, dataset.market_summaries, config, 3
    )
    assert outcome.outcome_end_date == days[4]
    assert outcome.benchmark_return_percent == pytest.approx((104 / 101 - 1) * 100)


def test_null_bars_preserve_delayed_exit_and_selection_denominators():
    obs, history, days, config, dataset = fixture()
    obs = replace(obs, invalidation_price=95, target_price=110)
    for index in (2, 4):
        bar = history.prices[index]
        bar.volume = 0
        bar.open_price = bar.high_price = bar.low_price = bar.close_price = None
    execs, outcomes = evaluate_selections((obs,), dataset, config, "canonical-plan-v1")
    execution = execs[observation_key(obs)]
    assert outcomes[0].events[:2] == (
        {"state": "SESSION_BLOCKED", "date": days[2], "reason": "ZERO_VOLUME"},
        {"state": "EXIT_BLOCKED", "date": days[4], "reason": "ZERO_VOLUME"},
    )
    assert outcomes[0].exit_reason == "HORIZON" and outcomes[0].outcome_end_date == days[5]
    limited = compute_forward_outcome(obs, execution, history, days[:5], (), config, 3)
    assert limited.status == "EXIT_BLOCKED" and limited.outcome_end_date is None
    report = run_dataset(dataset, config, sensitivities=False)
    assert report.coverage["attempted_instrument_sessions"] == len(days)
    mark = compute_selection_markout(obs, history, days, (), config, 4)
    ranked = rank_metrics((obs,), (obs,), (mark,), 4)
    assert ranked["selection_count"] == ranked["missing_selection_count"] == 1


def test_pending_stop_stays_pending_across_bar_with_missing_open():
    obs, history, days, config, _ = fixture()
    obs = replace(obs, invalidation_price=95)
    history = replace(history, circuit_locked_dates=frozenset({days[2]}))
    history.prices[2].low_price = Decimal(94)
    history.prices[3].open_price = None
    execution = simulate_next_session_execution(obs, history, days, config)
    outcome = compute_forward_outcome(obs, execution, history, days, (), config, 3)
    assert outcome.exit_reason == "STOP" and outcome.outcome_end_date == days[4]
    assert outcome.events[:2] == (
        {"state": "EXIT_BLOCKED", "date": days[2], "reason": "CIRCUIT_LOCKED"},
        {"state": "EXIT_BLOCKED", "date": days[3], "reason": "INVALID_EXECUTION_PRICE"},
    )


@pytest.mark.parametrize(
    "multiplier,cash,placeholder", [(2, 0, False), (0.5, 0, True), (2, 2, True)]
)
def test_carried_mark_conserves_equity_through_action_without_trade(multiplier, cash, placeholder):
    obs, history, days, config, dataset = fixture()
    action = CorporateActionTerms(
        days[2], datetime(2025, 12, 1, tzinfo=UTC), "dated-fixture", multiplier, cash, days[5]
    )
    for bar in history.prices[3:]:
        bar.open_price = bar.close_price = Decimal(str((100 - cash) / multiplier))
        bar.high_price, bar.low_price = bar.close_price + 1, bar.close_price - 1
    if placeholder:
        # A source can supply yesterday's close in old units without an executable trade.
        history.prices[2].volume = 0
        prices = history.prices
    else:
        prices = (*history.prices[:2], *history.prices[3:])
    history = replace(history, prices=prices, corporate_actions=(action,))
    dataset = replace(dataset, histories=(history,))
    executions, outcomes = evaluate_selections((obs,), dataset, config, "canonical-plan-v1")
    ledger = portfolio_ledger(
        (obs,),
        executions,
        {observation_key(outcomes[0]): outcomes[0]},
        dataset,
        config,
    )
    assert ledger["status"] == "AVAILABLE"
    assert outcomes[0].net_return_percent == pytest.approx(0)
    assert ledger["maximum_drawdown_percent"] == pytest.approx(0)
    assert [row["equity_bdt"] for row in ledger["daily"]] == pytest.approx([1_000_000] * len(days))
    assert ledger["daily"][2]["stale_mark_count"] == 1
    assert ledger["daily"][2]["cash_bdt"] == 950_000
    assert ledger["daily"][4]["cash_bdt"] == 1_000_000 - 500 * cash
    assert ledger["daily"][5]["cash_bdt"] == 1_000_000


@pytest.mark.parametrize(
    "lower,upper,tick,slippage,boundary",
    [(90, None, 0.1, 100, "90"), (90.05, None, 0.1, 0, "90.05"), (None, 101, 0.1, 0, "102")],
)
def test_nonexecutable_boundary_exit_waits_and_never_releases_cash_early(
    lower,
    upper,
    tick,
    slippage,
    boundary,
):
    obs, history, days, config, dataset = fixture()
    obs = replace(obs, invalidation_price=float(boundary) if lower is not None else None)
    rule = replace(
        history.execution_rules[0],
        tick_size=tick,
        lower_price_limit=lower,
        upper_price_limit=upper,
    )
    history = replace(history, execution_rules=(rule,))
    config = replace(config, slippage_multiplier=1, slippage_tiers=(SlippageTier(0, slippage),))
    bar = history.prices[2]
    bar.open_price = bar.close_price = Decimal(boundary)
    bar.high_price, bar.low_price = bar.close_price + 1, bar.close_price - 1
    dataset = replace(dataset, histories=(history,))
    execution = simulate_next_session_execution(obs, history, days, config)
    out = compute_forward_outcome(obs, execution, history, days, (), config, 1)
    assert out.events[0] == {"state": "EXIT_BLOCKED", "date": days[2], "reason": "PRICE_LIMIT"}
    assert out.exit_price == pytest.approx(100 * (1 - slippage / 10000))
    assert out.outcome_end_date == days[3]
    key = observation_key(obs)
    ledger = portfolio_ledger((obs,), {key: execution}, {key: out}, dataset, config)
    assert ledger["daily"][2]["positions"] == 1
    assert ledger["daily"][2]["cash_bdt"] == ledger["daily"][1]["cash_bdt"]
    assert ledger["daily"][3]["cash_bdt"] > ledger["daily"][2]["cash_bdt"]


def test_split_and_dividend_accounting_uses_shares_and_cash_not_adjusted_close_ratio():
    obs, history, days, config, dataset = fixture()
    action = CorporateActionTerms(
        days[2], datetime(2025, 12, 1, tzinfo=UTC), "split-plus-cash", 2.0, 2.0, days[5]
    )
    for bar in history.prices[2:]:
        bar.open_price = bar.close_price = Decimal(50)
        bar.high_price, bar.low_price = Decimal(51), Decimal(49)
    history = replace(
        history, corporate_actions=(action,), corporate_action_dates=frozenset({days[2]})
    )
    execution = simulate_next_session_execution(obs, history, days, config)
    out = compute_forward_outcome(
        obs, execution, history, days, dataset.market_summaries, config, 3
    )
    assert out.net_return_percent == pytest.approx(2.0)
    assert out.exit_quantity == 1000 and out.cash_distribution_per_entry_share == 2.0
    dataset = replace(dataset, histories=(history,))
    ledger = portfolio_ledger(
        (obs,), {observation_key(obs): execution}, {observation_key(obs): out}, dataset, config
    )
    assert ledger["daily"][2]["cash_bdt"] == 950000
    assert ledger["daily"][4]["cash_bdt"] == 1000000
    assert ledger["daily"][5]["cash_bdt"] == 1001000
    assert ledger["cash_inclusive_net_return_percent"] == pytest.approx(0.1)


def test_markout_independent_of_fill_policy_and_benchmark_times_match():
    obs, history, days, config, dataset = fixture()
    obs = replace(obs, entry_timing=EntryTiming.BREAKOUT, trigger_price=999, average_volume=100)
    mark = compute_selection_markout(obs, history, days, dataset.market_summaries, config, 3)
    assert mark.benchmark_return_percent == pytest.approx(3.0)
    assert mark.excess_return_percent == pytest.approx(-3.0)
    filled = simulate_next_session_execution(
        obs, history, days, config, policy_id="sma20-next-open-v1"
    )
    outcome = compute_forward_outcome(
        obs, filled, history, days, dataset.market_summaries, config, 3
    )
    assert outcome.benchmark_return_percent is None  # No invented benchmark open.
    assert rank_metrics((obs,), (obs,), (mark,), 3)["selection_count"] == 1


def test_cash_drawdown_is_not_trade_mae_and_one_position_per_symbol():
    obs, history, days, config, dataset = fixture()
    history.prices[2].close_price = Decimal(90)
    history.prices[2].low_price = Decimal(89)
    later = replace(obs, as_of_date=days[1])
    executions, outcomes = evaluate_selections((obs, later), dataset, config, "sma20-next-open-v1")
    ledger = portfolio_ledger(
        (obs, later), executions, {observation_key(out): out for out in outcomes}, dataset, config
    )
    assert ledger["portfolio_rejection_counts"] == {"ALREADY_HELD": 1}
    assert ledger["maximum_drawdown_percent"] == pytest.approx(-0.5)
    assert outcomes[0].maximum_adverse_excursion_percent == pytest.approx(-10.0)


def test_actual_delayed_outcome_end_purges_training_label():
    obs, _, days, config, dataset = fixture()
    fold = WalkForwardSplit(1, days[0], days[2], days[5], days[6], 3, "expanding")
    out = ForwardOutcome(
        obs.stock_id, obs.as_of_date, 3, "AVAILABLE", "FILLED", outcome_end_date=days[5]
    )
    assert (
        partition_observations((obs,), (out,), (fold,), None, config, dataset)["fold_1_train"] == ()
    )
    out = replace(out, outcome_end_date=days[4])
    assert partition_observations((obs,), (out,), (fold,), None, config, dataset)[
        "fold_1_train"
    ] == (obs,)


def test_archive_manifest_roundtrip_preserves_rules_raw_revisions_and_denominators():
    _, _, _, config, dataset = fixture()
    restored = restore_dataset(dataset_archive(dataset))
    assert build_dataset_revision(restored) == build_dataset_revision(dataset)
    report = run_dataset(restored, config, sensitivities=False)
    assert report.coverage["attempted_instrument_sessions"] == 12
    assert (
        sum(
            report.coverage.get(key, 0)
            for key in ("warmup", "missing_bar", "no_engine_result", "observations")
        )
        == 12
    )
    assert report.audit["dataset"]["schema"] == "replay-input-archive-v1"
    assert report.manifest == run_dataset(restored, config, sensitivities=False).manifest
    changed = replace(dataset, histories=(replace(dataset.histories[0], execution_rules=()),))
    assert (
        build_replay_manifest(config, changed, (), ()).dataset_revision
        != report.manifest.dataset_revision
    )
