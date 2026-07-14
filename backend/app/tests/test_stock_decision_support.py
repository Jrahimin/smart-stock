from dataclasses import replace
from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from app.core.constants.trading_constants import (
    MARKET_REGIME_BEARISH,
    STRUCTURE_LOWER,
    TRADE_PLAN_MAX_RISK_PERCENT,
)
from app.core.enums import (
    DataQualityFlag,
    TradePlanStatus,
    TraderRecommendation,
    TrendDirection,
)
from app.models import DailyPrice
from app.modules.stock_details.decision.engine import compute_trader_decision_from_prices
from app.modules.stock_details.decision.patterns import detect_patterns
from app.modules.stock_details.decision.scoring import (
    _score_price_position,
    compute_opportunity_score,
    compute_recommendation,
    compute_risk_score,
)
from app.modules.stock_details.decision.technical import (
    build_technical_snapshot,
    calculate_rsi,
    calculate_sma,
)
from app.modules.stock_details.decision.trade_plan import (
    align_trade_plan_with_decision,
    compute_liquidity,
    compute_trade_plan,
    is_near_resistance,
)
from app.modules.stock_details.decision.warnings import generate_warnings


def _price(
    trade_date: date,
    *,
    close: float,
    high: float | None = None,
    low: float | None = None,
    volume: int = 1_000_000,
    change_percent: float | None = None,
) -> DailyPrice:
    return DailyPrice(
        id=uuid4(),
        stock_id=uuid4(),
        trade_date=trade_date,
        open_price=Decimal(str(close - 0.2)),
        high_price=Decimal(str(high if high is not None else close + 0.5)),
        low_price=Decimal(str(low if low is not None else close - 0.5)),
        close_price=Decimal(str(close)),
        volume=volume,
        source="TEST",
        data_quality_flag=DataQualityFlag.OK,
    )


def _build_uptrend_prices(count: int = 40, start: float = 20.0) -> list[DailyPrice]:
    prices: list[DailyPrice] = []
    for index in range(count):
        close = start + index * 0.25
        prices.append(
            _price(
                date(2026, 1, 1).replace(day=min(28, 1 + index)),
                close=close,
                high=close + 0.4,
                low=close - 0.3,
                volume=1_200_000 + index * 10_000,
                change_percent=0.8,
            )
        )
    return prices


def test_calculate_sma_and_rsi() -> None:
    values = [float(index) for index in range(1, 30)]
    assert calculate_sma(values, 20) == pytest.approx(sum(values[-20:]) / 20)
    assert calculate_rsi(values) is not None


def test_opportunity_and_risk_scores_for_uptrend() -> None:
    snapshot = build_technical_snapshot(_build_uptrend_prices())
    assert snapshot is not None
    liquidity = compute_liquidity(snapshot)
    risk = compute_risk_score(snapshot, "B", liquidity.label, is_stale=False, is_sparse=False)
    opportunity = compute_opportunity_score(snapshot, risk.score, liquidity.label)
    assert 0 <= opportunity.score <= 100
    assert 0 <= risk.score <= 100
    assert snapshot.trend == TrendDirection.UPTREND


def test_recommendation_mapping_buy_or_hold() -> None:
    snapshot = build_technical_snapshot(_build_uptrend_prices())
    assert snapshot is not None
    liquidity = compute_liquidity(snapshot)
    risk = compute_risk_score(snapshot, "B", liquidity.label, is_stale=False, is_sparse=False)
    opportunity = compute_opportunity_score(snapshot, risk.score, liquidity.label)
    trade_plan = compute_trade_plan(snapshot)
    decision = compute_recommendation(
        snapshot,
        opportunity,
        risk,
        near_resistance=is_near_resistance(snapshot),
        below_support=False,
        risk_reward=trade_plan.risk_reward_ratio,
        is_stale=False,
        is_sparse=False,
        trade_plan_status=trade_plan.status,
    )
    assert decision.recommendation.value in {"BUY", "HOLD", "WAIT", "SELL"}


