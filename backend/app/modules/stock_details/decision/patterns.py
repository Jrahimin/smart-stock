from __future__ import annotations

from dataclasses import dataclass
from app.core.constants.trading_constants import (
    PATTERN_MIN_CANDLES,
    PATTERN_SWING_LOOKBACK,
    PATTERN_TOLERANCE_VOLATILITY_MULTIPLIER,
    VOLUME_EXPANSION_RATIO,
)
from app.core.enums import PatternStatus
from app.models import DailyPrice
from app.modules.stock_details.decision.technical import TechnicalSnapshot, _to_float


@dataclass(frozen=True)
class SwingPoint:
    index: int
    date: str
    price: float
    kind: str


@dataclass(frozen=True)
class PatternDetection:
    name: str
    confidence: int
    status: PatternStatus
    breakout_level: float | None
    target_estimate: float | None
    invalidation_level: float | None
    swing_points: list[SwingPoint]
    matched_reasons: list[str]
    target_calculation: str
    direction: str


def _sorted_prices(prices: list[DailyPrice]) -> list[DailyPrice]:
    return sorted(prices, key=lambda price: price.trade_date)


def detect_swing_points(prices: list[DailyPrice], lookback: int = PATTERN_SWING_LOOKBACK) -> list[SwingPoint]:
    sorted_prices = _sorted_prices(prices)
    highs = [_to_float(price.high_price) for price in sorted_prices]
    lows = [_to_float(price.low_price) for price in sorted_prices]
    swings: list[SwingPoint] = []
    for index in range(lookback, len(sorted_prices) - lookback):
        high = highs[index]
        low = lows[index]
        if high is None or low is None:
            continue
        left_highs = [value for value in highs[index - lookback : index] if value is not None]
        right_highs = [value for value in highs[index + 1 : index + lookback + 1] if value is not None]
        left_lows = [value for value in lows[index - lookback : index] if value is not None]
        right_lows = [value for value in lows[index + 1 : index + lookback + 1] if value is not None]
        if left_highs and right_highs and high >= max(left_highs) and high >= max(right_highs):
            swings.append(
                SwingPoint(
                    index=index,
                    date=sorted_prices[index].trade_date.isoformat(),
                    price=high,
                    kind="high",
                )
            )
        if left_lows and right_lows and low <= min(left_lows) and low <= min(right_lows):
            swings.append(
                SwingPoint(
                    index=index,
                    date=sorted_prices[index].trade_date.isoformat(),
                    price=low,
                    kind="low",
                )
            )
    return sorted(swings, key=lambda point: point.index)


def _tolerance(snapshot: TechnicalSnapshot) -> float:
    base = snapshot.latest_price or 1.0
    volatility_factor = (snapshot.volatility or 1.5) * PATTERN_TOLERANCE_VOLATILITY_MULTIPLIER / 100
    return base * max(0.01, volatility_factor)


def _volume_confirmed(snapshot: TechnicalSnapshot) -> bool:
    if not snapshot.average_volume or snapshot.average_volume <= 0:
        return False
    return snapshot.volume / snapshot.average_volume >= VOLUME_EXPANSION_RATIO


def _make_pattern(
    *,
    name: str,
    confidence: int,
    status: PatternStatus,
    breakout_level: float | None,
    target_estimate: float | None,
    invalidation_level: float | None,
    swing_points: list[SwingPoint],
    matched_reasons: list[str],
    target_calculation: str,
    direction: str,
) -> PatternDetection:
    return PatternDetection(
        name=name,
        confidence=max(0, min(100, confidence)),
        status=status,
        breakout_level=breakout_level,
        target_estimate=target_estimate,
        invalidation_level=invalidation_level,
        swing_points=swing_points,
        matched_reasons=matched_reasons,
        target_calculation=target_calculation,
        direction=direction,
    )


def _detect_double_top(snapshot: TechnicalSnapshot, swings: list[SwingPoint], tolerance: float) -> PatternDetection | None:
    highs = [point for point in swings if point.kind == "high"][-3:]
    if len(highs) < 2:
        return None
    first, second = highs[-2], highs[-1]
    if abs(first.price - second.price) > tolerance:
        return None
    neckline = min(point.price for point in swings if point.kind == "low" and first.index < point.index < second.index) if any(
        point.kind == "low" and first.index < point.index < second.index for point in swings
    ) else snapshot.support
    if neckline is None:
        return None
    height = first.price - neckline
    if height <= 0:
        return None
    target = neckline - height
    status = PatternStatus.CONFIRMED if snapshot.latest_price is not None and snapshot.latest_price < neckline else PatternStatus.FORMING
    confidence = 58 + (10 if abs(first.price - second.price) <= tolerance / 2 else 0)
    return _make_pattern(
        name="Double Top",
        confidence=confidence,
        status=status,
        breakout_level=neckline,
        target_estimate=round(target, 4),
        invalidation_level=round(max(first.price, second.price) * 1.01, 4),
        swing_points=[first, second],
        matched_reasons=["Two swing highs formed at similar levels.", "Neckline support defines breakdown trigger."],
        target_calculation="Measured move: neckline minus pattern height.",
        direction="bearish",
    )


