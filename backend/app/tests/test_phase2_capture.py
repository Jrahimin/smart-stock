from dataclasses import replace
from datetime import UTC, datetime, time, timedelta
from decimal import Decimal

import pytest

from app.core.enums import EligibilityStatus, MarketDataState, TurnoverProvenance
from app.models import DailyMarketSummary
from app.modules.backtesting.backtesting_archive import dataset_archive, restore_dataset
from app.modules.backtesting.backtesting_challengers import challenger_ranking, enrich_features
from app.modules.backtesting.backtesting_engine import replay_canonical_engine
from app.modules.backtesting.backtesting_evaluation import evaluate_selections, top_five
from app.modules.backtesting.backtesting_models import (
    BacktestDataset,
    ExecutionRule,
    StockReplayHistory,
)
from app.modules.backtesting.backtesting_promotion import coverage_evidence
from app.modules.backtesting.backtesting_service import run_dataset
from app.modules.stock_details.decision.canonical import build_strategy_input
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.stock_details.decision.market_regime import resolve_regime_result_from_summaries
from app.modules.trading_intelligence.input_capture import capture_strategy_input
from app.tests.test_backtesting_replay import _config, _prices, _stock


@pytest.fixture
def long_history():
    stock = _stock()
    prices = _prices(stock, 250)
    for row in prices:
        row.turnover_provenance = TurnoverProvenance.REPORTED
    return stock, prices, tuple(row.trade_date for row in prices)


def production_window_decision(stock, prices, sessions, day):
    return compute_trader_decision(
        build_strategy_input(
            stock,
            [row for row in prices if row.trade_date <= day][-90:],
            reference_date=day,
            exchange_session_dates=tuple(session for session in sessions if session <= day)[-90:],
            market_regime=resolve_regime_result_from_summaries([], decision_session_date=day),
        )
    )


@pytest.mark.parametrize("session_number", [90, 120, 180, 220])
def test_uncaptured_replay_uses_production_calendar_and_input_identity(
    long_history, session_number
):
    stock, prices, sessions = long_history
    day = sessions[session_number - 1]
    config = _config(prices, start_date=day, end_date=day, use_current_category_proxy=True)
    (observed,), _ = replay_canonical_engine(
        BacktestDataset((StockReplayHistory(stock, tuple(prices)),), sessions), config
    )
    expected = production_window_decision(stock, prices, sessions, day)
    assert observed.traded_session_ratio == expected.eligibility.traded_session_ratio == 1.0
    assert observed.eligibility_status == expected.eligibility.status == EligibilityStatus.ELIGIBLE
    assert observed.shared_decision_id == expected.canonical_result.shared_decision_id


def test_older_sessions_do_not_change_current_decision_or_truncate_future_replay(long_history):
    stock, prices, sessions = long_history
    start, end = sessions[179], sessions[219]
    config = _config(prices, start_date=start, end_date=end, use_current_category_proxy=True)
    shorter = BacktestDataset((StockReplayHistory(stock, tuple(prices[30:])),), sessions[30:])
    # Prepend earlier calendar history and earlier bars, with genuine missing older sessions.
    longer = BacktestDataset(
        (StockReplayHistory(stock, tuple(prices[:10] + prices[30:])),), sessions
    )
    shorter_observations, shorter_outcomes = replay_canonical_engine(shorter, config)
    longer_observations, longer_outcomes = replay_canonical_engine(longer, config)
    assert (shorter_observations, shorter_outcomes) == (longer_observations, longer_outcomes)
    assert all(row.traded_session_ratio == 1 for row in longer_observations)
    latest = longer_observations[-1]
    _, execution_outcomes = evaluate_selections((latest,), longer, config, "sma20-next-open-v1")
    assert execution_outcomes[-1].status == "AVAILABLE"
    assert execution_outcomes[-1].outcome_end_date == sessions[230]
    report = run_dataset(longer, config, sensitivities=False)
    assert report.session_count == len(sessions)
    assert report.folds and report.frozen_test.end == end


