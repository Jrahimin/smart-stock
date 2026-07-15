from __future__ import annotations

from dataclasses import replace
from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from app.core.enums import (
    DataQualityFlag,
    DecisionDisplayAction,
    EligibilityStatus,
    EntryTiming,
    ExchangeCode,
    TraderRecommendation,
)
from app.models import DailyPrice, Stock
from app.modules.backtesting.backtesting_engine import replay_canonical_engine
from app.modules.backtesting.backtesting_execution import (
    compute_forward_outcome,
    simulate_next_session_execution,
)
from app.modules.backtesting.backtesting_models import (
    BacktestConfig,
    BacktestDataset,
    ReplayObservation,
    StockReplayHistory,
)
from app.modules.backtesting.backtesting_walk_forward import build_walk_forward_splits
from app.modules.stock_details.decision.patterns import detect_patterns
from app.modules.stock_details.decision.technical import build_technical_snapshot


def _stock(*, active: bool = True) -> Stock:
    now = datetime(2026, 1, 1)
    return Stock(
        id=uuid4(),
        symbol="REPLAY",
        name="Replay Limited",
        exchange=ExchangeCode.DSE,
        sector="Bank",
        category="A",
        is_active=active,
        should_fetch_details=False,
        created_at=now,
        updated_at=now,
    )


def _prices(stock: Stock, count: int = 90) -> list[DailyPrice]:
    start = date(2025, 10, 1)
    rows: list[DailyPrice] = []
    for index in range(count):
        close = Decimal("80") + Decimal(index) * Decimal("0.30")
        rows.append(
            DailyPrice(
                id=uuid4(),
                stock_id=stock.id,
                trade_date=start + timedelta(days=index),
                open_price=close - Decimal("0.10"),
                high_price=close + Decimal("0.80"),
                low_price=close - Decimal("0.80"),
                close_price=close,
                adjusted_close_price=None,
                volume=200_000,
                turnover=Decimal("20000000"),
                source="TEST",
                data_quality_flag=DataQualityFlag.OK,
            )
        )
    return rows


def _observation(stock: Stock, prices: list[DailyPrice], index: int) -> ReplayObservation:
    bar = prices[index]
    return ReplayObservation(
        stock_id=stock.id,
        symbol=stock.symbol,
        sector=stock.sector,
        category=stock.category,
        as_of_date=bar.trade_date,
        market_regime="NEUTRAL",
        recommendation=TraderRecommendation.BUY,
        eligibility_status=EligibilityStatus.ELIGIBLE,
        eligibility_reason_codes=(),
        evidence_strength=70,
        opportunity_score=70,
        pulse_score=75,
        median_turnover=20_000_000,
        traded_session_ratio=1.0,
        close_price=float(bar.close_price),
        sma20=float(bar.close_price) - 1,
        sma50=float(bar.close_price) - 2,
        rsi=55,
        shared_decision_id="test-decision",
    )


def _config(prices: list[DailyPrice], **changes: object) -> BacktestConfig:
    values = {
        "exchange": ExchangeCode.DSE,
        "start_date": prices[59].trade_date,
        "end_date": prices[-1].trade_date,
        "initial_train_sessions": 10,
        "validation_sessions": 5,
        "frozen_test_sessions": 5,
        "horizons": (5, 10),
    }
    values.update(changes)
    return BacktestConfig(**values)


def test_execution_never_uses_the_signal_close() -> None:
    stock = _stock()
    prices = _prices(stock)
    observation = _observation(stock, prices, 60)
    history = StockReplayHistory(stock=stock, prices=tuple(prices))
    sessions = tuple(price.trade_date for price in prices)

    execution = simulate_next_session_execution(
        observation,
        history,
        sessions,
        _config(prices),
    )

    assert execution.status == "FILLED"
    assert execution.execution_date == prices[61].trade_date
    assert execution.raw_price == float(prices[61].open_price)
    assert execution.raw_price != float(prices[60].close_price)


