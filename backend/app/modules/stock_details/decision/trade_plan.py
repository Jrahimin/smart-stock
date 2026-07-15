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
    TRADE_PLAN_BREAKOUT_ENTRY_BUFFER_PERCENT,
    TRADE_PLAN_BREAKOUT_INVALIDATION_ATR_MULTIPLIER,
    TRADE_PLAN_CONTINUATION_REASSESS_SESSIONS,
    TRADE_PLAN_ENTRY_ZONE_PERCENT,
    TRADE_PLAN_EXPIRY_SESSIONS,
    TRADE_PLAN_MAX_RISK_PERCENT,
    TRADE_PLAN_PULLBACK_MAX_DISTANCE_PERCENT,
    TRADE_PLAN_TRAILING_ATR_MULTIPLIER,
    VOLUME_CONSISTENCY_MIN_RATIO,
    VOLUME_EXPANSION_RATIO,
    VOLUME_THIN_RATIO,
)
from app.core.enums import (
    EntryReadiness,
    EntryTiming,
    LiquidityLabel,
    OpportunityQuality,
    TradePlanManagementMode,
    TradePlanStatus,
    TraderRecommendation,
    TrendDirection,
    TurnoverProvenance,
)
from app.modules.stock_details.decision.conditional_opportunity import (
    resolve_entry_readiness,
)
from app.modules.stock_details.decision.market_regime import MarketRegimeResult
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
    entry_readiness: EntryReadiness = EntryReadiness.NOT_READY
    entry_timing: EntryTiming | None = None
    preferred_entry_zone_low: float | None = None
    preferred_entry_zone_high: float | None = None
    invalidation_price: float | None = None
    condition_text: str | None = None
    expiry_sessions: int | None = None
    trigger_price: float | None = None
    confirmation_rule: str | None = None
    management_mode: TradePlanManagementMode | None = None
    trailing_rule: str | None = None
    reassessment_sessions: int | None = None
    partial_profit_price: float | None = None


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


def _unavailable_plan(explanation: str, reason: str) -> TradePlanResult:
    return TradePlanResult(
        None,
        None,
        None,
        None,
        None,
        None,
        explanation,
        TradePlanStatus.UNAVAILABLE,
        (reason,),
    )


def _build_plan(
    *,
    entry_low: float,
    entry_high: float,
    stop: float,
    target_low: float | None,
    target_high: float | None,
    timing: EntryTiming,
    condition_text: str,
    management_mode: TradePlanManagementMode,
    explanation: str,
    expiry_sessions: int | None = None,
    trigger_price: float | None = None,
    confirmation_rule: str | None = None,
    trailing_rule: str | None = None,
    reassessment_sessions: int | None = None,
    partial_profit_price: float | None = None,
) -> TradePlanResult:
    if not (0 < stop < entry_low <= entry_high):
        return _unavailable_plan(
            "Trade plan unavailable because structural stop and entry ordering is invalid.",
            "invalid_stop_entry_ordering",
        )

    risk = entry_high - stop
    risk_percent = risk / entry_high * 100
    risk_reward: float | None = None
    reasons: list[str] = []
    if risk_percent > TRADE_PLAN_MAX_RISK_PERCENT:
        reasons.append("structural_risk_exceeds_policy_limit")

    if target_low is not None or target_high is not None:
        if not (
            target_low is not None
            and target_high is not None
            and entry_high < target_low <= target_high
        ):
            return _unavailable_plan(
                "Trade plan unavailable because stop, entry, and target ordering is invalid.",
                "invalid_price_ordering",
            )
        risk_reward = (target_low - entry_high) / risk if risk > 0 else None
        if risk_reward is None or risk_reward < MIN_RISK_REWARD_RATIO:
            reasons.append("conservative_risk_reward_below_minimum")

    status = TradePlanStatus.WATCH_ONLY if reasons else TradePlanStatus.VALID_ENTRY_PLAN
    readiness = resolve_entry_readiness(status, timing)
    resolved_explanation = (
        "Scenario levels are ordered, but current entry feasibility does not pass policy guards."
        if reasons
        else explanation
    )
    return TradePlanResult(
        entry_zone_low=round(entry_low, 4),
        entry_zone_high=round(entry_high, 4),
        stop_loss=round(stop, 4),
        target_low=round(target_low, 4) if target_low is not None else None,
        target_high=round(target_high, 4) if target_high is not None else None,
        risk_reward_ratio=round(risk_reward, 2) if risk_reward is not None else None,
        explanation=resolved_explanation,
        status=status,
        reasons=tuple(reasons),
        entry_readiness=readiness,
        entry_timing=timing,
        preferred_entry_zone_low=round(entry_low, 4),
        preferred_entry_zone_high=round(entry_high, 4),
        invalidation_price=round(stop, 4),
        condition_text=condition_text,
        expiry_sessions=expiry_sessions,
        trigger_price=round(trigger_price, 4) if trigger_price is not None else None,
        confirmation_rule=confirmation_rule,
        management_mode=management_mode,
        trailing_rule=trailing_rule,
        reassessment_sessions=reassessment_sessions,
        partial_profit_price=(
            round(partial_profit_price, 4) if partial_profit_price is not None else None
        ),
    )


