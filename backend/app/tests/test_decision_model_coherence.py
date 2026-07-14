from dataclasses import replace
from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

from app.core.enums import (
    DataQualityFlag,
    EligibilityStatus,
    EvidenceDirection,
    HolderAction,
    NonHolderAction,
    RiskLevelLabel,
    TradePlanStatus,
    TraderRecommendation,
    TrendDirection,
    TurnoverProvenance,
    WarningSeverity,
)
from app.models import DailyPrice
from app.modules.stock_details.decision.constraints import build_decision_constraints
from app.modules.stock_details.decision.data_eligibility import EligibilityResult
from app.modules.stock_details.decision.engine import TraderDecisionBundle
from app.modules.stock_details.decision.evidence import (
    DirectionalEvidenceResult,
    compute_data_reliability,
    compute_directional_evidence,
)
from app.modules.stock_details.decision.risk import TradingRiskResult, compute_trading_risk
from app.modules.stock_details.decision.scoring import (
    compute_opportunity_score,
    compute_recommendation,
    compute_risk_score,
)
from app.modules.stock_details.decision.summary import build_trader_decision_summary
from app.modules.stock_details.decision.technical import TechnicalSnapshot, build_technical_snapshot
from app.modules.stock_details.decision.trade_plan import compute_liquidity, compute_trade_plan
from app.modules.stock_details.decision.warnings import generate_warnings


def _price(trade_date: date, close: float, *, volume: int = 1_000_000) -> DailyPrice:
    return DailyPrice(
        id=uuid4(),
        stock_id=uuid4(),
        trade_date=trade_date,
        open_price=Decimal(str(close - 0.1)),
        high_price=Decimal(str(close + 0.4)),
        low_price=Decimal(str(close - 0.4)),
        close_price=Decimal(str(close)),
        volume=volume,
        turnover=Decimal(str(close * volume)),
        turnover_provenance=TurnoverProvenance.REPORTED,
        source="TEST",
        data_quality_flag=DataQualityFlag.OK,
    )


def _bullish_snapshot() -> TechnicalSnapshot:
    prices = [
        _price(date(2026, 1, 1) + timedelta(days=index), 20 + index * 0.2) for index in range(60)
    ]
    snapshot = build_technical_snapshot(prices)
    assert snapshot is not None
    price = snapshot.latest_price or 30
    return replace(
        snapshot,
        trend=TrendDirection.UPTREND,
        rsi=60,
        return_5d_percent=4,
        return_20d_percent=10,
        support=price * 0.95,
        resistance=price * 1.25,
        is_breakout=False,
    )


def _compatibility_scores(snapshot: TechnicalSnapshot):
    liquidity = compute_liquidity(snapshot)
    risk = compute_risk_score(
        snapshot,
        "A",
        liquidity.label,
        is_stale=False,
        is_sparse=False,
    )
    opportunity = compute_opportunity_score(snapshot, risk.score, liquidity.label)
    return liquidity, risk, opportunity


def _eligibility(**changes: object) -> EligibilityResult:
    base = EligibilityResult(
        status=EligibilityStatus.ELIGIBLE,
        reason_codes=(),
        exchange_session_date=date(2026, 3, 1),
        latest_trade_date=date(2026, 3, 1),
        missed_session_count=0,
        valid_ohlcv_row_count=60,
        invalid_ohlcv_row_count=0,
        traded_session_count=60,
        zero_volume_session_count=0,
        traded_session_ratio=1.0,
        quality_ok_count=50,
        quality_partial_count=0,
        quality_suspicious_count=0,
        median_turnover=25_000_000,
        turnover_observation_count=20,
        turnover_provenance=TurnoverProvenance.REPORTED,
        analytical_price_basis="RAW_UNADJUSTED",
        corporate_action_status="NONE",
    )
    return replace(base, **changes)


def _directional(direction: EvidenceDirection, score: int) -> DirectionalEvidenceResult:
    return DirectionalEvidenceResult(
        direction=direction,
        bullish_score=score if direction == EvidenceDirection.BULLISH else 100 - score,
        bearish_score=score if direction == EvidenceDirection.BEARISH else 100 - score,
        coverage_percent=100,
        components=(),
    )