def test_trade_plan_has_stop_and_target() -> None:
    snapshot = build_technical_snapshot(_build_uptrend_prices())
    assert snapshot is not None
    snapshot = replace(
        snapshot,
        support=(snapshot.latest_price or 30) * 0.96,
        resistance=(snapshot.latest_price or 30) * 1.25,
    )
    trade_plan = compute_trade_plan(snapshot)
    assert trade_plan.status == TradePlanStatus.VALID_ENTRY_PLAN
    assert trade_plan.stop_loss is not None
    assert trade_plan.target_high is not None
    assert 0 < trade_plan.stop_loss < trade_plan.entry_zone_low <= trade_plan.entry_zone_high
    assert trade_plan.entry_zone_high < trade_plan.target_low <= trade_plan.target_high


def test_warnings_include_near_resistance_for_extended_uptrend() -> None:
    snapshot = build_technical_snapshot(_build_uptrend_prices())
    assert snapshot is not None
    liquidity = compute_liquidity(snapshot)
    risk = compute_risk_score(snapshot, "B", liquidity.label, is_stale=False, is_sparse=False)
    opportunity = compute_opportunity_score(snapshot, risk.score, liquidity.label)
    warnings = generate_warnings(
        snapshot,
        opportunity,
        risk,
        liquidity,
        is_stale=False,
        is_sparse=False,
        category="B",
    )
    assert any(warning.code == "near_resistance" for warning in warnings)


def test_stale_data_flag_when_old_trade_date() -> None:
    prices = _build_uptrend_prices(25)
    prices[-1] = _price(date(2020, 1, 1), close=30.0)
    snapshot = build_technical_snapshot(prices)
    assert snapshot is not None
    liquidity = compute_liquidity(snapshot)
    risk = compute_risk_score(snapshot, "Z", liquidity.label, is_stale=True, is_sparse=False)
    assert risk.label.value in {"HIGH", "SPECULATIVE"}


def test_zero_support_does_not_crash_warning_generation() -> None:
    snapshot = build_technical_snapshot(
        [
            _price(date(2026, 1, 1), close=0.0, high=0.0, low=0.0, volume=10),
            _price(date(2026, 1, 2), close=1.0, high=1.0, low=0.0, volume=10),
        ]
        * 11
    )
    assert snapshot is not None
    liquidity = compute_liquidity(snapshot)
    risk = compute_risk_score(snapshot, "B", liquidity.label, is_stale=False, is_sparse=False)
    opportunity = compute_opportunity_score(snapshot, risk.score, liquidity.label)

    warnings = generate_warnings(
        snapshot,
        opportunity,
        risk,
        liquidity,
        is_stale=False,
        is_sparse=False,
        category="B",
    )

    assert isinstance(warnings, list)


def test_speculative_uptrend_near_resistance_waits_not_sell() -> None:
    snapshot = build_technical_snapshot(_build_uptrend_prices())
    assert snapshot is not None
    liquidity = compute_liquidity(snapshot)
    risk = compute_risk_score(snapshot, "Z", liquidity.label, is_stale=False, is_sparse=False)
    opportunity = compute_opportunity_score(snapshot, risk.score, liquidity.label)
    trade_plan = compute_trade_plan(snapshot)

    decision = compute_recommendation(
        snapshot,
        opportunity,
        risk,
        near_resistance=True,
        below_support=False,
        risk_reward=trade_plan.risk_reward_ratio,
        is_stale=False,
        is_sparse=False,
        trade_plan_status=trade_plan.status,
    )

    assert decision.recommendation.value in {"WAIT", "HOLD"}


def test_uptrend_near_resistance_can_buy_when_participation_is_present() -> None:
    snapshot = build_technical_snapshot(_build_uptrend_prices())
    assert snapshot is not None
    liquidity = compute_liquidity(snapshot)
    risk = compute_risk_score(snapshot, "A", liquidity.label, is_stale=False, is_sparse=False)
    opportunity = compute_opportunity_score(snapshot, risk.score, liquidity.label)
    trade_plan = compute_trade_plan(snapshot)

    decision = compute_recommendation(
        snapshot,
        opportunity,
        risk,
        near_resistance=True,
        below_support=False,
        risk_reward=trade_plan.risk_reward_ratio,
        is_stale=False,
        is_sparse=False,
        trade_plan_status=trade_plan.status,
    )

    assert decision.recommendation.value in {"BUY", "HOLD"}


