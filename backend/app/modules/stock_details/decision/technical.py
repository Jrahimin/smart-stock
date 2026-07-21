from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from statistics import median

from app.core.constants.trading_constants import (
    ANALYTICAL_ADJUSTED_SERIES_ENABLED,
    ATR_PERIOD,
    DEFAULT_LONG_MOVING_AVERAGE_PERIOD,
    DEFAULT_RSI_PERIOD,
    DEFAULT_SHORT_MOVING_AVERAGE_PERIOD,
    ELIGIBILITY_ROBUST_BASELINE_WINDOW,
    GAP_RISK_THRESHOLD_PERCENT,
    RETURN_MEDIUM_LOOKBACK,
    RETURN_SHORT_LOOKBACK,
    SPARKLINE_CLOSE_LIMIT,
    STRUCTURE_HIGHER,
    STRUCTURE_LOWER,
    STRUCTURE_NEUTRAL,
    SUPPORT_RESISTANCE_LOOKBACK,
    SUPPORT_RESISTANCE_SWING_CONFIRM_BARS,
    TREND_SLOPE_LOOKBACK,
    VOLUME_EXPANSION_RATIO,
    VOLUME_THIN_RATIO,
)
from app.core.enums import DataQualityFlag, TrendDirection, TurnoverProvenance, VolumeBehavior
from app.models import DailyPrice

# Swing-point detection lives here so support/resistance and the pattern engine
# share a single implementation (patterns.py re-imports these names).
SWING_POINT_LOOKBACK = 3


