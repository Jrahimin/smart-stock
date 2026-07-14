from dataclasses import replace
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.core.enums import (
    DataQualityFlag,
    PatternStatus,
    TradePlanStatus,
    TraderRecommendation,
    TrendDirection,
)
from app.modules.stock_details.decision.breakout import analyze_breakout
from app.modules.stock_details.decision.patterns import (
    PatternDetection,
    _detect_flag,
    _detect_triangle,
    _reconcile_patterns,
)
from app.modules.stock_details.decision.technical import SwingPoint, TechnicalSnapshot
from app.modules.stock_details.stock_details_schemas import (
    BreakoutAnalysisRead,
    PatternDetectionRead,
    TradePlanRead,
    TraderDecisionRead,
)


def _snapshot(**overrides) -> TechnicalSnapshot:
    base = TechnicalSnapshot(
        latest_price=30.5,
        previous_close=30.0,
        price_change=0.5,
        price_change_percent=1.6,
        volume=1_000_000,
        average_volume=900_000.0,
        turnover=30_500_000.0,
        rsi=50.0,
        sma20=30.0,
        ema20=30.1,
        volatility=2.0,
        support=30.0,
        resistance=31.4,
        trend=TrendDirection.SIDEWAYS,
        data_quality=DataQualityFlag.OK,
        latest_trade_date="2026-07-09",
        ohlcv_row_count=60,
        is_breakout=False,
    )
    return replace(base, **overrides) if overrides else base


def _pattern(
    *,
    name: str,
    direction: str,
    breakout_level: float,
    target_estimate: float,
    confidence: int = 63,
    status: PatternStatus = PatternStatus.CONFIRMED,
) -> PatternDetection:
    return PatternDetection(
        name=name,
        confidence=confidence,
        status=status,
        breakout_level=breakout_level,
        target_estimate=target_estimate,
        invalidation_level=None,
        swing_points=[],
        matched_reasons=["test"],
        target_calculation="test",
        direction=direction,
    )


def test_analyze_breakout_does_not_force_forming_neutral_pattern_bearish() -> None:
    patterns = [
        _pattern(
            name="Symmetrical Triangle",
            direction="neutral",
            breakout_level=30.0,
            target_estimate=27.2,
            status=PatternStatus.FORMING,
        )
    ]
    result = analyze_breakout(_snapshot(), patterns)

    assert result.direction == "breakout"
    assert result.breakout_level == _snapshot().resistance
    assert result.projected_target != 27.2


def test_analyze_breakout_keeps_bullish_triangle_as_breakout() -> None:
    patterns = [
        _pattern(
            name="Ascending Triangle",
            direction="bullish",
            breakout_level=31.4,
            target_estimate=34.0,
        )
    ]
    result = analyze_breakout(_snapshot(), patterns)

    assert result.direction == "breakout"
    assert result.projected_target == 34.0
    assert result.evidence_score == result.probability


def test_reconcile_patterns_keeps_one_triangle_when_multiple_match() -> None:
    ascending = _pattern(
        name="Ascending Triangle",
        direction="bullish",
        breakout_level=31.4,
        target_estimate=34.0,
        confidence=63,
    )
    symmetrical = _pattern(
        name="Symmetrical Triangle",
        direction="neutral",
        breakout_level=30.0,
        target_estimate=27.2,
        confidence=63,
    )

    reconciled = _reconcile_patterns([symmetrical, ascending])

    assert len(reconciled) == 1
    assert reconciled[0].name == "Ascending Triangle"


def _triangle_swings(kind: str) -> list[SwingPoint]:
    if kind == "ascending":
        highs = [105.0, 104.8, 105.1]
        lows = [96.0, 98.0, 100.0]
    elif kind == "symmetrical":
        highs = [105.0, 103.0, 101.0]
        lows = [95.0, 97.0, 99.0]
    else:
        highs = [105.0, 103.0, 101.0]
        lows = [96.0, 96.2, 96.1]
    points: list[SwingPoint] = []
    for index, value in enumerate(highs):
        points.append(
            SwingPoint(
                index=index * 4 + 2,
                date=f"2026-01-{index * 4 + 3:02d}",
                price=value,
                kind="high",
            )
        )
    for index, value in enumerate(lows):
        points.append(
            SwingPoint(
                index=index * 4 + 4,
                date=f"2026-01-{index * 4 + 5:02d}",
                price=value,
                kind="low",
            )
        )
    return points


