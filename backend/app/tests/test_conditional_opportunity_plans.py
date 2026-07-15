from dataclasses import replace

import pytest

from app.core.constants.trading_constants import MARKET_REGIME_BEARISH
from app.core.enums import (
    DataQualityFlag,
    EligibilityStatus,
    EntryReadiness,
    EntryTiming,
    EvidenceDirection,
    LiquidityLabel,
    MarketRegimePhase,
    OpportunityQuality,
    RiskLevelLabel,
    TradePlanManagementMode,
    TradePlanStatus,
    TraderRecommendation,
    TrendDirection,
)
from app.modules.stock_details.decision.constraints import build_decision_constraints
from app.modules.stock_details.decision.evidence import DirectionalEvidenceResult
from app.modules.stock_details.decision.market_regime import MarketRegimeResult
from app.modules.stock_details.decision.recommendation import compute_recommendation
from app.modules.stock_details.decision.risk import TradingRiskResult
from app.modules.stock_details.decision.scoring import (
    compute_opportunity_score,
    compute_risk_score,
)
from app.modules.stock_details.decision.technical import TechnicalSnapshot
from app.modules.stock_details.decision.trade_plan import (
    compute_liquidity,
    compute_trade_plan,
)


def _snapshot(**changes: object) -> TechnicalSnapshot:
    base = TechnicalSnapshot(
        latest_price=100.0,
        previous_close=99.0,
        price_change=1.0,
        price_change_percent=1.01,
        volume=1_500_000,
        average_volume=1_000_000,
        turnover=150_000_000,
        rsi=60.0,
        sma20=99.0,
        ema20=99.2,
        volatility=1.0,
        support=98.0,
        resistance=130.0,
        trend=TrendDirection.UPTREND,
        data_quality=DataQualityFlag.OK,
        latest_trade_date="2026-07-14",
        ohlcv_row_count=60,
        sma50=94.0,
        atr14=2.0,
        average_turnover=100_000_000,
        return_5d_percent=4.0,
        return_20d_percent=10.0,
        traded_session_count=60,
        traded_session_ratio=1.0,
        median_turnover=100_000_000,
        turnover_observation_count=20,
    )
    return replace(base, **changes)


@pytest.mark.parametrize(
    ("snapshot", "timing"),
    [
        (_snapshot(), EntryTiming.READY),
        (_snapshot(support=94.0, sma20=95.0), EntryTiming.PULLBACK),
        (_snapshot(support=96.0, resistance=101.0), EntryTiming.BREAKOUT),
        (
            _snapshot(support=95.0, resistance=None, is_breakout=True),
            EntryTiming.CONTINUATION,
        ),
    ],
)
def test_each_entry_timing_has_condition_and_invalidation(
    snapshot: TechnicalSnapshot,
    timing: EntryTiming,
) -> None:
    plan = compute_trade_plan(
        snapshot,
        opportunity_quality=OpportunityQuality.STRONG,
    )

    assert plan.status == TradePlanStatus.VALID_ENTRY_PLAN
    assert plan.entry_timing == timing
    assert plan.entry_readiness in {EntryReadiness.READY, EntryReadiness.CONDITIONAL}
    assert plan.condition_text
    assert plan.invalidation_price is not None
    assert plan.invalidation_price < (plan.preferred_entry_zone_low or 0)


def _strong_directional_evidence() -> DirectionalEvidenceResult:
    return DirectionalEvidenceResult(
        direction=EvidenceDirection.BULLISH,
        bullish_score=75,
        bearish_score=25,
        coverage_percent=100,
        components=(),
    )


