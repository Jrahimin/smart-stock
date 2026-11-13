from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from uuid import UUID

from app.core.constants.trading_constants import (
    DECISION_MIN_OHLCV_ROWS,
    DECISION_RECOMMENDATION_LOOKBACK,
)
from app.core.enums import ExchangeCode, TradePlanStatus
from app.models import DailyPrice
from app.modules.stock_details.decision.canonical import (
    CanonicalDecisionResult,
    StrategyInput,
    build_canonical_decision_result,
    build_strategy_input_from_prices,
)
from app.modules.stock_details.decision.conditional_opportunity import (
    OpportunityQualityResult,
    assess_opportunity_quality,
)
from app.modules.stock_details.decision.constraints import (
    ConstraintResult,
    build_decision_constraints,
)
from app.modules.stock_details.decision.data_eligibility import (
    EligibilityResult,
    evaluate_data_eligibility,
)
from app.modules.stock_details.decision.evidence import (
    DataReliabilityResult,
    DirectionalEvidenceResult,
    EvidenceStrengthResult,
    compute_data_reliability,
    compute_directional_evidence,
    compute_evidence_strength,
    evidence_display_status,
)
from app.modules.stock_details.decision.market_regime import MarketRegimeResult
from app.modules.stock_details.decision.risk import TradingRiskResult, compute_trading_risk
from app.modules.stock_details.decision.scoring import (
    DecisionResult,
    OpportunityScoreResult,
    RiskScoreResult,
    compute_opportunity_score,
    compute_recommendation,
    compute_risk_score,
)
from app.modules.stock_details.decision.technical import TechnicalSnapshot, build_technical_snapshot
from app.modules.stock_details.decision.trade_plan import (
    LiquidityAnalysisResult,
    TradePlanResult,
    align_trade_plan_with_decision,
    compute_liquidity,
    compute_trade_plan,
    is_below_support,
    is_near_resistance,
)


@dataclass(frozen=True)
class TraderDecisionBundle:
    snapshot: TechnicalSnapshot
    liquidity: LiquidityAnalysisResult
    opportunity: OpportunityScoreResult
    risk: RiskScoreResult
    trade_plan: TradePlanResult
    decision: DecisionResult
    confidence: int
    is_stale: bool
    is_sparse: bool
    opportunity_quality: OpportunityQualityResult | None = None
    suspected_adjustment: bool = False
    eligibility: EligibilityResult | None = None
    data_reliability: DataReliabilityResult | None = None
    directional_evidence: DirectionalEvidenceResult | None = None
    evidence_strength: EvidenceStrengthResult | None = None
    trading_risk: TradingRiskResult | None = None
    constraint_result: ConstraintResult | None = None
    canonical_result: CanonicalDecisionResult | None = None


def compute_trader_decision_from_prices(
    prices: list[DailyPrice],
    *,
    category: str | None,
    reference_date: date | None = None,
    snapshot: TechnicalSnapshot | None = None,
    ex_dividend_dates: set[date] | None = None,
    known_corporate_action_dates: set[date] | None = None,
    exchange_session_dates: list[date] | tuple[date, ...] | None = None,
    is_active: bool = True,
    market_regime: MarketRegimeResult | str | None = None,
    stock_id: UUID | None = None,
    exchange: ExchangeCode = ExchangeCode.DSE,
) -> TraderDecisionBundle | None:
    if not prices:
        return None

    strategy_input = build_strategy_input_from_prices(
        prices,
        stock_id=stock_id,
        exchange=exchange,
        category=category,
        reference_date=reference_date,
        ex_dividend_dates=ex_dividend_dates,
        known_corporate_action_dates=known_corporate_action_dates,
        exchange_session_dates=exchange_session_dates,
        is_active=is_active,
        market_regime=market_regime,
    )
    return compute_trader_decision(strategy_input, snapshot=snapshot)


