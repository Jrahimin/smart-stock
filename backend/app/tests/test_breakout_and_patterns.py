from dataclasses import replace

import pytest

from app.core.enums import DataQualityFlag, PatternStatus, TrendDirection
from app.modules.stock_details.decision.breakout import analyze_breakout
from app.modules.stock_details.decision.patterns import PatternDetection, _reconcile_patterns
from app.modules.stock_details.decision.technical import TechnicalSnapshot


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
) -> PatternDetection:
    return PatternDetection(
        name=name,
        confidence=confidence,
        status=PatternStatus.ACTIVE,
        breakout_level=breakout_level,
        target_estimate=target_estimate,
        invalidation_level=None,
        swing_points=[],
        matched_reasons=["test"],
        target_calculation="test",
        direction=direction,
    )


def test_analyze_breakout_marks_downside_symmetrical_as_breakdown() -> None:
    patterns = [
        _pattern(
            name="Symmetrical Triangle",
            direction="neutral",
            breakout_level=30.0,
            target_estimate=27.2,
        )
    ]
    result = analyze_breakout(_snapshot(), patterns)

    assert result.direction == "breakdown"
    assert result.breakout_level == 30.0
    assert result.projected_target == 27.2


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