@pytest.mark.parametrize("no_trade,missing", [(30, 0), (29, 1), (30, 1)])
def test_bounded_calendar_counts_no_trade_and_missing_sessions(long_history, no_trade, missing):
    stock, prices, sessions = long_history
    day = sessions[219]
    for row in prices[130 : 130 + no_trade]:
        row.open_price = row.high_price = row.low_price = row.close_price = Decimal(0)
        row.volume = 0
    if missing:
        del prices[130 + no_trade]
    config = _config(prices, start_date=day, end_date=day, use_current_category_proxy=True)
    (observed,), _ = replay_canonical_engine(
        BacktestDataset((StockReplayHistory(stock, tuple(prices)),), sessions), config
    )
    expected = production_window_decision(stock, prices, sessions, day)
    assert expected.snapshot.expected_session_count == 90
    assert expected.snapshot.observed_session_count == 90 - missing
    assert expected.snapshot.zero_volume_session_count == no_trade
    assert expected.snapshot.missing_session_count == missing
    assert expected.snapshot.traded_session_count == 90 - no_trade - missing
    assert observed.traded_session_ratio == round((90 - no_trade - missing) / 90, 4)
    assert observed.eligibility_status == expected.eligibility.status
    assert observed.shared_decision_id == expected.canonical_result.shared_decision_id


def test_replay_uses_immutable_capture_instead_of_later_corrected_prices():
    stock = _stock()
    prices = _prices(stock, 70)
    day = prices[60].trade_date
    cutoff = datetime.combine(day, time(18), tzinfo=UTC)
    value = build_strategy_input(
        stock,
        prices[:61],
        reference_date=day,
        exchange_session_dates=tuple(row.trade_date for row in prices[:61]),
        calculated_at=cutoff,
    )
    capture = {"observed_at": cutoff.isoformat(), "input": capture_strategy_input(value)}
    history = StockReplayHistory(stock, tuple(prices), captured_inputs=(capture,))
    dataset = BacktestDataset((history,), tuple(row.trade_date for row in prices))
    config = _config(prices, start_date=day, end_date=day, replay_mode="capture_diagnostic")
    first, _ = replay_canonical_engine(dataset, config)
    prices[60].close_price = Decimal(999)
    prices[60].high_price = Decimal(1000)
    second, _ = replay_canonical_engine(dataset, config)
    assert first == second
    assert first[0].close_price == 98.0
    capture["input"]["finality"] = MarketDataState.LIVE
    with pytest.raises(ValueError, match="finalized as-of"):
        replay_canonical_engine(dataset, config)


def test_late_known_event_does_not_change_earlier_decision():
    stock = _stock()
    prices = _prices(stock, 70)
    day = prices[60].trade_date
    dataset = BacktestDataset(
        (StockReplayHistory(stock, tuple(prices)),), tuple(row.trade_date for row in prices)
    )
    config = _config(prices, start_date=day, end_date=day)
    before, _ = replay_canonical_engine(dataset, config)
    event = {
        "event_id": "late",
        "kind": "split",
        "effective_date": prices[59].trade_date.isoformat(),
        "known_at": datetime.combine(prices[65].trade_date, time(18), tzinfo=UTC).isoformat(),
    }
    after_dataset = replace(
        dataset, histories=(replace(dataset.histories[0], event_observations=(event,)),)
    )
    after, _ = replay_canonical_engine(after_dataset, config)
    assert before == after