def test_pullback_waits_for_the_zone_within_expiry() -> None:
    stock = _stock()
    prices = _prices(stock)
    observation = replace(
        _observation(stock, prices, 60),
        display_action=DecisionDisplayAction.POTENTIAL_BUY,
        entry_timing=EntryTiming.PULLBACK,
        preferred_entry_zone_low=99.2,
        preferred_entry_zone_high=99.6,
        invalidation_price=95.0,
        expiry_sessions=2,
    )

    execution = simulate_next_session_execution(
        observation,
        StockReplayHistory(stock=stock, prices=tuple(prices)),
        tuple(price.trade_date for price in prices),
        _config(prices),
    )

    assert execution.status == "FILLED"
    assert execution.execution_date == prices[62].trade_date
    assert execution.raw_price == 99.2


def test_breakout_requires_completed_price_and_volume_then_enters_next_session() -> None:
    stock = _stock()
    prices = _prices(stock)
    observation = replace(
        _observation(stock, prices, 60),
        display_action=DecisionDisplayAction.POTENTIAL_BUY,
        entry_timing=EntryTiming.BREAKOUT,
        trigger_price=98.5,
        invalidation_price=95.0,
        expiry_sessions=3,
        average_volume=150_000,
    )

    execution = simulate_next_session_execution(
        observation,
        StockReplayHistory(stock=stock, prices=tuple(prices)),
        tuple(price.trade_date for price in prices),
        _config(prices),
    )

    assert execution.status == "FILLED"
    assert execution.execution_date == prices[63].trade_date
    assert execution.raw_price == float(prices[63].open_price)


def test_breakout_without_a_volume_baseline_expires_without_entry() -> None:
    stock = _stock()
    prices = _prices(stock)
    observation = replace(
        _observation(stock, prices, 60),
        display_action=DecisionDisplayAction.POTENTIAL_BUY,
        entry_timing=EntryTiming.BREAKOUT,
        trigger_price=98.0,
        invalidation_price=95.0,
        expiry_sessions=2,
        average_volume=None,
    )

    execution = simulate_next_session_execution(
        observation,
        StockReplayHistory(stock=stock, prices=tuple(prices)),
        tuple(price.trade_date for price in prices),
        _config(prices),
    )

    assert execution.status == "EXPIRED_WITHOUT_ENTRY"


def test_prefix_replay_is_unchanged_by_a_future_bar_and_includes_inactive_history() -> None:
    stock = _stock(active=False)
    prices = _prices(stock, 70)
    as_of = prices[64].trade_date
    config = _config(prices, start_date=as_of, end_date=as_of, horizons=(5,))
    base = BacktestDataset(
        histories=(StockReplayHistory(stock=stock, prices=tuple(prices)),),
        session_dates=tuple(price.trade_date for price in prices),
    )
    future = _prices(stock, 71)
    future[-1].close_price = Decimal("999")
    extended = BacktestDataset(
        histories=(StockReplayHistory(stock=stock, prices=tuple(future)),),
        session_dates=tuple(price.trade_date for price in future),
    )

    first, _ = replay_canonical_engine(base, config)
    second, _ = replay_canonical_engine(extended, config)

    assert len(first) == len(second) == 1
    assert first[0] == second[0]
    assert first[0].opportunity_quality is not None
    assert first[0].regime_phase is not None
    assert isinstance(first[0].blocker_codes, tuple)


def test_pattern_and_swing_detection_uses_only_the_as_of_prefix() -> None:
    stock = _stock()
    prices = _prices(stock, 70)
    as_of = prices[64].trade_date
    future = _prices(stock, 71)
    future[-1].high_price = Decimal("1200")
    future[-1].close_price = Decimal("999")
    base_prefix = [price for price in prices if price.trade_date <= as_of]
    future_prefix = [price for price in future if price.trade_date <= as_of]
    base_snapshot = build_technical_snapshot(base_prefix)
    future_snapshot = build_technical_snapshot(future_prefix)

    assert base_snapshot is not None and future_snapshot is not None
    assert detect_patterns(base_snapshot, base_prefix) == detect_patterns(
        future_snapshot,
        future_prefix,
    )