def test_bullish_and_bearish_directional_evidence_are_mirrored() -> None:
    bullish = _bullish_snapshot()
    price = bullish.latest_price or 30
    bearish = replace(
        bullish,
        trend=TrendDirection.DOWNTREND,
        return_5d_percent=-4,
        return_20d_percent=-10,
        support=price * 0.8,
        resistance=price * 1.05,
    )

    bullish_result = compute_directional_evidence(bullish)
    bearish_result = compute_directional_evidence(bearish)

    assert bullish_result.direction == EvidenceDirection.BULLISH
    assert bearish_result.direction == EvidenceDirection.BEARISH
    assert bullish_result.bullish_score == bearish_result.bearish_score
    assert bullish_result.bearish_score == bearish_result.bullish_score


def test_data_reliability_degrades_independently_of_directional_evidence() -> None:
    snapshot = _bullish_snapshot()
    direction_before = compute_directional_evidence(snapshot)
    reliable = compute_data_reliability(_eligibility(), snapshot)
    suspicious = compute_data_reliability(
        _eligibility(
            status=EligibilityStatus.REVIEW_ONLY,
            reason_codes=("suspicious_price_quality",),
            quality_ok_count=49,
            quality_suspicious_count=1,
        ),
        snapshot,
    )

    assert reliable.score == 85
    assert suspicious.score == 30
    assert suspicious.score < reliable.score
    assert compute_directional_evidence(snapshot) == direction_before


def test_contextual_action_matrix_and_exact_direction_boundary() -> None:
    snapshot = _bullish_snapshot()
    liquidity, risk, opportunity = _compatibility_scores(snapshot)
    trading_risk = compute_trading_risk(snapshot, "A")

    below_boundary = compute_recommendation(
        snapshot,
        opportunity,
        risk,
        near_resistance=False,
        below_support=False,
        risk_reward=2,
        is_stale=False,
        is_sparse=False,
        liquidity_label=liquidity.label,
        trade_plan_status=TradePlanStatus.VALID_ENTRY_PLAN,
        directional_evidence=_directional(EvidenceDirection.BULLISH, 54),
        trading_risk=trading_risk,
    )
    at_boundary = compute_recommendation(
        snapshot,
        opportunity,
        risk,
        near_resistance=False,
        below_support=False,
        risk_reward=2,
        is_stale=False,
        is_sparse=False,
        liquidity_label=liquidity.label,
        trade_plan_status=TradePlanStatus.VALID_ENTRY_PLAN,
        directional_evidence=_directional(EvidenceDirection.BULLISH, 55),
        trading_risk=trading_risk,
    )

    assert below_boundary.recommendation == TraderRecommendation.HOLD
    assert below_boundary.non_holder_action == NonHolderAction.WAIT
    assert below_boundary.holder_action == HolderAction.HOLD
    assert at_boundary.recommendation == TraderRecommendation.BUY
    assert at_boundary.non_holder_action == NonHolderAction.BUY
    assert at_boundary.holder_action == HolderAction.HOLD


def test_sell_requires_bearish_evidence_while_high_risk_alone_waits() -> None:
    snapshot = replace(_bullish_snapshot(), trend=TrendDirection.SIDEWAYS)
    liquidity, risk, opportunity = _compatibility_scores(snapshot)
    high_risk = TradingRiskResult(score=60, label=RiskLevelLabel.HIGH, components=())

    decision = compute_recommendation(
        snapshot,
        opportunity,
        risk,
        near_resistance=False,
        below_support=False,
        risk_reward=2,
        is_stale=False,
        is_sparse=False,
        liquidity_label=liquidity.label,
        trade_plan_status=TradePlanStatus.VALID_ENTRY_PLAN,
        directional_evidence=_directional(EvidenceDirection.NEUTRAL, 50),
        trading_risk=high_risk,
    )

    assert decision.recommendation == TraderRecommendation.WAIT
    assert decision.non_holder_action == NonHolderAction.AVOID
    assert decision.holder_action == HolderAction.REVIEW


