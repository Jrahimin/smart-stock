from __future__ import annotations

from dataclasses import dataclass, replace
from typing import TypeGuard

from app.core.constants.trading_constants import (
    LIQUIDITY_TURNOVER_NORMAL,
    LIQUIDITY_TURNOVER_STRONG,
    LIQUIDITY_TURNOVER_THIN,
    MIN_RISK_REWARD_RATIO,
    NEAR_LEVEL_PERCENT_THRESHOLD,
    RECOMMENDATION_WAIT_NEAR_RESISTANCE_PERCENT,
    STOP_LOSS_VOLATILITY_BUFFER_MULTIPLIER,
    TRADE_PLAN_ATR_STOP_MULTIPLIER,
    TRADE_PLAN_MAX_RISK_PERCENT,
    VOLUME_CONSISTENCY_MIN_RATIO,
    VOLUME_EXPANSION_RATIO,
    VOLUME_THIN_RATIO,
)
from app.core.enums import (
    LiquidityLabel,
    TradePlanStatus,
    TraderRecommendation,
    TrendDirection,
    TurnoverProvenance,
)
from app.modules.stock_details.decision.technical import TechnicalSnapshot


def _percent_distance(from_price: float, to_price: float) -> float:
    if from_price == 0:
        return 0.0
    return ((to_price - from_price) / from_price) * 100


def _is_positive(value: float | None) -> TypeGuard[float]:
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
    status: TradePlanStatus
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class LiquidityAnalysisResult:
    label: LiquidityLabel
    average_volume: float | None
    latest_volume_ratio: float | None
    volume_consistency_score: int
    average_turnover: float | None
    median_turnover: float | None
    turnover_observation_count: int
    turnover_provenance: TurnoverProvenance
    traded_session_ratio: float
    explanation: str


def compute_price_position(snapshot: TechnicalSnapshot) -> PricePositionResult:
    price = snapshot.latest_price
    support = snapshot.support
    resistance = snapshot.resistance
    sma20 = snapshot.sma20
    ema20 = snapshot.ema20
    support_distance = None
    resistance_distance = None
    above_sma20 = None
    above_ema20 = None
    if price is not None and _is_positive(support):
        support_distance = _percent_distance(support, price)
    if price is not None and _is_positive(resistance):
        resistance_distance = _percent_distance(price, resistance)
    if price is not None and _is_positive(sma20):
        above_sma20 = _percent_distance(sma20, price)
    if price is not None and _is_positive(ema20):
        above_ema20 = _percent_distance(ema20, price)
    return PricePositionResult(
        current_price=price,
        distance_to_support_percent=support_distance,
        distance_to_resistance_percent=resistance_distance,
        above_sma20_percent=above_sma20,
        above_ema20_percent=above_ema20,
    )


def is_near_resistance(snapshot: TechnicalSnapshot) -> bool:
    price = snapshot.latest_price
    resistance = snapshot.resistance
    if not _is_positive(price) or not _is_positive(resistance):
        return False
    distance = _percent_distance(price, resistance)
    return 0 <= distance <= RECOMMENDATION_WAIT_NEAR_RESISTANCE_PERCENT


def is_below_support(snapshot: TechnicalSnapshot) -> bool:
    price = snapshot.latest_price
    support = snapshot.support
    if price is None or not _is_positive(support):
        return False
    return price < support * (1 - NEAR_LEVEL_PERCENT_THRESHOLD / 200)


def _liquidity_from_volume(
    average_volume: float | None, ratio: float | None
) -> tuple[LiquidityLabel, str]:
    """Fallback classification when BDT turnover history is unavailable."""
    if average_volume is None or average_volume <= 0:
        return (
            LiquidityLabel.ILLIQUID,
            "Average volume baseline unavailable; treat liquidity as uncertain.",
        )
    if average_volume >= 1_000_000 and (ratio or 0) >= 0.8:
        return (
            LiquidityLabel.STRONG,
            "Volume supports active participation (turnover baseline unavailable).",
        )
    if average_volume >= 250_000:
        return LiquidityLabel.NORMAL, "Liquidity is adequate for standard position sizing."
    if average_volume >= 50_000:
        return (
            LiquidityLabel.THIN,
            "Average volume is thin; use smaller size and wider confirmation.",
        )
    return LiquidityLabel.ILLIQUID, "Very low average volume increases slippage and gap risk."


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

    average_turnover = snapshot.average_turnover
    robust_turnover = snapshot.median_turnover
    if robust_turnover is not None and robust_turnover > 0:
        if robust_turnover >= LIQUIDITY_TURNOVER_STRONG:
            label = LiquidityLabel.STRONG
            explanation = "Median traded-session turnover is deep for the observed window."
        elif robust_turnover >= LIQUIDITY_TURNOVER_NORMAL:
            label = LiquidityLabel.NORMAL
            explanation = "Median traded-session turnover is adequate for standard sizing."
        elif robust_turnover >= LIQUIDITY_TURNOVER_THIN:
            label = LiquidityLabel.THIN
            explanation = "Median traded-session turnover is thin; use smaller size."
        else:
            label = LiquidityLabel.ILLIQUID
            explanation = "Very low median turnover increases slippage and non-fill risk."
    else:
        label, explanation = _liquidity_from_volume(snapshot.average_volume, ratio)

    return LiquidityAnalysisResult(
        label=label,
        average_volume=snapshot.average_volume,
        latest_volume_ratio=ratio,
        volume_consistency_score=consistency,
        average_turnover=average_turnover,
        median_turnover=robust_turnover,
        turnover_observation_count=snapshot.turnover_observation_count,
        turnover_provenance=snapshot.turnover_provenance,
        traded_session_ratio=snapshot.traded_session_ratio,
        explanation=explanation,
    )


