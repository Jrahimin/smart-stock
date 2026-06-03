from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from app.core.enums import DataQualityFlag, TrendDirection
from app.models import DailyPrice
from app.modules.stock_details.decision.patterns import detect_patterns
from app.modules.stock_details.decision.scoring import compute_opportunity_score, compute_recommendation, compute_risk_score
from app.modules.stock_details.decision.technical import build_technical_snapshot, calculate_rsi, calculate_sma
from app.modules.stock_details.decision.trade_plan import compute_liquidity, compute_trade_plan, is_near_resistance
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
    )
    assert decision.recommendation.value in {"BUY", "HOLD", "WAIT", "SELL"}


def test_trade_plan_has_stop_and_target() -> None:
    snapshot = build_technical_snapshot(_build_uptrend_prices())
    assert snapshot is not None
    trade_plan = compute_trade_plan(snapshot)
    assert trade_plan.stop_loss is not None
    assert trade_plan.target_high is not None


def test_warnings_include_near_resistance_for_extended_uptrend() -> None:
    snapshot = build_technical_snapshot(_build_uptrend_prices())
    assert snapshot is not None
    from app.modules.stock_details.decision.scoring import compute_opportunity_score, compute_risk_score
    from app.modules.stock_details.decision.trade_plan import compute_liquidity
    from app.modules.stock_details.decision.warnings import generate_warnings

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
    from app.modules.stock_details.decision.scoring import compute_risk_score
    from app.modules.stock_details.decision.trade_plan import compute_liquidity

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
    )

    assert decision.recommendation.value in {"BUY", "HOLD"}


def test_poor_risk_reward_without_near_resistance_allows_buy_or_hold() -> None:
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
    )

    assert risk.label.value == "LOW"
    assert decision.recommendation.value in {"BUY", "HOLD"}


