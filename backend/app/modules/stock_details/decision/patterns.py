from __future__ import annotations

from dataclasses import dataclass
from app.core.constants.trading_constants import (
    PATTERN_BASE_CONFIDENCE,
    PATTERN_EVIDENCE_COMPLETION,
    PATTERN_EVIDENCE_LEVEL,
    PATTERN_EVIDENCE_PRIOR_TREND,
    PATTERN_EVIDENCE_TIGHT,
    PATTERN_EVIDENCE_VOLUME,
    PATTERN_MIN_CANDLES,
    PATTERN_MIN_SWING_SEPARATION,
    PATTERN_PRIOR_TREND_MIN_PERCENT,
    PATTERN_TOLERANCE_VOLATILITY_MULTIPLIER,
    VOLUME_EXPANSION_RATIO,
)
from app.core.enums import PatternStatus
from app.models import DailyPrice
from app.modules.stock_details.decision.technical import (
    SwingPoint,
    TechnicalSnapshot,
    _to_float,
    detect_swing_points,
)

__all__ = ["PatternDetection", "SwingPoint", "detect_patterns", "detect_swing_points"]

_PRIOR_TREND_WINDOW = 20


def _evidence_confidence(evidence: list[tuple[bool, int]], base: int = PATTERN_BASE_CONFIDENCE) -> int:
    score = float(base)
    for matched, weight in evidence:
        if matched:
            score += weight
    return max(0, min(100, int(round(score))))


def _prior_advance_percent(closes: list[float], up_to_index: int) -> float:
    """Percent rise from the lowest close in the lead-in window up to the pattern point."""
    if up_to_index <= 0 or up_to_index >= len(closes):
        return 0.0
    start = max(0, up_to_index - _PRIOR_TREND_WINDOW)
    window = closes[start : up_to_index + 1]
    base = min(window)
    if base <= 0:
        return 0.0
    return (closes[up_to_index] - base) / base * 100


def _prior_decline_percent(closes: list[float], up_to_index: int) -> float:
    """Percent fall from the highest close in the lead-in window down to the pattern point."""
    if up_to_index <= 0 or up_to_index >= len(closes):
        return 0.0
    start = max(0, up_to_index - _PRIOR_TREND_WINDOW)
    window = closes[start : up_to_index + 1]
    peak = max(window)
    if peak <= 0:
        return 0.0
    return (peak - closes[up_to_index]) / peak * 100


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


def _detect_double_top(
    snapshot: TechnicalSnapshot, swings: list[SwingPoint], tolerance: float, closes: list[float]
) -> PatternDetection | None:
    highs = [point for point in swings if point.kind == "high"][-3:]
    if len(highs) < 2:
        return None
    first, second = highs[-2], highs[-1]
    if abs(first.price - second.price) > tolerance:
        return None
    # Validity: the two tops must be separated in time and follow a real advance.
    if second.index - first.index < PATTERN_MIN_SWING_SEPARATION:
        return None
    prior_advance = _prior_advance_percent(closes, first.index)
    if prior_advance < PATTERN_PRIOR_TREND_MIN_PERCENT:
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
    confirmed = snapshot.latest_price is not None and snapshot.latest_price < neckline
    status = PatternStatus.CONFIRMED if confirmed else PatternStatus.FORMING
    confidence = _evidence_confidence(
        [
            (abs(first.price - second.price) <= tolerance / 2, PATTERN_EVIDENCE_TIGHT),
            (_volume_confirmed(snapshot), PATTERN_EVIDENCE_VOLUME),
            (prior_advance >= PATTERN_PRIOR_TREND_MIN_PERCENT, PATTERN_EVIDENCE_PRIOR_TREND),
            (confirmed, PATTERN_EVIDENCE_COMPLETION),
        ]
    )
    return _make_pattern(
        name="Double Top",
        confidence=confidence,
        status=status,
        breakout_level=neckline,
        target_estimate=round(target, 4),
        invalidation_level=round(max(first.price, second.price) * 1.01, 4),
        swing_points=[first, second],
        matched_reasons=[
            "Two swing highs formed at similar levels after a prior advance.",
            "Neckline support defines breakdown trigger.",
        ],
        target_calculation="Measured move: neckline minus pattern height.",
        direction="bearish",
    )


