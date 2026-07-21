from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from statistics import pstdev
from uuid import uuid4

import pytest

from app.core.enums import (
    DataQualityFlag,
    EligibilityStatus,
    ExchangeCode,
    TraderRecommendation,
    TurnoverProvenance,
)
from app.models import DailyPrice, Stock
from app.modules.market_pulse.market_pulse_service import is_eligible_pulse_candidate
from app.modules.market_universe.market_universe_compute import build_scored_universe_rows
from app.modules.stock_details.decision.data_eligibility import evaluate_data_eligibility
from app.modules.stock_details.decision.engine import compute_trader_decision_from_prices
from app.modules.stock_details.decision.technical import (
    build_technical_snapshot,
    calculate_atr,
    calculate_ema,
    calculate_rsi,
    calculate_sma,
    is_valid_ohlc_row,
)


def _price(
    trade_date: date,
    close: float,
    *,
    volume: int = 100_000,
    turnover: float = 5_000_000,
    provenance: TurnoverProvenance = TurnoverProvenance.REPORTED,
    quality: DataQualityFlag = DataQualityFlag.OK,
) -> DailyPrice:
    return DailyPrice(
        id=uuid4(),
        stock_id=uuid4(),
        trade_date=trade_date,
        open_price=Decimal(str(close)),
        high_price=Decimal(str(close + 0.5)),
        low_price=Decimal(str(max(0, close - 0.5))),
        close_price=Decimal(str(close)),
        adjusted_close_price=None,
        previous_close_price=None,
        price_change=None,
        price_change_percent=None,
        volume=volume,
        turnover=Decimal(str(turnover)),
        turnover_provenance=provenance,
        source="TEST",
        data_quality_flag=quality,
    )


def _prices(
    count: int = 60,
    *,
    start_date: date = date(2026, 1, 1),
    volume: int = 100_000,
    turnover: float = 5_000_000,
    provenance: TurnoverProvenance = TurnoverProvenance.REPORTED,
) -> list[DailyPrice]:
    return [
        _price(
            start_date + timedelta(days=index),
            100 + index * 0.2,
            volume=volume,
            turnover=turnover,
            provenance=provenance,
        )
        for index in range(count)
    ]


def _eligibility(
    prices: list[DailyPrice],
    *,
    sessions: list[date] | None = None,
    action_dates: set[date] | None = None,
):
    snapshot = build_technical_snapshot(prices)
    assert snapshot is not None
    return evaluate_data_eligibility(
        prices,
        snapshot,
        category="A",
        is_active=True,
        exchange_session_dates=sessions or [prices[-1].trade_date],
        known_corporate_action_dates=action_dates,
    )


def test_known_indicator_and_wilder_atr_fixtures() -> None:
    assert calculate_sma([float(value) for value in range(1, 21)], 20) == 10.5
    assert calculate_ema([float(value) for value in range(1, 22)], 20) == 11.5
    rsi_series = [
        44.34,
        44.09,
        44.15,
        43.61,
        44.33,
        44.83,
        45.10,
        45.42,
        45.84,
        46.08,
        45.89,
        46.03,
        45.61,
        46.28,
        46.28,
    ]
    assert calculate_rsi(rsi_series, 14) == pytest.approx(70.4641, abs=1e-3)
    assert calculate_atr(
        [10, 12, 13, 14],
        [10, 9, 11, 12],
        [10, 11, 12, 13],
        period=2,
    ) == pytest.approx(2.25)


def test_volatility_is_derived_from_closes_when_stored_changes_are_null() -> None:
    prices = _prices()
    snapshot = build_technical_snapshot(prices)
    assert snapshot is not None
    closes = [float(price.close_price) for price in prices[-21:]]
    expected_returns = [
        (current / previous - 1) * 100
        for previous, current in zip(closes, closes[1:], strict=False)
    ]
    assert all(price.price_change_percent is None for price in prices)
    assert snapshot.volatility == pytest.approx(pstdev(expected_returns))