def compute_trader_decision(
    strategy_input: StrategyInput,
    *,
    snapshot: TechnicalSnapshot | None = None,
) -> TraderDecisionBundle | None:
    from app.core.enums import MarketDataState
    from app.core.constants.trading_constants import SUPPORTED_TRADING_STRATEGY_VERSIONS
    if strategy_input.strategy_version not in SUPPORTED_TRADING_STRATEGY_VERSIONS:
        raise ValueError(f"Unsupported trading engine version: {strategy_input.strategy_version}")
    legacy_policy = strategy_input.strategy_version == "trading-intelligence-v2"
    if strategy_input.finality != MarketDataState.FINALIZED:
        raise ValueError("Canonical engine rejects provisional sessions")
    sorted_prices = list(strategy_input.prices)

    decision_prices = sorted_prices[-DECISION_RECOMMENDATION_LOOKBACK:]
    resolved_snapshot = (
        snapshot if snapshot is not None else build_technical_snapshot(
            decision_prices, exchange_session_dates=strategy_input.exchange_session_dates,
            adjustment_coverage_verified=strategy_input.adjustment_coverage == "VERIFIED",
            legacy_volume_baseline=legacy_policy,
        )
    )
    if resolved_snapshot is None:
        return None

    eligibility = evaluate_data_eligibility(
        decision_prices,
        resolved_snapshot,
        category=strategy_input.category,
        is_active=strategy_input.is_active,
        exchange_session_dates=strategy_input.exchange_session_dates,
        event_coverage_status=strategy_input.event_coverage_status,
        known_corporate_action_dates=(
            set(strategy_input.known_corporate_action_dates)
            if strategy_input.known_corporate_action_dates
            else None
        ),
    )
    is_stale = eligibility.is_stale
    is_sparse = resolved_snapshot.ohlcv_row_count < DECISION_MIN_OHLCV_ROWS
    scoring_is_limited = is_sparse or not eligibility.allows_fresh_decision

    liquidity = compute_liquidity(resolved_snapshot)
    risk = compute_risk_score(
        resolved_snapshot,
        strategy_input.category,
        liquidity.label,
        is_stale=is_stale,
        is_sparse=scoring_is_limited,
    )
    trading_risk = compute_trading_risk(resolved_snapshot, strategy_input.category)
    opportunity = compute_opportunity_score(resolved_snapshot, risk.score, liquidity.label)
    data_reliability = compute_data_reliability(eligibility, resolved_snapshot)
    directional_evidence = compute_directional_evidence(resolved_snapshot)
    opportunity_quality = assess_opportunity_quality(
        resolved_snapshot,
        opportunity,
        directional_evidence,
    )
    trade_plan = compute_trade_plan(
        resolved_snapshot,
        opportunity_quality=opportunity_quality.quality,
        market_regime=strategy_input.market_regime,
    )
    suspected_adjustment = eligibility.corporate_action_status in {
        "KNOWN_UNADJUSTED",
        "UNRESOLVED_DISCONTINUITY",
    }
    near_resistance = is_near_resistance(resolved_snapshot)
    below_support = is_below_support(resolved_snapshot)
    constraint_result = build_decision_constraints(
        resolved_snapshot,
        trading_risk_label=trading_risk.label,
        liquidity_label=liquidity.label,
        trade_plan_status=trade_plan.status,
        eligibility_status=eligibility.status,
        eligibility_reasons=eligibility.reason_codes,
        is_stale=is_stale,
        is_sparse=is_sparse,
        suspected_adjustment=suspected_adjustment,
        below_support=below_support,
        near_resistance=near_resistance,
        market_regime=strategy_input.market_regime,
        entry_timing=trade_plan.entry_timing,
    )
    plan_blocker_codes = (
        trade_plan.reasons
        if trade_plan.status != TradePlanStatus.VALID_ENTRY_PLAN
        else ()
    )
    decision = compute_recommendation(
        resolved_snapshot,
        opportunity,
        risk,
        near_resistance=near_resistance,
        below_support=below_support,
        risk_reward=trade_plan.risk_reward_ratio,
        is_stale=is_stale,
        is_sparse=is_sparse,
        liquidity_label=liquidity.label,
        suspected_adjustment=suspected_adjustment,
        market_regime=strategy_input.market_regime,
        trade_plan_status=trade_plan.status,
        eligibility_status=eligibility.status,
        eligibility_reasons=eligibility.reason_codes,
        directional_evidence=directional_evidence,
        data_reliability=data_reliability,
        trading_risk=trading_risk,
        constraints=constraint_result,
        opportunity_quality=opportunity_quality.quality,
        entry_readiness=trade_plan.entry_readiness,
        entry_timing=trade_plan.entry_timing,
    )
    trade_plan = align_trade_plan_with_decision(
        trade_plan,
        decision.recommendation,
        is_stale=is_stale,
        is_sparse=scoring_is_limited,
    )
    evidence_strength = compute_evidence_strength(
        directional_evidence,
        decision.recommendation,
    )
    # Compatibility confidence is the same uncalibrated directional evidence
    # value. Data reliability and tradability are separate results.
    confidence = evidence_strength.score
    blocker_codes = tuple(
        dict.fromkeys(
            (
                *constraint_result.blocker_codes,
                *plan_blocker_codes,
            )
        )
    )
    canonical_result = build_canonical_decision_result(
        strategy_input,
        recommendation=decision.recommendation,
        evidence_strength=evidence_strength.score,
        evidence_status=evidence_display_status(eligibility, directional_evidence),
        opportunity_score=opportunity.score,
        opportunity_quality=opportunity_quality.quality,
        entry_readiness=trade_plan.entry_readiness,
        entry_timing=trade_plan.entry_timing,
        entry_condition=trade_plan.condition_text,
        blocker_codes=blocker_codes,
        risk_label=risk.label if legacy_policy else trading_risk.label,
        trade_plan_status=trade_plan.status,
        eligibility_status=eligibility.status,
        primary_reason=decision.primary_reason,
        primary_reason_code=decision.primary_reason_code,
        stance=decision.stance,
        non_holder_action=decision.non_holder_action,
        holder_action=decision.holder_action,
    )

    return TraderDecisionBundle(
        snapshot=resolved_snapshot,
        liquidity=liquidity,
        opportunity=opportunity,
        opportunity_quality=opportunity_quality,
        risk=risk,
        trade_plan=trade_plan,
        decision=decision,
        confidence=confidence,
        is_stale=is_stale,
        is_sparse=is_sparse,
        suspected_adjustment=suspected_adjustment,
        eligibility=eligibility,
        data_reliability=data_reliability,
        directional_evidence=directional_evidence,
        evidence_strength=evidence_strength,
        trading_risk=trading_risk,
        constraint_result=constraint_result,
        canonical_result=canonical_result,
    )
