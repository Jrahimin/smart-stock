from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.core.constants.trading_constants import (
    DEFAULT_RSI_PERIOD,
    DEFAULT_SHORT_MOVING_AVERAGE_PERIOD,
    SPARKLINE_CLOSE_LIMIT,
    SUPPORT_RESISTANCE_LOOKBACK,
)
from app.core.enums import DataQualityFlag, TrendDirection
from app.models import DailyPrice


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
    if len(values) <= period:
        return None
    changes = [values[index + 1] - values[index] for index in range(len(values) - 1)]
    recent = changes[-period:]
    gains = [max(change, 0) for change in recent]
    losses = [abs(min(change, 0)) for change in recent]
    avg_gain = average(gains) or 0.0
    avg_loss = average(losses) or 0.0
    if avg_loss == 0:
        return 100.0
    relative_strength = avg_gain / avg_loss
    return 100 - 100 / (1 + relative_strength)


def standard_deviation(values: list[float]) -> float | None:
    avg = average(values)
    if avg is None or len(values) < 2:
        return None
    variance = sum((value - avg) ** 2 for value in values) / len(values)
    return variance**0.5


def infer_trend(
    latest_price: float | None,
    sma20: float | None,
    ema20: float | None,
    change_percent: float | None,
) -> TrendDirection:
    if latest_price is None or sma20 is None or ema20 is None or change_percent is None:
        return TrendDirection.UNKNOWN
    if latest_price > sma20 and latest_price > ema20 and change_percent > 0:
        return TrendDirection.UPTREND
    if latest_price < sma20 and latest_price < ema20 and change_percent < 0:
        return TrendDirection.DOWNTREND
    return TrendDirection.SIDEWAYS


def compute_support_resistance(prices: list[DailyPrice], lookback: int = SUPPORT_RESISTANCE_LOOKBACK) -> tuple[float | None, float | None]:
    window = prices[-lookback:] if len(prices) >= lookback else prices
    lows = [_to_float(price.low_price) for price in window]
    highs = [_to_float(price.high_price) for price in window]
    lows = [value for value in lows if value is not None]
    highs = [value for value in highs if value is not None]
    if not lows or not highs:
        return None, None
    return min(lows), max(highs)


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


def build_technical_snapshot(prices: list[DailyPrice]) -> TechnicalSnapshot | None:
    if not prices:
        return None

    sorted_prices = sorted(prices, key=lambda price: price.trade_date)
    latest = sorted_prices[-1]
    closes = [_to_float(price.close_price) for price in sorted_prices]
    closes = [value for value in closes if value is not None]
    if not closes:
        return None

    latest_price = _to_float(latest.close_price)
    previous_close = _to_float(latest.previous_close_price) or (closes[-2] if len(closes) >= 2 else None)
    price_change = _to_float(latest.price_change)
    if price_change is None and latest_price is not None and previous_close is not None:
        price_change = latest_price - previous_close
    price_change_percent = _to_float(latest.price_change_percent)
    if price_change_percent is None and price_change is not None and previous_close not in (None, 0):
        price_change_percent = (price_change / previous_close) * 100

    volume_window = [price.volume for price in sorted_prices[-SUPPORT_RESISTANCE_LOOKBACK:]]
    average_volume = average([float(volume) for volume in volume_window])
    daily_changes = [
        _to_float(price.price_change_percent)
        for price in sorted_prices[-SUPPORT_RESISTANCE_LOOKBACK:]
    ]
    daily_changes = [value for value in daily_changes if value is not None]
    volatility = standard_deviation(daily_changes)
    sma20 = calculate_sma(closes, DEFAULT_SHORT_MOVING_AVERAGE_PERIOD)
    ema20 = calculate_ema(closes, DEFAULT_SHORT_MOVING_AVERAGE_PERIOD)
    rsi = calculate_rsi(closes)
    support, resistance = compute_support_resistance(sorted_prices)
    trend = infer_trend(latest_price, sma20, ema20, price_change_percent)

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
        ohlcv_row_count=len(sorted_prices),
        sparkline_closes=tuple(closes[-SPARKLINE_CLOSE_LIMIT:]),
    )