def test_poor_risk_reward_without_near_resistance_cannot_buy() -> None:
    prices = _build_uptrend_prices(40, start=18.0)
    snapshot = build_technical_snapshot(prices)
    assert snapshot is not None

    liquidity = compute_liquidity(snapshot)
    risk = compute_risk_score(snapshot, "A", liquidity.label, is_stale=False, is_sparse=False)
    opportunity = compute_opportunity_score(snapshot, risk.score, liquidity.label)

    decision = compute_recommendation(
        snapshot,
        opportunity,
        risk,
        near_resistance=False,
        below_support=False,
        risk_reward=0.56,
        is_stale=False,
        is_sparse=False,
        trade_plan_status=TradePlanStatus.WATCH_ONLY,
    )

    assert risk.label.value == "LOW"
    assert decision.recommendation == TraderRecommendation.HOLD


# --- Overhaul phase fixtures -------------------------------------------------


def _bullish_snapshot():
    """A clean, BUY-worthy uptrend snapshot (moderate RSI, room to resistance)."""
    base = build_technical_snapshot(_build_uptrend_prices(40))
    assert base is not None
    price = base.latest_price or 30.0
    return replace(base, rsi=60.0, resistance=price * 1.25, support=price * 0.96)


def _decide(
    snapshot,
    *,
    near_resistance=False,
    below_support=False,
    risk_reward=2.0,
    market_regime=None,
):
    liquidity = compute_liquidity(snapshot)
    risk = compute_risk_score(snapshot, "A", liquidity.label, is_stale=False, is_sparse=False)
    opportunity = compute_opportunity_score(snapshot, risk.score, liquidity.label)
    trade_plan = compute_trade_plan(snapshot)
    return compute_recommendation(
        snapshot,
        opportunity,
        risk,
        near_resistance=near_resistance,
        below_support=below_support,
        risk_reward=risk_reward,
        is_stale=False,
        is_sparse=False,
        liquidity_label=liquidity.label,
        market_regime=market_regime,
        trade_plan_status=trade_plan.status,
    )


def test_rsi_flat_series_is_neutral() -> None:
    assert calculate_rsi([25.0] * 30) == 50.0


def test_trend_survives_single_red_day() -> None:
    prices = _build_uptrend_prices(40)
    # Replace the last session with a red day that still sits above SMA20.
    last_date = prices[-1].trade_date
    prices[-1] = _price(last_date, close=29.0, high=29.4, low=28.6, volume=1_500_000, change_percent=-2.5)
    snapshot = build_technical_snapshot(prices)
    assert snapshot is not None
    assert snapshot.trend == TrendDirection.UPTREND


def test_breakout_does_not_bypass_invalid_entry_plan() -> None:
    base = _bullish_snapshot()
    breakout = replace(base, is_breakout=True, resistance=(base.latest_price or 30) * 1.01)
    decision = _decide(breakout, near_resistance=True, risk_reward=0.5)
    assert decision.recommendation == TraderRecommendation.HOLD
    assert any(
        "entry plan" in reason.lower() or "entry-plan" in reason.lower()
        for reason in decision.reasoning
    )


def test_deep_structural_stop_is_preserved_and_plan_is_watch_only() -> None:
    base = build_technical_snapshot(_build_uptrend_prices(40))
    assert base is not None
    price = base.latest_price or 30.0
    # Support far below and a large ATR would push the stop out; it must be capped.
    deep = replace(base, support=price * 0.7, resistance=price * 1.4, atr14=price * 0.1)
    plan = compute_trade_plan(deep)
    entry_mid = (plan.entry_zone_low + plan.entry_zone_high) / 2
    risk_percent = (entry_mid - plan.stop_loss) / entry_mid * 100
    assert plan.status == TradePlanStatus.WATCH_ONLY
    assert risk_percent > TRADE_PLAN_MAX_RISK_PERCENT
    volatility_buffer = (base.volatility or 1.5) * 0.5 / 100
    assert plan.stop_loss == pytest.approx(price * 0.7 * (1 - volatility_buffer), rel=1e-4)