@pytest.mark.parametrize(
    ("kind", "latest_price", "expected_direction"),
    [("ascending", 106.0, "bullish"), ("descending", 95.0, "bearish")],
)
def test_triangle_requires_price_and_volume_trigger(
    kind: str,
    latest_price: float,
    expected_direction: str,
) -> None:
    triggered = _detect_triangle(
        _snapshot(latest_price=latest_price, volume=2_000_000, average_volume=1_000_000),
        _triangle_swings(kind),
        kind,
    )
    untriggered = _detect_triangle(
        _snapshot(latest_price=100.5, volume=2_000_000, average_volume=1_000_000),
        _triangle_swings(kind),
        kind,
    )

    assert triggered is not None
    assert triggered.status == PatternStatus.CONFIRMED
    assert triggered.direction == expected_direction
    assert untriggered is not None
    assert untriggered.status == PatternStatus.FORMING


def test_symmetrical_triangle_stays_neutral_until_trigger() -> None:
    pattern = _detect_triangle(
        _snapshot(latest_price=100.0, volume=2_000_000, average_volume=1_000_000),
        _triangle_swings("symmetrical"),
        "symmetrical",
    )

    assert pattern is not None
    assert pattern.status == PatternStatus.FORMING
    assert pattern.direction == "neutral"
    assert pattern.breakout_level is None
    assert pattern.target_estimate is None


@pytest.mark.parametrize(
    ("bullish", "latest_close", "expected_direction"),
    [(True, 111.0, "bullish"), (False, 89.0, "bearish")],
)
def test_flag_requires_crossing_before_confirmation(
    bullish: bool,
    latest_close: float,
    expected_direction: str,
) -> None:
    pole = [100.0 + (10.0 if bullish else -10.0) * index / 8 for index in range(9)]
    consolidation = [109.0 if bullish else 91.0] * 10
    closes = [100.0] * 5 + pole + consolidation + [latest_close]
    prices = [
        SimpleNamespace(
            trade_date=date(2026, 1, 1) + timedelta(days=index),
            close_price=Decimal(str(close)),
        )
        for index, close in enumerate(closes)
    ]
    snapshot = _snapshot(
        latest_price=latest_close,
        volume=2_000_000,
        average_volume=1_000_000,
    )

    pattern = _detect_flag(snapshot, prices, bullish)
    forming_prices = prices[:-1] + [
        SimpleNamespace(
            trade_date=prices[-1].trade_date,
            close_price=Decimal("109" if bullish else "91"),
        )
    ]
    forming = _detect_flag(
        replace(snapshot, latest_price=109.0 if bullish else 91.0),
        forming_prices,
        bullish,
    )

    assert pattern is not None
    assert pattern.status == PatternStatus.CONFIRMED
    assert pattern.direction == expected_direction
    assert forming is not None
    assert forming.status == PatternStatus.FORMING


def test_phase_one_api_keeps_legacy_fields_with_honest_semantics() -> None:
    decision = TraderDecisionRead(
        recommendation=TraderRecommendation.WAIT,
        confidence=52,
        reasoning=["test"],
    ).model_dump()
    pattern = PatternDetectionRead(
        name="Symmetrical Triangle",
        confidence=63,
        pattern_match_score=63,
        status=PatternStatus.FORMING,
        breakout_level=None,
        target_estimate=None,
        invalidation_level=None,
        swing_points=[],
        matched_reasons=[],
        target_calculation="test",
        direction="neutral",
    ).model_dump()
    breakout = BreakoutAnalysisRead(
        probability=40,
        evidence_score=40,
        factors=[],
        breakout_level=None,
        confirmation_level=None,
        projected_target=None,
        explanation="test",
    ).model_dump()
    plan = TradePlanRead(
        entry_zone_low=None,
        entry_zone_high=None,
        stop_loss=None,
        target_low=None,
        target_high=None,
        risk_reward_ratio=None,
        explanation="unavailable",
        status=TradePlanStatus.UNAVAILABLE,
    ).model_dump()

    assert decision["confidence"] == 52
    assert decision["confidence_semantics"] == "HEURISTIC_EVIDENCE"
    assert pattern["confidence"] == pattern["pattern_match_score"] == 63
    assert pattern["score_semantics"] == "HEURISTIC_PATTERN_MATCH"
    assert breakout["probability"] == breakout["evidence_score"] == 40
    assert breakout["score_semantics"] == "HEURISTIC_BREAKOUT_EVIDENCE"
    assert plan["status"] == TradePlanStatus.UNAVAILABLE
    assert plan["reasons"] == []