def compute_trade_plan(snapshot: TechnicalSnapshot) -> TradePlanResult:
    price = snapshot.latest_price
    support = snapshot.support
    resistance = snapshot.resistance
    sma20 = snapshot.sma20
    atr14 = snapshot.atr14
    if price is None or price <= 0:
        return TradePlanResult(
            None,
            None,
            None,
            None,
            None,
            None,
            "Trade plan unavailable without a positive latest price.",
            TradePlanStatus.UNAVAILABLE,
            ("positive_latest_price_required",),
        )

    volatility_buffer = (snapshot.volatility or 1.5) * STOP_LOSS_VOLATILITY_BUFFER_MULTIPLIER / 100
    entry_low = price * (1 - 0.01)
    entry_high = price * (1 + 0.005)
    if _is_positive(support) and price <= support * 1.03:
        entry_low = support * 0.995
        entry_high = support * 1.015
    elif snapshot.trend == TrendDirection.UPTREND and _is_positive(sma20):
        sma_entry = sma20 * 0.995
        if not _is_positive(support) or sma_entry > support:
            entry_low = min(entry_low, sma_entry)
        entry_high = max(entry_high, price)

    conservative_entry = entry_high

    # A support-based stop is the structural invalidation. A policy risk cap may
    # reject the setup, but it must not move the stop above that invalidation.
    if _is_positive(support):
        stop = support * (1 - volatility_buffer)
    elif _is_positive(atr14):
        stop = conservative_entry - TRADE_PLAN_ATR_STOP_MULTIPLIER * atr14
    else:
        stop = price * (1 - 0.04 - volatility_buffer)

    if not _is_positive(resistance) or resistance <= conservative_entry:
        if not (0 < stop < entry_low <= entry_high):
            return TradePlanResult(
                None,
                None,
                None,
                None,
                None,
                None,
                "Trade plan unavailable because structural stop and entry ordering is invalid.",
                TradePlanStatus.UNAVAILABLE,
                ("invalid_stop_entry_ordering",),
            )
        return TradePlanResult(
            entry_zone_low=round(entry_low, 4),
            entry_zone_high=round(entry_high, 4),
            stop_loss=round(stop, 4),
            target_low=None,
            target_high=None,
            risk_reward_ratio=None,
            explanation=(
                "Entry and structural invalidation are available, but no overhead "
                "resistance objective supports a fresh entry plan."
            ),
            status=TradePlanStatus.WATCH_ONLY,
            reasons=("resistance_target_unavailable",),
        )

    target_high = resistance
    target_low = target_high * 0.97 if target_high else None
    risk = conservative_entry - stop
    reward = (target_low - conservative_entry) if target_low is not None else None
    risk_reward = (reward / risk) if reward is not None and risk > 0 else None

    geometry_valid = (
        0 < entry_low <= entry_high
        and 0 < stop < entry_low
        and target_low is not None
        and target_high is not None
        and entry_high < target_low <= target_high
        and risk_reward is not None
        and risk_reward > 0
    )
    if not geometry_valid:
        return TradePlanResult(
            None,
            None,
            None,
            None,
            None,
            None,
            "Trade plan unavailable because stop, entry, and target ordering is invalid.",
            TradePlanStatus.UNAVAILABLE,
            ("invalid_price_ordering",),
        )

    risk_percent = risk / conservative_entry * 100
    reasons: list[str] = []
    if risk_percent > TRADE_PLAN_MAX_RISK_PERCENT:
        reasons.append("structural_risk_exceeds_policy_limit")
    if risk_reward is not None and risk_reward < MIN_RISK_REWARD_RATIO:
        reasons.append("conservative_risk_reward_below_minimum")

    if reasons:
        status = TradePlanStatus.WATCH_ONLY
        explanation = (
            "Scenario levels are ordered, but current entry feasibility does not pass "
            "policy guards."
        )
    else:
        status = TradePlanStatus.VALID_ENTRY_PLAN
        explanation = (
            "Entry, structural stop, and target references form a valid conditional scenario."
        )

    return TradePlanResult(
        entry_zone_low=round(entry_low, 4),
        entry_zone_high=round(entry_high, 4),
        stop_loss=round(stop, 4),
        target_low=round(target_low, 4) if target_low is not None else None,
        target_high=round(target_high, 4) if target_high is not None else None,
        risk_reward_ratio=round(risk_reward, 2) if risk_reward is not None else None,
        explanation=explanation,
        status=status,
        reasons=tuple(reasons),
    )


def align_trade_plan_with_decision(
    plan: TradePlanResult,
    recommendation: TraderRecommendation,
    *,
    is_stale: bool,
    is_sparse: bool,
) -> TradePlanResult:
    """Prevent a long-entry plan from contradicting the final action or data state."""
    if is_stale or is_sparse or recommendation == TraderRecommendation.SELL:
        reason = (
            "unreliable_data_for_entry_plan"
            if is_stale or is_sparse
            else "sell_action_has_no_entry_plan"
        )
        return TradePlanResult(
            None,
            None,
            None,
            None,
            None,
            None,
            "A fresh long-entry plan is unavailable for this decision.",
            TradePlanStatus.UNAVAILABLE,
            (reason,),
        )
    if recommendation in {TraderRecommendation.HOLD, TraderRecommendation.WAIT}:
        if plan.status == TradePlanStatus.UNAVAILABLE:
            return plan
        return replace(
            plan,
            status=TradePlanStatus.WATCH_ONLY,
            reasons=(*plan.reasons, "current_action_does_not_support_fresh_entry"),
            explanation="Scenario levels are watch-only for the current decision.",
        )
    return plan