def _detect_double_bottom(snapshot: TechnicalSnapshot, swings: list[SwingPoint], tolerance: float) -> PatternDetection | None:
    lows = [point for point in swings if point.kind == "low"][-3:]
    if len(lows) < 2:
        return None
    first, second = lows[-2], lows[-1]
    if abs(first.price - second.price) > tolerance:
        return None
    neckline = max(point.price for point in swings if point.kind == "high" and first.index < point.index < second.index) if any(
        point.kind == "high" and first.index < point.index < second.index for point in swings
    ) else snapshot.resistance
    if neckline is None:
        return None
    height = neckline - first.price
    if height <= 0:
        return None
    target = neckline + height
    status = PatternStatus.CONFIRMED if snapshot.latest_price is not None and snapshot.latest_price > neckline else PatternStatus.FORMING
    confidence = 60 + (10 if abs(first.price - second.price) <= tolerance / 2 else 0)
    return _make_pattern(
        name="Double Bottom",
        confidence=confidence,
        status=status,
        breakout_level=neckline,
        target_estimate=round(target, 4),
        invalidation_level=round(min(first.price, second.price) * 0.99, 4),
        swing_points=[first, second],
        matched_reasons=["Two swing lows formed at similar levels.", "Neckline resistance defines breakout trigger."],
        target_calculation="Measured move: neckline plus pattern height.",
        direction="bullish",
    )


def _detect_flag(snapshot: TechnicalSnapshot, prices: list[DailyPrice], bullish: bool) -> PatternDetection | None:
    sorted_prices = _sorted_prices(prices)
    if len(sorted_prices) < 25:
        return None
    closes = [_to_float(price.close_price) for price in sorted_prices]
    closes = [value for value in closes if value is not None]
    if len(closes) < 25:
        return None
    pole_start = closes[-20]
    pole_end = closes[-12]
    flag_closes = closes[-12:]
    if bullish and pole_end <= pole_start * 1.04:
        return None
    if not bullish and pole_end >= pole_start * 0.96:
        return None
    flag_range = max(flag_closes) - min(flag_closes)
    if flag_range / (snapshot.latest_price or 1) > 0.06:
        return None
    breakout = max(flag_closes) if bullish else min(flag_closes)
    pole_height = abs(pole_end - pole_start)
    target = breakout + pole_height if bullish else breakout - pole_height
    status = PatternStatus.ACTIVE if _volume_confirmed(snapshot) else PatternStatus.FORMING
    return _make_pattern(
        name="Bull Flag" if bullish else "Bear Flag",
        confidence=62 if bullish else 60,
        status=status,
        breakout_level=round(breakout, 4),
        target_estimate=round(target, 4),
        invalidation_level=round(min(flag_closes) * 0.98 if bullish else max(flag_closes) * 1.02, 4),
        swing_points=[],
        matched_reasons=["Prior impulse move followed by tight consolidation.", "Flag slope aligns with continuation bias."],
        target_calculation="Measured move: breakout plus prior pole height.",
        direction="bullish" if bullish else "bearish",
    )


def _detect_triangle(snapshot: TechnicalSnapshot, swings: list[SwingPoint], kind: str) -> PatternDetection | None:
    if snapshot.latest_price is None or snapshot.latest_price <= 0:
        return None
    highs = [point for point in swings if point.kind == "high"][-4:]
    lows = [point for point in swings if point.kind == "low"][-4:]
    if len(highs) < 2 or len(lows) < 2:
        return None
    high_slope = highs[-1].price - highs[0].price
    low_slope = lows[-1].price - lows[0].price
    if kind == "ascending" and not (abs(high_slope) <= snapshot.latest_price * 0.02 and low_slope > 0):
        return None
    if kind == "descending" and not (high_slope < 0 and abs(low_slope) <= snapshot.latest_price * 0.02):
        return None
    if kind == "symmetrical" and not (high_slope < 0 and low_slope > 0):
        return None
    breakout = snapshot.resistance if kind == "ascending" else snapshot.support
    if breakout is None:
        breakout = highs[-1].price if kind != "descending" else lows[-1].price
    height = highs[-1].price - lows[-1].price
    if height <= 0:
        return None
    direction = "bullish" if kind == "ascending" else "bearish" if kind == "descending" else "neutral"
    target = breakout + height if direction == "bullish" else breakout - height
    return _make_pattern(
        name={"ascending": "Ascending Triangle", "descending": "Descending Triangle", "symmetrical": "Symmetrical Triangle"}[kind],
        confidence=57,
        status=PatternStatus.ACTIVE,
        breakout_level=round(breakout, 4),
        target_estimate=round(target, 4),
        invalidation_level=round(lows[-1].price * 0.98 if direction == "bullish" else highs[-1].price * 1.02, 4),
        swing_points=highs[-2:] + lows[-2:],
        matched_reasons=[f"{kind.title()} triangle structure detected from converging swings."],
        target_calculation="Measured move: breakout plus triangle height.",
        direction=direction,
    )