@pytest.mark.parametrize(
    ("distance_percent", "expected_score"),
    [
        (-1.0, 30),
        (-0.01, 30),
        (0.0, 62),
        (2.999, 62),
        (3.0, 62),
        (3.001, 50),
    ],
)
def test_price_position_support_distance_boundaries(
    distance_percent: float,
    expected_score: int,
) -> None:
    snapshot = replace(
        _bullish_snapshot(),
        support=100.0,
        latest_price=100.0 * (1 + distance_percent / 100),
        resistance=None,
        is_breakout=False,
    )

    component = _score_price_position(snapshot)

    assert component.score == expected_score


def test_trade_plan_without_positive_price_is_unavailable() -> None:
    plan = compute_trade_plan(replace(_bullish_snapshot(), latest_price=None))

    assert plan.status == TradePlanStatus.UNAVAILABLE
    assert plan.entry_zone_low is None
    assert plan.risk_reward_ratio is None


def test_trade_plan_status_matches_wait_and_sell_actions() -> None:
    plan = compute_trade_plan(_bullish_snapshot())
    assert plan.status == TradePlanStatus.VALID_ENTRY_PLAN

    wait_plan = align_trade_plan_with_decision(
        plan,
        TraderRecommendation.WAIT,
        is_stale=False,
        is_sparse=False,
    )
    sell_plan = align_trade_plan_with_decision(
        plan,
        TraderRecommendation.SELL,
        is_stale=False,
        is_sparse=False,
    )

    assert wait_plan.status == TradePlanStatus.WATCH_ONLY
    assert sell_plan.status == TradePlanStatus.UNAVAILABLE
    assert sell_plan.entry_zone_low is None


def test_bearish_structure_caps_buy_at_hold() -> None:
    base = _bullish_snapshot()
    assert _decide(base).recommendation == TraderRecommendation.BUY

    bearish_structure = replace(base, structure=STRUCTURE_LOWER)
    decision = _decide(bearish_structure)
    assert decision.recommendation == TraderRecommendation.HOLD
    assert any("structure" in reason.lower() for reason in decision.reasoning)


def test_bearish_regime_downgrades_buy() -> None:
    base = _bullish_snapshot()
    assert _decide(base).recommendation == TraderRecommendation.BUY

    decision = _decide(base, market_regime=MARKET_REGIME_BEARISH)
    assert decision.recommendation == TraderRecommendation.HOLD
    assert any("regime" in reason.lower() for reason in decision.reasoning)


def test_monotonic_uptrend_has_no_reversal_patterns() -> None:
    snapshot = build_technical_snapshot(_build_uptrend_prices(60))
    assert snapshot is not None
    patterns = detect_patterns(snapshot, _build_uptrend_prices(60))
    names = {pattern.name for pattern in patterns}
    assert "Double Top" not in names
    assert "Double Bottom" not in names
    assert "Head and Shoulders" not in names


def test_ex_date_drop_waits_instead_of_sell() -> None:
    prices: list[DailyPrice] = []
    for index in range(30):
        close = 100.0 + (index % 2) * 0.5
        prices.append(
            _price(
                date(2026, 1, 1).replace(day=min(28, 1 + index)),
                close=close,
                high=close + 0.4,
                low=close - 0.4,
                volume=1_000_000,
                change_percent=0.1,
            )
        )
    drop_date = date(2026, 2, 2)
    prices.append(_price(drop_date, close=84.0, high=99.0, low=83.5, volume=1_200_000, change_percent=-16.0))

    bundle = compute_trader_decision_from_prices(prices, category="A", reference_date=drop_date)
    assert bundle is not None
    assert bundle.suspected_adjustment is True
    assert bundle.decision.recommendation != TraderRecommendation.SELL
    assert bundle.trade_plan.status != TradePlanStatus.VALID_ENTRY_PLAN