def _to_float(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


def average(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def calculate_sma(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    return average(values[-period:])


def calculate_ema(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    multiplier = 2 / (period + 1)
    seed = average(values[:period])
    if seed is None:
        return None
    ema = seed
    for value in values[period:]:
        ema = (value - ema) * multiplier + ema
    return ema


def calculate_rsi(values: list[float], period: int = DEFAULT_RSI_PERIOD) -> float | None:
    """Wilder-smoothed RSI.

    Returns 50.0 (neutral) for a perfectly flat series so dormant / floor-price
    names are not misread as maximally overbought.
    """
    if len(values) <= period:
        return None
    changes = [values[index + 1] - values[index] for index in range(len(values) - 1)]
    gains = [max(change, 0.0) for change in changes]
    losses = [abs(min(change, 0.0)) for change in changes]

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for index in range(period, len(changes)):
        avg_gain = (avg_gain * (period - 1) + gains[index]) / period
        avg_loss = (avg_loss * (period - 1) + losses[index]) / period

    if avg_gain == 0 and avg_loss == 0:
        return 50.0
    if avg_loss == 0:
        return 100.0
    relative_strength = avg_gain / avg_loss
    return 100 - 100 / (1 + relative_strength)


def calculate_atr(
    highs: list[float],
    lows: list[float],
    closes: list[float],
    period: int = ATR_PERIOD,
) -> float | None:
    """Wilder ATR seeded by the first ``period`` true ranges."""
    count = min(len(highs), len(lows), len(closes))
    if count < 2:
        return None
    true_ranges: list[float] = []
    for index in range(1, count):
        prev_close = closes[index - 1]
        true_range = max(
            highs[index] - lows[index],
            abs(highs[index] - prev_close),
            abs(lows[index] - prev_close),
        )
        true_ranges.append(true_range)
    if len(true_ranges) < period:
        return None
    atr = average(true_ranges[:period])
    if atr is None:
        return None
    for true_range in true_ranges[period:]:
        atr = (atr * (period - 1) + true_range) / period
    return atr


def is_valid_ohlc_row(price: DailyPrice) -> bool:
    """Validate one complete OHLC row so indicator arrays cannot desynchronize."""
    open_price = _to_float(price.open_price)
    high = _to_float(price.high_price)
    low = _to_float(price.low_price)
    close = _to_float(price.close_price)
    if None in {open_price, high, low, close}:
        return False
    assert open_price is not None and high is not None and low is not None and close is not None
    # A zero in any OHLC field is a source placeholder for a no-trade /
    # unavailable observation, not a tradable price.  Keeping it in storage is
    # useful for source auditing, but it must not enter an analytical series.
    if min(open_price, high, low, close) <= 0:
        return False
    return high >= max(open_price, low, close) and low <= min(open_price, high, close)


def select_valid_ohlc_rows(prices: list[DailyPrice]) -> list[DailyPrice]:
    return [
        price
        for price in sorted(prices, key=lambda row: row.trade_date)
        if is_valid_ohlc_row(price)
    ]


def _adjusted_close_coverage(prices: list[DailyPrice]) -> float:
    if not prices:
        return 0.0
    adjusted = sum(1 for price in prices if (_to_float(price.adjusted_close_price) or 0) > 0)
    return adjusted / len(prices)


def _analytical_ohlc(
    price: DailyPrice,
    *,
    use_adjusted_close: bool,
) -> tuple[float, float, float, float]:
    open_price = float(price.open_price)
    high = float(price.high_price)
    low = float(price.low_price)
    close = float(price.close_price)
    if not use_adjusted_close:
        return open_price, high, low, close
    adjusted_close = _to_float(price.adjusted_close_price)
    if adjusted_close is None or close <= 0:
        return open_price, high, low, close
    factor = adjusted_close / close
    return open_price * factor, high * factor, low * factor, adjusted_close


def _turnover_provenance(prices: list[DailyPrice]) -> TurnoverProvenance:
    observed: set[TurnoverProvenance] = set()
    for price in prices:
        raw = getattr(price, "turnover_provenance", None)
        try:
            provenance = TurnoverProvenance(raw) if raw is not None else TurnoverProvenance.UNKNOWN
        except ValueError:
            provenance = TurnoverProvenance.UNKNOWN
        observed.add(provenance)
    observed.discard(TurnoverProvenance.UNKNOWN)
    if not observed:
        return TurnoverProvenance.UNKNOWN
    if len(observed) == 1:
        return next(iter(observed))
    return TurnoverProvenance.MIXED


def standard_deviation(values: list[float]) -> float | None:
    avg = average(values)
    if avg is None or len(values) < 2:
        return None
    variance = sum((value - avg) ** 2 for value in values) / len(values)
    return variance**0.5


def return_percent_over_lookback(closes: list[float], lookback: int) -> float | None:
    """Percent return from `lookback` trading sessions before the latest close."""
    if len(closes) <= lookback:
        return None
    past = closes[-1 - lookback]
    if past == 0:
        return None
    return (closes[-1] / past - 1) * 100


def classify_volume_behavior(
    volume: int,
    baseline_volume: float | None,
) -> VolumeBehavior:
    if baseline_volume is None or baseline_volume <= 0:
        return VolumeBehavior.UNKNOWN
    ratio = volume / baseline_volume
    if ratio >= VOLUME_EXPANSION_RATIO:
        return VolumeBehavior.EXPANSION
    if ratio <= VOLUME_THIN_RATIO:
        return VolumeBehavior.THIN
    return VolumeBehavior.NORMAL


def _return_percent(closes: list[float], lookback: int) -> float | None:
    return return_percent_over_lookback(closes, lookback)


def infer_trend(
    latest_price: float | None,
    sma20: float | None,
    sma50: float | None,
    sma20_slope: float | None,
) -> TrendDirection:
    """Structural trend that does not flip on a single session's sign.

    - With >= 50 rows: UPTREND requires price > SMA20 > SMA50 (mirrored for DOWNTREND).
    - With shorter history: fall back to price vs SMA20 plus a rising/falling SMA20 slope.
    """
    if latest_price is None or sma20 is None:
        return TrendDirection.UNKNOWN

    above = latest_price > sma20
    below = latest_price < sma20

    if sma50 is not None:
        if above and sma20 > sma50:
            return TrendDirection.UPTREND
        if below and sma20 < sma50:
            return TrendDirection.DOWNTREND
        return TrendDirection.SIDEWAYS

    if sma20_slope is not None:
        if above and sma20_slope > 0:
            return TrendDirection.UPTREND
        if below and sma20_slope < 0:
            return TrendDirection.DOWNTREND
    return TrendDirection.SIDEWAYS


@dataclass(frozen=True)
class SwingPoint:
    index: int
    date: str
    price: float
    kind: str


def detect_swing_points(
    prices: list[DailyPrice], lookback: int = SWING_POINT_LOOKBACK
) -> list[SwingPoint]:
    sorted_prices = sorted(prices, key=lambda price: price.trade_date)
    highs = [_to_float(price.high_price) for price in sorted_prices]
    lows = [_to_float(price.low_price) for price in sorted_prices]
    swings: list[SwingPoint] = []
    for index in range(lookback, len(sorted_prices) - lookback):
        high = highs[index]
        low = lows[index]
        if high is None or low is None:
            continue
        left_highs = [value for value in highs[index - lookback : index] if value is not None]
        right_highs = [
            value for value in highs[index + 1 : index + lookback + 1] if value is not None
        ]
        left_lows = [value for value in lows[index - lookback : index] if value is not None]
        right_lows = [
            value for value in lows[index + 1 : index + lookback + 1] if value is not None
        ]
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


@dataclass(frozen=True)
class LevelResult:
    support: float | None
    resistance: float | None
    prior_swing_high: float | None


def _donchian(prices: list[DailyPrice], lookback: int) -> tuple[float | None, float | None]:
    window = prices[-lookback:] if len(prices) >= lookback else prices
    lows = [
        value for value in (_to_float(price.low_price) for price in window) if value is not None
    ]
    highs = [
        value for value in (_to_float(price.high_price) for price in window) if value is not None
    ]
    if not lows or not highs:
        return None, None
    return min(lows), max(highs)


def resolve_levels(
    prices: list[DailyPrice],
    latest_price: float | None,
    lookback: int = SUPPORT_RESISTANCE_LOOKBACK,
) -> LevelResult:
    """Swing-based support/resistance with Donchian fallback.

    Resistance prefers the nearest confirmed swing high overhead; support prefers
    the nearest confirmed swing low below price. Confirmed = at least
    ``SUPPORT_RESISTANCE_SWING_CONFIRM_BARS`` sessions old so a fresh breakout bar
    is never mistaken for resistance. ``prior_swing_high`` exposes the highest
    confirmed swing high for breakout detection.
    """
    sorted_prices = sorted(prices, key=lambda price: price.trade_date)
    donchian_support, donchian_resistance = _donchian(sorted_prices, lookback)

    swings = detect_swing_points(sorted_prices)
    confirm_before_index = len(sorted_prices) - 1 - SUPPORT_RESISTANCE_SWING_CONFIRM_BARS
    confirmed_highs = [
        point.price
        for point in swings
        if point.kind == "high" and point.index <= confirm_before_index
    ]
    confirmed_lows = [
        point.price
        for point in swings
        if point.kind == "low" and point.index <= confirm_before_index
    ]

    prior_swing_high = max(confirmed_highs) if confirmed_highs else None

    resistance = donchian_resistance
    if confirmed_highs:
        overhead = [
            price for price in confirmed_highs if latest_price is None or price >= latest_price
        ]
        resistance = min(overhead) if overhead else max(confirmed_highs)

    support = donchian_support
    if confirmed_lows:
        below = [price for price in confirmed_lows if latest_price is None or price <= latest_price]
        support = max(below) if below else min(confirmed_lows)

    return LevelResult(support=support, resistance=resistance, prior_swing_high=prior_swing_high)


def compute_support_resistance(
    prices: list[DailyPrice], lookback: int = SUPPORT_RESISTANCE_LOOKBACK
) -> tuple[float | None, float | None]:
    """Backwards-compatible 2-tuple accessor for support/resistance levels."""
    latest_price = _to_float(prices[-1].close_price) if prices else None
    levels = resolve_levels(prices, latest_price, lookback)
    return levels.support, levels.resistance


def classify_structure(swings: list[SwingPoint]) -> str:
    """Higher-high/higher-low vs lower-high/lower-low from the last two swings.

    Shared signal that lets the recommendation stay coherent with visible market
    structure on every surface (both list and detail compute it identically).
    """
    highs = [point.price for point in swings if point.kind == "high"]
    lows = [point.price for point in swings if point.kind == "low"]
    if len(highs) < 2 or len(lows) < 2:
        return STRUCTURE_NEUTRAL
    higher = highs[-1] > highs[-2] and lows[-1] > lows[-2]
    lower = highs[-1] < highs[-2] and lows[-1] < lows[-2]
    if higher:
        return STRUCTURE_HIGHER
    if lower:
        return STRUCTURE_LOWER
    return STRUCTURE_NEUTRAL


@dataclass(frozen=True)
class TechnicalSnapshot:
    latest_price: float | None
    previous_close: float | None
    price_change: float | None
    price_change_percent: float | None
    volume: int
    average_volume: float | None
    turnover: float | None
    rsi: float | None
    sma20: float | None
    ema20: float | None
    volatility: float | None
    support: float | None
    resistance: float | None
    trend: TrendDirection
    data_quality: DataQualityFlag
    latest_trade_date: str | None
    ohlcv_row_count: int
    sparkline_closes: tuple[float, ...] = ()
    sma50: float | None = None
    atr14: float | None = None
    average_turnover: float | None = None
    return_5d_percent: float | None = None
    return_20d_percent: float | None = None
    is_breakout: bool = False
    structure: str = STRUCTURE_NEUTRAL
    gap_frequency_percent: float | None = None
    invalid_ohlcv_row_count: int = 0
    latest_row_valid: bool = True
    traded_session_count: int = 0
    zero_volume_session_count: int = 0
    traded_session_ratio: float = 0.0
    volume_observation_count: int = 0
    median_turnover: float | None = None
    turnover_observation_count: int = 0
    turnover_provenance: TurnoverProvenance = TurnoverProvenance.UNKNOWN
    analytical_price_basis: str = "RAW_UNADJUSTED"
    adjusted_close_coverage_ratio: float = 0.0
    volume_behavior: VolumeBehavior = VolumeBehavior.UNKNOWN


def build_technical_snapshot(prices: list[DailyPrice]) -> TechnicalSnapshot | None:
    if not prices:
        return None

    sorted_prices = sorted(prices, key=lambda price: price.trade_date)
    valid_prices = select_valid_ohlc_rows(sorted_prices)
    if not valid_prices:
        return None

    latest = valid_prices[-1]
    adjusted_coverage = _adjusted_close_coverage(valid_prices)
    use_adjusted_close = ANALYTICAL_ADJUSTED_SERIES_ENABLED and adjusted_coverage == 1.0
    analytical_rows = [
        _analytical_ohlc(price, use_adjusted_close=use_adjusted_close) for price in valid_prices
    ]
    highs = [row[1] for row in analytical_rows]
    lows = [row[2] for row in analytical_rows]
    closes = [row[3] for row in analytical_rows]

    latest_price = _to_float(latest.close_price)
    previous_close = _to_float(latest.previous_close_price) or (
        closes[-2] if len(closes) >= 2 else None
    )
    price_change = _to_float(latest.price_change)
    if price_change is None and latest_price is not None and previous_close is not None:
        price_change = latest_price - previous_close
    price_change_percent = _to_float(latest.price_change_percent)
    if (
        price_change_percent is None
        and price_change is not None
        and previous_close is not None
        and previous_close != 0
    ):
        price_change_percent = (price_change / previous_close) * 100

    # Average volume/turnover exclude the latest session so the current bar is
    # measured against its own baseline rather than being diluted into it.
    baseline_prices = valid_prices[-(ELIGIBILITY_ROBUST_BASELINE_WINDOW + 1) : -1]
    if not baseline_prices:
        baseline_prices = valid_prices[:-1] or valid_prices
    traded_baseline_prices = [price for price in baseline_prices if price.volume > 0]
    volume_window = [float(price.volume) for price in traded_baseline_prices]
    average_volume = median(volume_window) if volume_window else None
    turnover_window = [
        value
        for value in (_to_float(price.turnover) for price in traded_baseline_prices)
        if value is not None and value > 0
    ]
    average_turnover = average(turnover_window)
    median_turnover = median(turnover_window) if turnover_window else None

    volatility_closes = closes[-(SUPPORT_RESISTANCE_LOOKBACK + 1) :]
    daily_changes = [
        (current / previous - 1) * 100
        for previous, current in zip(
            volatility_closes,
            volatility_closes[1:],
            strict=False,
        )
        if previous > 0
    ]
    volatility = standard_deviation(daily_changes)

    # Gap frequency: share of sessions opening more than the threshold away from
    # the prior close — a proxy for jumpy, gap-prone (harder to stop) names.
    gap_window = valid_prices[-SUPPORT_RESISTANCE_LOOKBACK:]
    gap_count = 0
    gap_total = 0
    for previous_price, current_price in zip(
        gap_window,
        gap_window[1:],
        strict=False,
    ):
        open_value = _to_float(current_price.open_price)
        prev_close = _to_float(previous_price.close_price)
        if open_value is None or prev_close is None or prev_close <= 0:
            continue
        gap_total += 1
        if abs(open_value - prev_close) / prev_close * 100 > GAP_RISK_THRESHOLD_PERCENT:
            gap_count += 1
    gap_frequency_percent = (gap_count / gap_total * 100) if gap_total else None

    sma20 = calculate_sma(closes, DEFAULT_SHORT_MOVING_AVERAGE_PERIOD)
    ema20 = calculate_ema(closes, DEFAULT_SHORT_MOVING_AVERAGE_PERIOD)
    sma50 = calculate_sma(closes, DEFAULT_LONG_MOVING_AVERAGE_PERIOD)
    rsi = calculate_rsi(closes)
    atr14 = calculate_atr(highs, lows, closes)

    sma20_slope: float | None = None
    if len(closes) > DEFAULT_SHORT_MOVING_AVERAGE_PERIOD + TREND_SLOPE_LOOKBACK:
        sma20_prev = calculate_sma(
            closes[:-TREND_SLOPE_LOOKBACK], DEFAULT_SHORT_MOVING_AVERAGE_PERIOD
        )
        if sma20 is not None and sma20_prev is not None:
            sma20_slope = sma20 - sma20_prev

    return_5d = _return_percent(closes, RETURN_SHORT_LOOKBACK)
    return_20d = _return_percent(closes, RETURN_MEDIUM_LOOKBACK)

    levels = resolve_levels(valid_prices, latest_price)
    support, resistance = levels.support, levels.resistance
    structure = classify_structure(detect_swing_points(valid_prices))

    is_breakout = False
    if (
        levels.prior_swing_high is not None
        and latest_price is not None
        and latest_price > levels.prior_swing_high
        and average_volume
        and average_volume > 0
        and latest.volume / average_volume >= VOLUME_EXPANSION_RATIO
    ):
        is_breakout = True

    trend = infer_trend(latest_price, sma20, sma50, sma20_slope)

    return TechnicalSnapshot(
        latest_price=latest_price,
        previous_close=previous_close,
        price_change=price_change,
        price_change_percent=price_change_percent,
        volume=latest.volume,
        average_volume=average_volume,
        turnover=_to_float(latest.turnover),
        rsi=rsi,
        sma20=sma20,
        ema20=ema20,
        volatility=volatility,
        support=support,
        resistance=resistance,
        trend=trend,
        data_quality=latest.data_quality_flag,
        latest_trade_date=latest.trade_date.isoformat(),
        ohlcv_row_count=len(valid_prices),
        sparkline_closes=tuple(closes[-SPARKLINE_CLOSE_LIMIT:]),
        sma50=sma50,
        atr14=atr14,
        average_turnover=average_turnover,
        return_5d_percent=return_5d,
        return_20d_percent=return_20d,
        is_breakout=is_breakout,
        structure=structure,
        gap_frequency_percent=gap_frequency_percent,
        invalid_ohlcv_row_count=len(sorted_prices) - len(valid_prices),
        latest_row_valid=is_valid_ohlc_row(sorted_prices[-1]),
        traded_session_count=sum(1 for price in valid_prices if price.volume > 0),
        zero_volume_session_count=sum(1 for price in valid_prices if price.volume == 0),
        traded_session_ratio=(
            sum(1 for price in valid_prices if price.volume > 0) / len(valid_prices)
        ),
        volume_observation_count=len(volume_window),
        median_turnover=median_turnover,
        turnover_observation_count=len(turnover_window),
        turnover_provenance=_turnover_provenance(traded_baseline_prices),
        analytical_price_basis=(
            "SOURCE_ADJUSTED_CLOSE" if use_adjusted_close else "RAW_UNADJUSTED"
        ),
        adjusted_close_coverage_ratio=adjusted_coverage,
        volume_behavior=classify_volume_behavior(latest.volume, average_volume),
    )