def test_out_of_order_input_and_malformed_ohlc_row_are_handled_atomically() -> None:
    valid_prices = _prices()
    malformed = _price(date(2026, 3, 5), 150)
    malformed.high_price = Decimal("149")
    mixed = list(reversed(valid_prices[:30])) + [malformed] + list(reversed(valid_prices[30:]))

    expected = build_technical_snapshot(valid_prices)
    actual = build_technical_snapshot(mixed)

    assert expected is not None and actual is not None
    assert actual.invalid_ohlcv_row_count == 1
    assert actual.latest_price == expected.latest_price
    assert actual.rsi == pytest.approx(expected.rsi)
    assert actual.atr14 == pytest.approx(expected.atr14)


@pytest.mark.parametrize("field_name", ["open_price", "high_price", "low_price", "close_price"])
def test_zero_ohlc_is_a_non_tradable_placeholder(field_name: str) -> None:
    row = _price(date(2026, 5, 18), 100)
    setattr(row, field_name, Decimal("0"))

    assert is_valid_ohlc_row(row) is False

    valid_prices = _prices()
    expected = build_technical_snapshot(valid_prices)
    actual = build_technical_snapshot([*valid_prices[:30], row, *valid_prices[30:]])

    assert expected is not None and actual is not None
    assert actual.invalid_ohlcv_row_count == 1
    assert actual.rsi == pytest.approx(expected.rsi)


def test_robust_volume_baseline_ignores_one_block_outlier() -> None:
    prices = _prices(22, volume=1_000)
    prices[10].volume = 100_000
    snapshot = build_technical_snapshot(prices)
    assert snapshot is not None
    assert snapshot.average_volume == 1_000
    assert snapshot.volume_observation_count == 20


def test_zero_volume_and_low_traded_session_coverage_fail_safely() -> None:
    prices = _prices()
    for index, price in enumerate(prices):
        if index % 3 == 0:
            price.volume = 0
    result = _eligibility(prices)
    assert result.traded_session_ratio == pytest.approx(2 / 3, abs=1e-4)
    assert result.status == EligibilityStatus.LIMITED
    assert "low_traded_session_coverage" in result.reason_codes

    prices[-1].volume = 0
    latest_zero = _eligibility(prices)
    assert latest_zero.status == EligibilityStatus.REVIEW_ONLY
    assert "latest_session_zero_volume" in latest_zero.reason_codes


def test_staleness_counts_exchange_sessions_not_calendar_days() -> None:
    prices = _prices(start_date=date(2026, 5, 1))
    latest = prices[-1].trade_date
    holiday_gap = _eligibility(prices, sessions=[latest])
    assert holiday_gap.missed_session_count == 0
    assert holiday_gap.status == EligibilityStatus.ELIGIBLE

    missed_sessions = _eligibility(
        prices,
        sessions=[latest, latest + timedelta(days=3), latest + timedelta(days=4)],
    )
    assert missed_sessions.missed_session_count == 2
    assert missed_sessions.status == EligibilityStatus.REVIEW_ONLY
    assert "stale_by_exchange_sessions" in missed_sessions.reason_codes


def test_low_estimated_turnover_is_limited_with_explicit_provenance() -> None:
    prices = _prices(
        turnover=1_000_000,
        provenance=TurnoverProvenance.ESTIMATED,
    )
    result = _eligibility(prices)
    assert result.status == EligibilityStatus.LIMITED
    assert result.turnover_provenance == TurnoverProvenance.ESTIMATED
    assert "median_turnover_below_policy" in result.reason_codes
    assert "turnover_not_reported" in result.reason_codes


def test_recent_healthy_quality_recovers_from_older_partial_history() -> None:
    prices = _prices()
    # The last 50 rows contain 21 PARTIAL rows, matching the live deployment
    # pattern, while the most recent 20 sessions are healthy.
    for price in prices[10:31]:
        price.data_quality_flag = DataQualityFlag.PARTIAL

    result = _eligibility(prices)

    assert result.status == EligibilityStatus.ELIGIBLE
    assert result.quality_partial_count == 21
    assert "excessive_partial_history" not in result.reason_codes