def _detect_double_bottom(
    snapshot: TechnicalSnapshot, swings: list[SwingPoint], tolerance: float, closes: list[float]
) -> PatternDetection | None:
    lows = [point for point in swings if point.kind == "low"][-3:]
    if len(lows) < 2:
        return None
    first, second = lows[-2], lows[-1]
    if abs(first.price - second.price) > tolerance:
        return None
    if second.index - first.index < PATTERN_MIN_SWING_SEPARATION:
        return None
    prior_decline = _prior_decline_percent(closes, first.index)
    if prior_decline < PATTERN_PRIOR_TREND_MIN_PERCENT:
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
    confirmed = snapshot.latest_price is not None and snapshot.latest_price > neckline
    status = PatternStatus.CONFIRMED if confirmed else PatternStatus.FORMING
    confidence = _evidence_confidence(
        [
            (abs(first.price - second.price) <= tolerance / 2, PATTERN_EVIDENCE_TIGHT),
            (_volume_confirmed(snapshot), PATTERN_EVIDENCE_VOLUME),
            (prior_decline >= PATTERN_PRIOR_TREND_MIN_PERCENT, PATTERN_EVIDENCE_PRIOR_TREND),
            (confirmed, PATTERN_EVIDENCE_COMPLETION),
        ]
    )
    return _make_pattern(
        name="Double Bottom",
        confidence=confidence,
        status=status,
        breakout_level=neckline,
        target_estimate=round(target, 4),
        invalidation_level=round(min(first.price, second.price) * 0.99, 4),
        swing_points=[first, second],
        matched_reasons=[
            "Two swing lows formed at similar levels after a prior decline.",
            "Neckline resistance defines breakout trigger.",
        ],
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
    volume_ok = _volume_confirmed(snapshot)
    status = PatternStatus.ACTIVE if volume_ok else PatternStatus.FORMING
    tight_flag = flag_range / (snapshot.latest_price or 1) <= 0.04
    confidence = _evidence_confidence(
        [
            (True, PATTERN_EVIDENCE_PRIOR_TREND),  # a qualifying pole is required to reach here
            (volume_ok, PATTERN_EVIDENCE_VOLUME),
            (tight_flag, PATTERN_EVIDENCE_TIGHT),
            (status == PatternStatus.ACTIVE, PATTERN_EVIDENCE_LEVEL),
        ]
    )
    return _make_pattern(
        name="Bull Flag" if bullish else "Bear Flag",
        confidence=confidence,
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
    near_apex = height / snapshot.latest_price <= 0.06
    confidence = _evidence_confidence(
        [
            (len(highs) >= 3 and len(lows) >= 3, PATTERN_EVIDENCE_TIGHT),
            (_volume_confirmed(snapshot), PATTERN_EVIDENCE_VOLUME),
            (near_apex, PATTERN_EVIDENCE_LEVEL),
        ]
    )
    return _make_pattern(
        name={"ascending": "Ascending Triangle", "descending": "Descending Triangle", "symmetrical": "Symmetrical Triangle"}[kind],
        confidence=confidence,
        status=PatternStatus.ACTIVE,
        breakout_level=round(breakout, 4),
        target_estimate=round(target, 4),
        invalidation_level=round(lows[-1].price * 0.98 if direction == "bullish" else highs[-1].price * 1.02, 4),
        swing_points=highs[-2:] + lows[-2:],
        matched_reasons=[f"{kind.title()} triangle structure detected from converging swings."],
        target_calculation="Measured move: breakout plus triangle height.",
        direction=direction,
    )


def _detect_head_shoulders(
    snapshot: TechnicalSnapshot, swings: list[SwingPoint], inverse: bool, closes: list[float]
) -> PatternDetection | None:
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
        # Inverse H&S is a bottoming reversal: it should follow a decline.
        prior_trend_percent = _prior_decline_percent(closes, left.index)
        if prior_trend_percent < PATTERN_PRIOR_TREND_MIN_PERCENT:
            return None
        neckline = snapshot.resistance or max(head.price, right.price)
        if neckline <= head.price:
            return None
        target = neckline + (neckline - head.price)
        direction = "bullish"
    else:
        if not (head.price > left.price and head.price > right.price):
            return None
        # H&S is a topping reversal: it should follow an advance.
        prior_trend_percent = _prior_advance_percent(closes, left.index)
        if prior_trend_percent < PATTERN_PRIOR_TREND_MIN_PERCENT:
            return None
        neckline = snapshot.support or min(head.price, right.price)
        if neckline >= head.price:
            return None
        target = neckline - (head.price - neckline)
        direction = "bearish"
    confidence = _evidence_confidence(
        [
            (abs(left.price - right.price) <= tolerance, PATTERN_EVIDENCE_TIGHT),
            (_volume_confirmed(snapshot), PATTERN_EVIDENCE_VOLUME),
            (prior_trend_percent >= PATTERN_PRIOR_TREND_MIN_PERCENT, PATTERN_EVIDENCE_PRIOR_TREND),
            (True, PATTERN_EVIDENCE_LEVEL),
        ]
    )
    return _make_pattern(
        name="Inverse Head and Shoulders" if inverse else "Head and Shoulders",
        confidence=confidence,
        status=PatternStatus.FORMING,
        breakout_level=round(neckline, 4),
        target_estimate=round(target, 4),
        invalidation_level=round(head.price, 4),
        swing_points=[left, head, right],
        matched_reasons=["Three swing points form shoulders and head structure after a prior trend."],
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
    shallow_handle = handle >= bottom + depth * 0.5
    confidence = _evidence_confidence(
        [
            (True, PATTERN_EVIDENCE_PRIOR_TREND),  # a rounded base is required to reach here
            (_volume_confirmed(snapshot), PATTERN_EVIDENCE_VOLUME),
            (shallow_handle, PATTERN_EVIDENCE_TIGHT),
        ]
    )
    return _make_pattern(
        name="Cup and Handle",
        confidence=confidence,
        status=PatternStatus.FORMING,
        breakout_level=round(breakout, 4),
        target_estimate=round(target, 4),
        invalidation_level=round(handle * 0.98, 4),
        swing_points=[],
        matched_reasons=["Rounded base followed by shallow handle consolidation."],
        target_calculation="Measured move: breakout plus cup depth.",
        direction="bullish",
    )


_TRIANGLE_PATTERN_NAMES = frozenset(
    {"Ascending Triangle", "Descending Triangle", "Symmetrical Triangle"},
)


def _triangle_specificity_rank(name: str) -> int:
    if name == "Symmetrical Triangle":
        return 0
    return 1


def _reconcile_patterns(candidates: list[PatternDetection]) -> list[PatternDetection]:
    triangles = [pattern for pattern in candidates if pattern.name in _TRIANGLE_PATTERN_NAMES]
    others = [pattern for pattern in candidates if pattern.name not in _TRIANGLE_PATTERN_NAMES]

    if len(triangles) > 1:
        triangles.sort(
            key=lambda pattern: (pattern.confidence, _triangle_specificity_rank(pattern.name)),
            reverse=True,
        )
        triangles = [triangles[0]]

    reconciled = others + triangles
    reconciled.sort(key=lambda pattern: pattern.confidence, reverse=True)
    return reconciled


def detect_patterns(snapshot: TechnicalSnapshot, prices: list[DailyPrice]) -> list[PatternDetection]:
    if len(prices) < PATTERN_MIN_CANDLES:
        return []
    sorted_prices = _sorted_prices(prices)
    closes = [value for value in (_to_float(price.close_price) for price in sorted_prices) if value is not None]
    swings = detect_swing_points(sorted_prices)
    tolerance = _tolerance(snapshot)
    candidates: list[PatternDetection] = []
    for detector in (
        lambda: _detect_double_top(snapshot, swings, tolerance, closes),
        lambda: _detect_double_bottom(snapshot, swings, tolerance, closes),
        lambda: _detect_triangle(snapshot, swings, "ascending"),
        lambda: _detect_triangle(snapshot, swings, "descending"),
        lambda: _detect_triangle(snapshot, swings, "symmetrical"),
        lambda: _detect_flag(snapshot, prices, True),
        lambda: _detect_flag(snapshot, prices, False),
        lambda: _detect_head_shoulders(snapshot, swings, False, closes),
        lambda: _detect_head_shoulders(snapshot, swings, True, closes),
        lambda: _detect_cup_and_handle(snapshot, prices),
    ):
        result = detector()
        if result is not None:
            candidates.append(result)
    candidates.sort(key=lambda pattern: pattern.confidence, reverse=True)
    return _reconcile_patterns(candidates)