def _resolve_with_constraints(
    snapshot: TechnicalSnapshot,
    *,
    plan_status: TradePlanStatus,
    eligibility_status: EligibilityStatus = EligibilityStatus.ELIGIBLE,
    suspected_adjustment: bool = False,
    liquidity_label: LiquidityLabel = LiquidityLabel.STRONG,
    trading_risk_label: RiskLevelLabel = RiskLevelLabel.LOW,
    below_support: bool = False,
) -> TraderRecommendation:
    liquidity = compute_liquidity(snapshot)
    risk = compute_risk_score(snapshot, "A", liquidity.label, is_stale=False, is_sparse=False)
    opportunity = compute_opportunity_score(snapshot, risk.score, liquidity.label)
    constraints = build_decision_constraints(
        snapshot,
        trading_risk_label=trading_risk_label,
        liquidity_label=liquidity_label,
        trade_plan_status=plan_status,
        eligibility_status=eligibility_status,
        is_stale=False,
        is_sparse=False,
        suspected_adjustment=suspected_adjustment,
        below_support=below_support,
        near_resistance=False,
        market_regime=None,
        entry_timing=EntryTiming.READY,
    )
    decision = compute_recommendation(
        snapshot,
        opportunity,
        risk,
        near_resistance=False,
        below_support=below_support,
        risk_reward=2.0,
        is_stale=False,
        is_sparse=False,
        liquidity_label=liquidity_label,
        suspected_adjustment=suspected_adjustment,
        trade_plan_status=plan_status,
        eligibility_status=eligibility_status,
        directional_evidence=_strong_directional_evidence(),
        trading_risk=TradingRiskResult(
            score=20 if trading_risk_label == RiskLevelLabel.LOW else 80,
            label=trading_risk_label,
            components=(),
        ),
        constraints=constraints,
        opportunity_quality=OpportunityQuality.STRONG,
        entry_readiness=(
            EntryReadiness.READY
            if plan_status == TradePlanStatus.VALID_ENTRY_PLAN
            else EntryReadiness.NOT_READY
        ),
        entry_timing=(
            EntryTiming.READY if plan_status == TradePlanStatus.VALID_ENTRY_PLAN else None
        ),
    )
    return decision.recommendation


def test_strong_bullish_evidence_without_valid_plan_remains_wait() -> None:
    recommendation = _resolve_with_constraints(
        _snapshot(),
        plan_status=TradePlanStatus.WATCH_ONLY,
    )

    assert recommendation == TraderRecommendation.WAIT


@pytest.mark.parametrize(
    "guard",
    [
        {"eligibility_status": EligibilityStatus.REVIEW_ONLY},
        {"suspected_adjustment": True},
        {"liquidity_label": LiquidityLabel.ILLIQUID},
        {"trading_risk_label": RiskLevelLabel.HIGH},
        {"plan_status": TradePlanStatus.WATCH_ONLY},
    ],
)
def test_hard_safeguards_cannot_produce_buy(guard: dict[str, object]) -> None:
    arguments: dict[str, object] = {"plan_status": TradePlanStatus.VALID_ENTRY_PLAN}
    arguments.update(guard)

    recommendation = _resolve_with_constraints(_snapshot(), **arguments)

    assert recommendation != TraderRecommendation.BUY


def test_structural_failure_is_sell_not_potential_entry() -> None:
    recommendation = _resolve_with_constraints(
        _snapshot(),
        plan_status=TradePlanStatus.WATCH_ONLY,
        below_support=True,
    )

    assert recommendation == TraderRecommendation.SELL


def test_extension_limit_cannot_produce_buy() -> None:
    recommendation = _resolve_with_constraints(
        _snapshot(return_20d_percent=30.0),
        plan_status=TradePlanStatus.VALID_ENTRY_PLAN,
    )

    assert recommendation == TraderRecommendation.WAIT


def test_no_overhead_resistance_uses_trailing_management_without_fixed_reward() -> None:
    plan = compute_trade_plan(
        _snapshot(support=95.0, resistance=None, is_breakout=True),
        opportunity_quality=OpportunityQuality.STRONG,
    )

    assert plan.entry_timing == EntryTiming.CONTINUATION
    assert plan.management_mode == TradePlanManagementMode.TRAILING
    assert plan.target_low is None and plan.target_high is None
    assert plan.risk_reward_ratio is None
    assert plan.trailing_rule
    assert plan.reassessment_sessions


def test_regime_cannot_bypass_constraints_and_can_block_breakout_policy() -> None:
    bearish_regime = MarketRegimeResult(
        score=25,
        label=MARKET_REGIME_BEARISH,
        phase=MarketRegimePhase.REVERSAL_RISK,
        confidence=90,
        explanation="Test bearish regime.",
    )
    plan = compute_trade_plan(
        _snapshot(support=96.0, resistance=101.0),
        opportunity_quality=OpportunityQuality.STRONG,
        market_regime=bearish_regime,
    )

    assert plan.status == TradePlanStatus.WATCH_ONLY
    assert "regime_plan_not_permitted" in plan.reasons
    assert (
        _resolve_with_constraints(
            _snapshot(),
            plan_status=TradePlanStatus.VALID_ENTRY_PLAN,
            eligibility_status=EligibilityStatus.REVIEW_ONLY,
        )
        == TraderRecommendation.WAIT
    )