def test_recent_partial_history_remains_limited() -> None:
    prices = _prices()
    # Keep the latest row healthy so this exercises the recovery-window rule,
    # rather than the separate latest-row PARTIAL safeguard.
    for price in prices[40:51]:
        price.data_quality_flag = DataQualityFlag.PARTIAL

    result = _eligibility(prices)

    assert result.status == EligibilityStatus.LIMITED
    assert "excessive_partial_history" in result.reason_codes


def test_recent_quality_recovery_does_not_waive_suspicious_history() -> None:
    prices = _prices()
    for price in prices[10:31]:
        price.data_quality_flag = DataQualityFlag.PARTIAL
    prices[31].data_quality_flag = DataQualityFlag.SUSPICIOUS

    result = _eligibility(prices)

    assert result.status == EligibilityStatus.REVIEW_ONLY
    assert "excessive_partial_history" not in result.reason_codes
    assert "suspicious_price_quality" in result.reason_codes


def test_known_and_unresolved_corporate_actions_review_but_genuine_crash_does_not() -> None:
    known_prices = _prices()
    known = _eligibility(
        known_prices,
        action_dates={known_prices[-1].trade_date},
    )
    assert known.status == EligibilityStatus.REVIEW_ONLY
    assert known.corporate_action_status == "KNOWN_UNADJUSTED"

    unresolved_prices = _prices()
    unresolved_prices[-1] = _price(
        unresolved_prices[-1].trade_date,
        float(unresolved_prices[-2].close_price) * 0.84,
    )
    unresolved = _eligibility(unresolved_prices)
    assert unresolved.status == EligibilityStatus.REVIEW_ONLY
    assert unresolved.corporate_action_status == "UNRESOLVED_DISCONTINUITY"

    crash_prices = [
        _price(date(2026, 1, 1) + timedelta(days=index), 140 - index * 0.5)
        for index in range(60)
    ]
    crash_prices[-1] = _price(
        crash_prices[-1].trade_date,
        float(crash_prices[-2].close_price) * 0.84,
    )
    crash_bundle = compute_trader_decision_from_prices(
        crash_prices,
        category="A",
        exchange_session_dates=[crash_prices[-1].trade_date],
    )
    assert crash_bundle is not None and crash_bundle.eligibility is not None
    assert crash_bundle.eligibility.corporate_action_status == "GENUINE_DOWNTREND"
    assert crash_bundle.suspected_adjustment is False
    assert crash_bundle.decision.recommendation in {
        TraderRecommendation.SELL,
        TraderRecommendation.WAIT,
    }


def test_universe_and_detail_engine_share_identical_eligibility_context() -> None:
    stock = Stock(
        id=uuid4(),
        symbol="SAME",
        name="Same Limited",
        exchange=ExchangeCode.DSE,
        category="A",
        is_active=True,
        should_fetch_details=False,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    prices = _prices()
    for price in prices:
        price.stock_id = stock.id
    sessions = [prices[-1].trade_date]
    action_dates = {prices[-1].trade_date}

    detail_bundle = compute_trader_decision_from_prices(
        prices,
        category=stock.category,
        exchange_session_dates=sessions,
        known_corporate_action_dates=action_dates,
        is_active=stock.is_active,
    )
    universe_rows = build_scored_universe_rows(
        {str(stock.id): {"stock": stock, "prices": prices}},
        exchange_session_dates=sessions,
        corporate_action_dates_by_stock={stock.id: action_dates},
    )

    assert detail_bundle is not None and detail_bundle.eligibility is not None
    assert len(universe_rows) == 1 and universe_rows[0].eligibility is not None
    universe_eligibility = universe_rows[0].eligibility
    assert universe_eligibility.status == detail_bundle.eligibility.status
    assert universe_eligibility.reason_codes == list(detail_bundle.eligibility.reason_codes)
    assert (
        universe_eligibility.corporate_action_status
        == detail_bundle.eligibility.corporate_action_status
    )
    assert is_eligible_pulse_candidate(universe_rows[0]) is False