def test_canonical_parity_does_not_verify_later_market_revisions_or_current_sectors():
    histories = []
    for symbol in ("FIXA", "FIXB"):
        stock = _stock()
        stock.symbol = symbol
        prices = _prices(stock, 70)
        for row in prices:
            row.trade_count = 150
            row.turnover_provenance = TurnoverProvenance.REPORTED
        days = tuple(row.trade_date for row in prices)
        day = days[60]
        cutoff = datetime.combine(day, time(18), tzinfo=UTC)
        for row in prices[:61]:
            row.updated_at = cutoff-timedelta(minutes=1)
        strategy_input = build_strategy_input(
            stock,
            prices[:61],
            reference_date=day,
            exchange_session_dates=days[:61],
            calculated_at=cutoff,
        )
        payload = capture_strategy_input(strategy_input)
        payload["gaps"] = []
        histories.append(
            StockReplayHistory(
                stock,
                tuple(prices),
                captured_inputs=({"observed_at": cutoff.isoformat(), "input": payload},),
                execution_rules=(
                    ExecutionRule(
                        days[0], days[-1], cutoff - timedelta(days=90), "dated-rule", 0.1, 1, 0
                    ),
                ),
                point_in_time_verified=True,
                event_coverage_verified=True,
                instrument_history_verified=True,
            )
        )
    summaries = tuple(
        DailyMarketSummary(
            exchange=histories[0].stock.exchange,
            trade_date=session,
            index_name="DSEX",
            index_close=Decimal(100 + index),
            advancing_issues=90,
            declining_issues=10,
            is_finalized=True,
            updated_at=cutoff + timedelta(days=1),
        )
        for index, session in enumerate(days)
    )
    dataset = BacktestDataset(tuple(histories), days, summaries)
    config = _config(prices, start_date=day, end_date=day, replay_mode="capture_diagnostic")
    observations, _ = replay_canonical_engine(dataset, config)
    for item, history in zip(observations, histories, strict=True):
        history.captured_inputs[0]["expected_decision"] = {
            field: getattr(item, field)
            for field in (
                "shared_decision_id",
                "display_action",
                "eligibility_status",
                "entry_readiness",
                "opportunity_quality",
                "trigger_price",
                "invalidation_price",
                "target_price",
            )
        }
    observations, _ = replay_canonical_engine(dataset, config)
    enriched = enrich_features(observations, dataset, config)
    assert all(item.sector is None for item in observations)
    assert all(dict(row.research_features)["turnover_trades"] == 0 for row in enriched)
    assert all(
        dict(row.research_features)[family] is None
        for row in enriched
        for family in ("relative_strength", "breadth_persistence")
    )
    chosen, _, coverage = challenger_ranking(enriched, ("breadth_persistence",))
    assert chosen == top_five(enriched)
    assert coverage == {"available": 0, "total": 2, "fallback_dates": 1}
    evidence = coverage_evidence(dataset, observations, config)
    assert evidence["parity_comparisons"] == 2 and evidence["same_input_parity_failures"] == 0
    assert not evidence["canonical_coverage_verified"] and not evidence["coverage_verified"]
    assert "LISTED_MEMBERSHIP_COVERAGE_UNKNOWN" in evidence["canonical_coverage_gaps"]
    assert set(evidence["coverage_gaps"]) == {
        "LISTED_MEMBERSHIP_COVERAGE_UNKNOWN",
        "MARKET_SUMMARY_PIT_UNKNOWN",
        "SECTOR_CLASSIFICATION_PIT_UNKNOWN",
    }
    archive = dataset_archive(dataset)
    assert archive["challenger_input_provenance"]["market_summaries"] == "RETROSPECTIVE_SNAPSHOT"
    assert archive["challenger_input_provenance"]["sector_classifications"] == "CURRENT_METADATA"
    for row in archive["market_summaries"]:
        row["advancing_issues"], row["declining_issues"] = 10, 90
    archive["histories"][0]["stock"]["sector"] = "Later reclassification"
    corrected = restore_dataset(archive)
    assert corrected.market_summaries[0].updated_at > cutoff
    replayed, _ = replay_canonical_engine(corrected, config)
    assert observations == replayed
    assert enriched == enrich_features(replayed, corrected)
    assert coverage_evidence(corrected, replayed, config) == evidence