def _detect_head_shoulders(snapshot: TechnicalSnapshot, swings: list[SwingPoint], inverse: bool) -> PatternDetection | None:
    points = [point for point in swings if point.kind == ("high" if not inverse else "low")][-3:]
    if len(points) < 3:
        return None
    left, head, right = points[-3], points[-2], points[-1]
    tolerance = _tolerance(snapshot)
    if abs(left.price - right.price) > tolerance * 1.5:
        return None
    if inverse:
        if not (head.price < left.price and head.price < right.price):
            return None
        neckline = snapshot.resistance or max(head.price, right.price)
        if neckline <= head.price:
            return None
        target = neckline + (neckline - head.price)
        direction = "bullish"
    else:
        if not (head.price > left.price and head.price > right.price):
            return None
        neckline = snapshot.support or min(head.price, right.price)
        if neckline >= head.price:
            return None
        target = neckline - (head.price - neckline)
        direction = "bearish"
    return _make_pattern(
        name="Inverse Head and Shoulders" if inverse else "Head and Shoulders",
        confidence=64,
        status=PatternStatus.FORMING,
        breakout_level=round(neckline, 4),
        target_estimate=round(target, 4),
        invalidation_level=round(head.price, 4),
        swing_points=[left, head, right],
        matched_reasons=["Three swing points form shoulders and head structure."],
        target_calculation="Measured move: neckline plus head-to-neckline distance.",
        direction=direction,
    )


def _detect_cup_and_handle(snapshot: TechnicalSnapshot, prices: list[DailyPrice]) -> PatternDetection | None:
    sorted_prices = _sorted_prices(prices)
    if len(sorted_prices) < 40:
        return None
    closes = [_to_float(price.close_price) for price in sorted_prices[-40:]]
    closes = [value for value in closes if value is not None]
    if len(closes) < 40:
        return None
    left_rim = max(closes[:8])
    bottom = min(closes[8:28])
    right_rim = max(closes[20:32])
    handle = min(closes[32:])
    if bottom >= min(left_rim, right_rim) * 0.92:
        return None
    if handle < bottom:
        return None
    breakout = max(left_rim, right_rim)
    depth = breakout - bottom
    target = breakout + depth
    return _make_pattern(
        name="Cup and Handle",
        confidence=61,
        status=PatternStatus.FORMING,
        breakout_level=round(breakout, 4),
        target_estimate=round(target, 4),
        invalidation_level=round(handle * 0.98, 4),
        swing_points=[],
        matched_reasons=["Rounded base followed by shallow handle consolidation."],
        target_calculation="Measured move: breakout plus cup depth.",
        direction="bullish",
    )


def detect_patterns(snapshot: TechnicalSnapshot, prices: list[DailyPrice]) -> list[PatternDetection]:
    if len(prices) < PATTERN_MIN_CANDLES:
        return []
    swings = detect_swing_points(prices)
    tolerance = _tolerance(snapshot)
    candidates: list[PatternDetection] = []
    for detector in (
        lambda: _detect_double_top(snapshot, swings, tolerance),
        lambda: _detect_double_bottom(snapshot, swings, tolerance),
        lambda: _detect_triangle(snapshot, swings, "ascending"),
        lambda: _detect_triangle(snapshot, swings, "descending"),
        lambda: _detect_triangle(snapshot, swings, "symmetrical"),
        lambda: _detect_flag(snapshot, prices, True),
        lambda: _detect_flag(snapshot, prices, False),
        lambda: _detect_head_shoulders(snapshot, swings, False),
        lambda: _detect_head_shoulders(snapshot, swings, True),
        lambda: _detect_cup_and_handle(snapshot, prices),
    ):
        result = detector()
        if result is not None:
            candidates.append(result)
    candidates.sort(key=lambda pattern: pattern.confidence, reverse=True)
    return candidates
