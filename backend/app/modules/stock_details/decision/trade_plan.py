from __future__ import annotations

from dataclasses import dataclass

from app.core.constants.trading_constants import (
    DEFAULT_RISK_REWARD_TARGET,
    MIN_RISK_REWARD_RATIO,
    NEAR_LEVEL_PERCENT_THRESHOLD,
    RECOMMENDATION_WAIT_NEAR_RESISTANCE_PERCENT,
    STOP_LOSS_VOLATILITY_BUFFER_MULTIPLIER,
    VOLUME_CONSISTENCY_MIN_RATIO,
    VOLUME_EXPANSION_RATIO,
    VOLUME_THIN_RATIO,
)
from app.core.enums import LiquidityLabel, TrendDirection
from app.modules.stock_details.decision.technical import TechnicalSnapshot


def _percent_distance(from_price: float, to_price: float) -> float:
    if from_price == 0:
        return 0.0
    return ((to_price - from_price) / from_price) * 100


def _is_positive(value: float | None) -> bool:
    return value is not None and value > 0


@dataclass(frozen=True)
class PricePositionResult:
    current_price: float | None
    distance_to_support_percent: float | None
    distance_to_resistance_percent: float | None
    above_sma20_percent: float | None
    above_ema20_percent: float | None


@dataclass(frozen=True)
class TradePlanResult:
    entry_zone_low: float | None
    entry_zone_high: float | None
    stop_loss: float | None
    target_low: float | None
    target_high: float | None
    risk_reward_ratio: float | None
    explanation: str


@dataclass(frozen=True)
class LiquidityAnalysisResult:
    label: LiquidityLabel
    average_volume: float | None
    latest_volume_ratio: float | None
    volume_consistency_score: int
    average_turnover: float | None
    explanation: str


def compute_price_position(snapshot: TechnicalSnapshot) -> PricePositionResult:
    price = snapshot.latest_price
    support_distance = None
    resistance_distance = None
    above_sma20 = None
    above_ema20 = None
    if price is not None and _is_positive(snapshot.support):
        support_distance = _percent_distance(snapshot.support, price)
    if price is not None and _is_positive(snapshot.resistance):
        resistance_distance = _percent_distance(price, snapshot.resistance)
    if price is not None and _is_positive(snapshot.sma20):
        above_sma20 = _percent_distance(snapshot.sma20, price)
    if price is not None and _is_positive(snapshot.ema20):
        above_ema20 = _percent_distance(snapshot.ema20, price)
    return PricePositionResult(
        current_price=price,
        distance_to_support_percent=support_distance,
        distance_to_resistance_percent=resistance_distance,
        above_sma20_percent=above_sma20,
        above_ema20_percent=above_ema20,
    )


def is_near_resistance(snapshot: TechnicalSnapshot) -> bool:
    if not _is_positive(snapshot.latest_price) or not _is_positive(snapshot.resistance):
        return False
    distance = _percent_distance(snapshot.latest_price, snapshot.resistance)
    return 0 <= distance <= RECOMMENDATION_WAIT_NEAR_RESISTANCE_PERCENT


def is_below_support(snapshot: TechnicalSnapshot) -> bool:
    if snapshot.latest_price is None or not _is_positive(snapshot.support):
        return False
    return snapshot.latest_price < snapshot.support * (1 - NEAR_LEVEL_PERCENT_THRESHOLD / 200)


def compute_liquidity(snapshot: TechnicalSnapshot) -> LiquidityAnalysisResult:
    ratio = None
    consistency = 50
    if snapshot.average_volume and snapshot.average_volume > 0:
        ratio = snapshot.volume / snapshot.average_volume
        if ratio >= VOLUME_EXPANSION_RATIO:
            consistency = 85
        elif ratio >= VOLUME_CONSISTENCY_MIN_RATIO:
            consistency = 65
        elif ratio >= VOLUME_THIN_RATIO:
            consistency = 40
        else:
            consistency = 20

    if snapshot.average_volume is None or snapshot.average_volume <= 0:
        label = LiquidityLabel.ILLIQUID
        explanation = "Average volume baseline unavailable; treat liquidity as uncertain."
    elif snapshot.average_volume >= 1_000_000 and (ratio or 0) >= 0.8:
        label = LiquidityLabel.STRONG
        explanation = "Volume and turnover support active participation."
    elif snapshot.average_volume >= 250_000:
        label = LiquidityLabel.NORMAL
        explanation = "Liquidity is adequate for standard position sizing."
    elif snapshot.average_volume >= 50_000:
        label = LiquidityLabel.THIN
        explanation = "Average volume is thin; use smaller size and wider confirmation."
    else:
        label = LiquidityLabel.ILLIQUID
        explanation = "Very low average volume increases slippage and gap risk."

    return LiquidityAnalysisResult(
        label=label,
        average_volume=snapshot.average_volume,
        latest_volume_ratio=ratio,
        volume_consistency_score=consistency,
        average_turnover=snapshot.turnover,
        explanation=explanation,
    )


def compute_trade_plan(snapshot: TechnicalSnapshot) -> TradePlanResult:
    price = snapshot.latest_price
    support = snapshot.support
    resistance = snapshot.resistance
    if price is None:
        return TradePlanResult(None, None, None, None, None, None, "Trade plan unavailable without latest price.")

    volatility_buffer = (snapshot.volatility or 1.5) * STOP_LOSS_VOLATILITY_BUFFER_MULTIPLIER / 100
    entry_low = price * (1 - 0.01)
    entry_high = price * (1 + 0.005)
    if _is_positive(support) and price <= support * 1.03:
        entry_low = support * 0.995
        entry_high = support * 1.015
    elif snapshot.trend == TrendDirection.UPTREND and _is_positive(snapshot.sma20):
        entry_low = min(entry_low, snapshot.sma20 * 0.995)
        entry_high = max(entry_high, price)

    stop = support * (1 - volatility_buffer) if _is_positive(support) else price * (1 - 0.04 - volatility_buffer)
    target_high = resistance if _is_positive(resistance) and resistance > price else price * (1 + DEFAULT_RISK_REWARD_TARGET * 0.03)
    target_low = target_high * 0.97 if target_high else None
    entry_mid = (entry_low + entry_high) / 2
    risk = entry_mid - stop
    reward = (target_high - entry_mid) if target_high is not None else None
    risk_reward = (reward / risk) if reward is not None and risk > 0 else None

    explanation = "Entry near current/support context with stop below support and target at resistance."
    if risk_reward is not None and risk_reward < MIN_RISK_REWARD_RATIO:
        explanation = "Risk/reward is below preferred threshold; treat as a watchlist setup."

    return TradePlanResult(
        entry_zone_low=round(entry_low, 4),
        entry_zone_high=round(entry_high, 4),
        stop_loss=round(stop, 4),
        target_low=round(target_low, 4) if target_low is not None else None,
        target_high=round(target_high, 4) if target_high is not None else None,
        risk_reward_ratio=round(risk_reward, 2) if risk_reward is not None else None,
        explanation=explanation,
    )