def compute_trade_plan(
    snapshot: TechnicalSnapshot,
    *,
    opportunity_quality: OpportunityQuality | None = None,
    market_regime: MarketRegimeResult | None = None,
) -> TradePlanResult:
    price = snapshot.latest_price
    support = snapshot.support
    resistance = snapshot.resistance
    sma20 = snapshot.sma20
    atr14 = snapshot.atr14
    if price is None or price <= 0:
        return _unavailable_plan(
            "Trade plan unavailable without a positive latest price.",
            "positive_latest_price_required",
        )

    volatility_buffer = (snapshot.volatility or 1.5) * STOP_LOSS_VOLATILITY_BUFFER_MULTIPLIER / 100
    strong_opportunity = opportunity_quality in {None, OpportunityQuality.STRONG}
    if _is_positive(support):
        structural_stop = support * (1 - volatility_buffer)
    elif _is_positive(atr14):
        structural_stop = price - TRADE_PLAN_ATR_STOP_MULTIPLIER * atr14
    else:
        structural_stop = price * (1 - 0.04 - volatility_buffer)

    no_overhead_resistance = not _is_positive(resistance) or resistance <= price
    if (
        strong_opportunity
        and snapshot.trend == TrendDirection.UPTREND
        and snapshot.is_breakout
        and no_overhead_resistance
    ):
        entry_low = price * 0.99
        entry_high = price * (1 + TRADE_PLAN_BREAKOUT_ENTRY_BUFFER_PERCENT / 100)
        stop = structural_stop
        if _is_positive(atr14):
            stop = max(stop, price - TRADE_PLAN_ATR_STOP_MULTIPLIER * atr14)
        condition = (
            "Enter only while the completed breakout holds above the preferred zone; "
            "reassess if participation fades or the invalidation is breached."
        )
        plan = _build_plan(
            entry_low=entry_low,
            entry_high=entry_high,
            stop=stop,
            target_low=None,
            target_high=None,
            timing=EntryTiming.CONTINUATION,
            condition_text=condition,
            management_mode=TradePlanManagementMode.TRAILING,
            explanation=(
                "No reliable overhead resistance exists; the continuation is managed with "
                "a structural/ATR invalidation and trailing policy instead of a fixed target."
            ),
            trailing_rule=(
                f"Trail below the latest completed-session structure or "
                f"{TRADE_PLAN_TRAILING_ATR_MULTIPLIER:.1f} ATR, whichever is higher."
            ),
            reassessment_sessions=TRADE_PLAN_CONTINUATION_REASSESS_SESSIONS,
        )
        if market_regime is not None and not market_regime.permits_plan(plan.entry_timing):
            return replace(
                plan,
                status=TradePlanStatus.WATCH_ONLY,
                entry_readiness=EntryReadiness.NOT_READY,
                reasons=(*plan.reasons, "regime_plan_not_permitted"),
                explanation=(
                    "The managed continuation is defined but the current regime blocks entry."
                ),
            )
        return plan

    if no_overhead_resistance:
        return TradePlanResult(
            entry_zone_low=round(price * 0.99, 4),
            entry_zone_high=round(price * 1.005, 4),
            stop_loss=round(structural_stop, 4),
            target_low=None,
            target_high=None,
            risk_reward_ratio=None,
            explanation=(
                "Entry and structural invalidation are available, but no overhead "
                "resistance objective supports a fresh entry plan."
            ),
            status=TradePlanStatus.WATCH_ONLY,
            reasons=("resistance_target_unavailable",),
            invalidation_price=round(structural_stop, 4),
        )

    resolved_resistance = resistance
    if resolved_resistance is None or resolved_resistance <= 0:
        raise AssertionError("Overhead resistance must be positive after plan guard")
    resistance_distance = _percent_distance(price, resolved_resistance)
    breakout_setup = strong_opportunity and snapshot.trend == TrendDirection.UPTREND and (
        snapshot.is_breakout
        or 0 <= resistance_distance <= RECOMMENDATION_WAIT_NEAR_RESISTANCE_PERCENT
    )
    if breakout_setup:
        trigger = resolved_resistance
        entry_low = trigger
        entry_high = trigger * (1 + TRADE_PLAN_BREAKOUT_ENTRY_BUFFER_PERCENT / 100)
        atr_value = atr14 if _is_positive(atr14) else None
        atr_stop = (
            trigger - TRADE_PLAN_BREAKOUT_INVALIDATION_ATR_MULTIPLIER * atr_value
            if atr_value is not None
            else trigger * 0.96
        )
        stop = max(structural_stop, atr_stop)
        initial_risk = entry_high - stop
        projection_distance = (
            max(initial_risk * 2, atr_value * 2)
            if atr_value is not None
            else initial_risk * 2
        )
        projected_target = entry_high + projection_distance
        management_mode = (
            TradePlanManagementMode.ATR_PROJECTION
            if atr_value is not None
            else TradePlanManagementMode.MEASURED_MOVE
        )
        plan = _build_plan(
            entry_low=entry_low,
            entry_high=entry_high,
            stop=stop,
            target_low=projected_target - initial_risk * 0.25,
            target_high=projected_target,
            timing=EntryTiming.BREAKOUT,
            condition_text=(
                "Enter only after a completed-session close confirms the trigger with "
                "acceptable participation."
            ),
            management_mode=management_mode,
            explanation=(
                "The breakout plan uses a completed-session trigger, participation "
                "confirmation, structural invalidation, and measured objective."
            ),
            expiry_sessions=TRADE_PLAN_EXPIRY_SESSIONS,
            trigger_price=trigger,
            confirmation_rule=(
                "Completed-session close above trigger with volume at or above its baseline."
            ),
        )
        if market_regime is not None and not market_regime.permits_plan(plan.entry_timing):
            return replace(
                plan,
                status=TradePlanStatus.WATCH_ONLY,
                entry_readiness=EntryReadiness.NOT_READY,
                reasons=(*plan.reasons, "regime_plan_not_permitted"),
                explanation=(
                    "The breakout condition is defined but the current regime blocks entry."
                ),
            )
        return plan

    pullback_reference = None
    if snapshot.trend == TrendDirection.UPTREND:
        candidates: list[float] = []
        for level in (support, sma20):
            if _is_positive(level) and level < price:
                candidates.append(level)
        if candidates:
            pullback_reference = max(candidates)
    pullback_distance = (
        _percent_distance(pullback_reference, price)
        if pullback_reference is not None
        else None
    )
    if (
        strong_opportunity
        and pullback_reference is not None
        and pullback_distance is not None
        and TRADE_PLAN_ENTRY_ZONE_PERCENT < pullback_distance
        <= TRADE_PLAN_PULLBACK_MAX_DISTANCE_PERCENT
    ):
        entry_low = pullback_reference
        entry_high = pullback_reference * (1 + TRADE_PLAN_ENTRY_ZONE_PERCENT / 100)
        return _build_plan(
            entry_low=entry_low,
            entry_high=entry_high,
            stop=structural_stop,
            target_low=resolved_resistance * 0.97,
            target_high=resolved_resistance,
            timing=EntryTiming.PULLBACK,
            condition_text=(
                "Enter only if price revisits and holds the preferred support or "
                "moving-average zone."
            ),
            management_mode=TradePlanManagementMode.STRUCTURAL,
            explanation=(
                "The strong opportunity has a precise pullback zone, structural invalidation, "
                "and overhead objective."
            ),
            expiry_sessions=TRADE_PLAN_EXPIRY_SESSIONS,
        )

    entry_low = price * 0.99
    entry_high = price * 1.005
    if _is_positive(support) and price <= support * 1.03:
        entry_low = support
        entry_high = support * 1.015
    return _build_plan(
        entry_low=entry_low,
        entry_high=entry_high,
        stop=structural_stop,
        target_low=resolved_resistance * 0.97,
        target_high=resolved_resistance,
        timing=EntryTiming.READY,
        condition_text="Entry setup is currently available near the shown range.",
        management_mode=TradePlanManagementMode.STRUCTURAL,
        explanation="Entry, structural invalidation, and objective form an executable plan.",
        expiry_sessions=TRADE_PLAN_CONTINUATION_REASSESS_SESSIONS,
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
            entry_readiness=EntryReadiness.NOT_READY,
            entry_timing=None,
            reasons=(*plan.reasons, "current_action_does_not_support_fresh_entry"),
            explanation="Scenario levels are watch-only for the current decision.",
        )
    return plan