def test_support_break_and_data_veto_have_authoritative_precedence() -> None:
    snapshot = replace(_bullish_snapshot(), trend=TrendDirection.DOWNTREND)
    liquidity, risk, opportunity = _compatibility_scores(snapshot)
    trading_risk = compute_trading_risk(snapshot, "A")

    sell = compute_recommendation(
        snapshot,
        opportunity,
        risk,
        near_resistance=False,
        below_support=True,
        risk_reward=None,
        is_stale=False,
        is_sparse=False,
        liquidity_label=liquidity.label,
        trade_plan_status=TradePlanStatus.WATCH_ONLY,
        directional_evidence=_directional(EvidenceDirection.BEARISH, 55),
        trading_risk=trading_risk,
    )
    blocked = compute_recommendation(
        snapshot,
        opportunity,
        risk,
        near_resistance=False,
        below_support=True,
        risk_reward=None,
        is_stale=False,
        is_sparse=False,
        liquidity_label=liquidity.label,
        trade_plan_status=TradePlanStatus.WATCH_ONLY,
        eligibility_status=EligibilityStatus.REVIEW_ONLY,
        eligibility_reasons=("suspicious_price_quality",),
        directional_evidence=_directional(EvidenceDirection.BEARISH, 55),
        trading_risk=trading_risk,
    )

    assert sell.recommendation == TraderRecommendation.SELL
    assert sell.primary_reason_code == "support_break"
    assert blocked.recommendation == TraderRecommendation.WAIT
    assert blocked.primary_reason_code == "data_not_eligible"
    assert blocked.holder_action == HolderAction.REVIEW


def test_primary_summary_reason_is_not_last_appended_constraint() -> None:
    snapshot = _bullish_snapshot()
    liquidity, risk, opportunity = _compatibility_scores(snapshot)
    plan = compute_trade_plan(snapshot)
    decision = compute_recommendation(
        snapshot,
        opportunity,
        risk,
        near_resistance=False,
        below_support=False,
        risk_reward=plan.risk_reward_ratio,
        is_stale=False,
        is_sparse=False,
        liquidity_label=liquidity.label,
        market_regime="BEARISH",
        trade_plan_status=plan.status,
        trading_risk=compute_trading_risk(snapshot, "A"),
    )
    bundle = TraderDecisionBundle(
        snapshot=snapshot,
        liquidity=liquidity,
        opportunity=opportunity,
        risk=risk,
        trade_plan=plan,
        decision=decision,
        confidence=decision.confidence,
        is_stale=False,
        is_sparse=False,
    )

    summary = build_trader_decision_summary(bundle)

    assert decision.primary_reason_code == "bearish_market_regime"
    assert decision.reasoning[-1].startswith("Constraint [DOWNGRADE]")
    assert summary.reason == decision.primary_reason
    assert summary.primary_reason_code == "bearish_market_regime"


def test_missing_resistance_is_watch_only_without_fabricated_target() -> None:
    plan = compute_trade_plan(replace(_bullish_snapshot(), resistance=None))

    assert plan.status == TradePlanStatus.WATCH_ONLY
    assert plan.target_low is None
    assert plan.target_high is None
    assert plan.risk_reward_ratio is None
    assert plan.reasons == ("resistance_target_unavailable",)


def test_constraint_warnings_match_action_and_patterns_remain_secondary() -> None:
    snapshot = replace(_bullish_snapshot(), trend=TrendDirection.DOWNTREND)
    liquidity, risk, opportunity = _compatibility_scores(snapshot)
    plan = compute_trade_plan(snapshot)
    constraints = build_decision_constraints(
        snapshot,
        trading_risk_label=RiskLevelLabel.LOW,
        liquidity_label=liquidity.label,
        trade_plan_status=plan.status,
        eligibility_status=EligibilityStatus.ELIGIBLE,
        is_stale=False,
        is_sparse=False,
        suspected_adjustment=False,
        below_support=True,
        near_resistance=False,
        market_regime=None,
    )
    warnings = generate_warnings(
        snapshot,
        opportunity,
        risk,
        liquidity,
        is_stale=False,
        is_sparse=False,
        category="A",
        pattern_name="Head and Shoulders",
        pattern_bearish=True,
        pattern_confirmed=True,
        constraints=constraints.constraints,
    )

    support_warning = next(item for item in warnings if item.code == "below_support")
    pattern_warning = next(item for item in warnings if item.code == "bearish_pattern")
    assert support_warning.severity == WarningSeverity.CRITICAL
    assert pattern_warning.severity == WarningSeverity.WARNING