def test_non_trade_and_circuit_constraints_fail_without_delayed_fill() -> None:
    stock = _stock()
    prices = _prices(stock)
    observation = _observation(stock, prices, 60)
    next_date = prices[61].trade_date
    sessions = tuple(price.trade_date for price in prices)
    config = _config(prices)

    prices[61].volume = 0
    zero_volume = simulate_next_session_execution(
        observation,
        StockReplayHistory(stock=stock, prices=tuple(prices)),
        sessions,
        config,
    )
    prices[61].volume = 200_000
    locked = simulate_next_session_execution(
        observation,
        StockReplayHistory(
            stock=stock,
            prices=tuple(prices),
            circuit_locked_dates=frozenset({next_date}),
        ),
        sessions,
        config,
    )
    suspended = simulate_next_session_execution(
        observation,
        StockReplayHistory(
            stock=stock,
            prices=tuple(prices),
            suspension_dates=frozenset({next_date}),
        ),
        sessions,
        config,
    )

    assert zero_volume.status == "ZERO_VOLUME"
    assert zero_volume.execution_date == next_date
    assert locked.status == "CIRCUIT_LOCKED"
    assert locked.execution_date == next_date
    assert suspended.status == "SUSPENDED"
    assert suspended.execution_date == next_date


def test_unadjusted_corporate_action_invalidates_forward_outcome() -> None:
    stock = _stock()
    prices = _prices(stock)
    observation = _observation(stock, prices, 60)
    action_date = prices[63].trade_date
    history = StockReplayHistory(
        stock=stock,
        prices=tuple(prices),
        corporate_action_dates=frozenset({action_date}),
    )
    sessions = tuple(price.trade_date for price in prices)
    config = _config(prices)
    execution = simulate_next_session_execution(observation, history, sessions, config)

    outcome = compute_forward_outcome(
        observation,
        execution,
        history,
        sessions,
        (),
        config,
        5,
    )

    assert outcome.status == "CORPORATE_ACTION_UNRESOLVED"


def test_zero_signal_close_does_not_abort_next_open_economic_outcome() -> None:
    stock = _stock()
    prices = _prices(stock)
    observation = _observation(stock, prices, 60)
    observation = replace(observation, close_price=0.0)
    history = StockReplayHistory(stock=stock, prices=tuple(prices))
    sessions = tuple(price.trade_date for price in prices)
    config = _config(prices)
    execution = simulate_next_session_execution(observation, history, sessions, config)

    outcome = compute_forward_outcome(
        observation,
        execution,
        history,
        sessions,
        (),
        config,
        5,
    )

    assert outcome.status == "AVAILABLE"
    assert outcome.raw_close_return_percent is not None
    assert outcome.net_return_percent is not None


def test_walk_forward_boundaries_are_chronological_and_purged() -> None:
    stock = _stock()
    prices = _prices(stock, 100)
    sessions = tuple(price.trade_date for price in prices)
    config = _config(
        prices,
        start_date=prices[0].trade_date,
        initial_train_sessions=30,
        validation_sessions=10,
        frozen_test_sessions=10,
        horizons=(5, 10),
    )

    folds, frozen = build_walk_forward_splits(sessions, config)

    assert folds
    assert frozen is not None
    assert all(fold.train_end < fold.validation_start < frozen.start for fold in folds)
    assert all(fold.purged_sessions == 10 for fold in folds)
    assert folds[-1].validation_end < frozen.start


def test_same_explicit_replay_configuration_is_reproducible() -> None:
    stock = _stock()
    prices = _prices(stock, 70)
    dataset = BacktestDataset(
        histories=(StockReplayHistory(stock=stock, prices=tuple(prices)),),
        session_dates=tuple(price.trade_date for price in prices),
    )
    config = _config(prices, horizons=(5,))

    assert replay_canonical_engine(dataset, config) == replay_canonical_engine(dataset, config)
