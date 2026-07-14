from __future__ import annotations

from app.core.constants.trading_constants import (
    DIRECTIONAL_EVIDENCE_ACTION_MIN,
    DIRECTIONAL_EVIDENCE_CONSTRUCTIVE_MIN,
)
from app.core.enums import (
    DecisionConstraintKind,
    EligibilityStatus,
    EvidenceDirection,
    HolderAction,
    LiquidityLabel,
    NonHolderAction,
    TradePlanStatus,
    TraderRecommendation,
    TraderStance,
    TrendDirection,
)
from app.modules.stock_details.decision.constraints import (
    ConstraintResult,
    build_decision_constraints,
)
from app.modules.stock_details.decision.evidence import (
    DataReliabilityResult,
    DirectionalEvidenceResult,
    compute_directional_evidence,
    compute_evidence_strength,
    data_reliability_from_flags,
)
from app.modules.stock_details.decision.risk import TradingRiskResult
from app.modules.stock_details.decision.scoring import (
    DecisionResult,
    OpportunityScoreResult,
    RiskScoreResult,
)
from app.modules.stock_details.decision.technical import TechnicalSnapshot

_DATA_BLOCK_CODES = {"data_eligibility", "corporate_action_review"}
_FRESH_ENTRY_BLOCK_CODES = {"elevated_trading_risk", "illiquid"}


def _has_kind(constraints: ConstraintResult, kind: DecisionConstraintKind) -> bool:
    return any(constraint.kind == kind for constraint in constraints.constraints)


def compute_recommendation(
    snapshot: TechnicalSnapshot,
    opportunity: OpportunityScoreResult,
    risk: RiskScoreResult,
    *,
    near_resistance: bool,
    below_support: bool,
    risk_reward: float | None,
    is_stale: bool,
    is_sparse: bool,
    liquidity_label: LiquidityLabel | None = None,
    suspected_adjustment: bool = False,
    market_regime: str | None = None,
    trade_plan_status: TradePlanStatus | None = None,
    eligibility_status: EligibilityStatus | None = None,
    eligibility_reasons: tuple[str, ...] = (),
    directional_evidence: DirectionalEvidenceResult | None = None,
    data_reliability: DataReliabilityResult | None = None,
    trading_risk: TradingRiskResult | None = None,
    constraints: ConstraintResult | None = None,
) -> DecisionResult:
    """Apply one explicit portfolio-neutral stance and contextual action matrix."""
    evidence = directional_evidence or compute_directional_evidence(snapshot)
    reliability = data_reliability or data_reliability_from_flags(
        is_stale=is_stale,
        is_sparse=is_sparse,
    )
    canonical_risk_label = trading_risk.label if trading_risk is not None else risk.label
    resolved_constraints = constraints or build_decision_constraints(
        snapshot,
        trading_risk_label=canonical_risk_label,
        liquidity_label=liquidity_label,
        trade_plan_status=trade_plan_status,
        eligibility_status=eligibility_status,
        eligibility_reasons=eligibility_reasons,
        is_stale=is_stale,
        is_sparse=is_sparse,
        suspected_adjustment=suspected_adjustment,
        below_support=below_support,
        near_resistance=near_resistance,
        market_regime=market_regime,
    )

    reasoning = [
        f"Trend context: {snapshot.trend.value.lower()}.",
        (
            "Directional evidence: "
            f"{evidence.direction.value.lower()} "
            f"(bullish {evidence.bullish_score}, bearish {evidence.bearish_score})."
        ),
        f"Opportunity compatibility score: {opportunity.score}/100.",
        f"Trading risk: {canonical_risk_label.value}.",
        f"Data reliability: {reliability.label.value} ({reliability.score}/100).",
    ]

    data_blocked = resolved_constraints.has_code(*_DATA_BLOCK_CODES)
    exit_or_avoid = resolved_constraints.requires_exit_or_avoid
    entry_risk_blocked = resolved_constraints.has_code(*_FRESH_ENTRY_BLOCK_CODES)
    plan_blocked = resolved_constraints.has_code("entry_plan_not_valid")
    downgraded = _has_kind(resolved_constraints, DecisionConstraintKind.DOWNGRADE)
    bullish_setup = (
        evidence.direction == EvidenceDirection.BULLISH
        and evidence.bullish_score >= DIRECTIONAL_EVIDENCE_ACTION_MIN
        and snapshot.trend == TrendDirection.UPTREND
    )
    constructive_setup = (
        snapshot.trend == TrendDirection.UPTREND
        and evidence.bullish_score >= DIRECTIONAL_EVIDENCE_CONSTRUCTIVE_MIN
    )
    bearish_setup = (
        evidence.direction == EvidenceDirection.BEARISH
        and evidence.bearish_score >= DIRECTIONAL_EVIDENCE_ACTION_MIN
        and snapshot.trend == TrendDirection.DOWNTREND
    )

    if data_blocked:
        recommendation = TraderRecommendation.WAIT
        stance = TraderStance.UNAVAILABLE
        non_holder_action = NonHolderAction.WAIT
        holder_action = HolderAction.REVIEW
        primary_reason_code = "data_not_eligible"
        primary_reason = (
            "Data is not eligible for a fresh directional decision; wait for review or refresh."
        )
    elif exit_or_avoid:
        recommendation = TraderRecommendation.SELL
        stance = TraderStance.BEARISH
        non_holder_action = NonHolderAction.AVOID
        holder_action = HolderAction.SELL
        primary_reason_code = "support_break"
        primary_reason = "Price has failed recent support on eligible data."
    elif bearish_setup:
        recommendation = TraderRecommendation.SELL
        stance = TraderStance.BEARISH
        non_holder_action = NonHolderAction.AVOID
        holder_action = HolderAction.SELL
        primary_reason_code = "bearish_directional_evidence"
        primary_reason = "Reliable bearish trend and momentum evidence supports exit or avoidance."
    elif entry_risk_blocked:
        recommendation = TraderRecommendation.WAIT
        stance = TraderStance.NEUTRAL
        non_holder_action = NonHolderAction.AVOID
        holder_action = HolderAction.REVIEW
        primary_reason_code = "fresh_entry_risk_block"
        primary_reason = (
            f"Trading risk is {canonical_risk_label.value} or tradability is inadequate; "
            "wait rather than forcing a fresh entry."
        )
    elif bullish_setup and plan_blocked:
        recommendation = TraderRecommendation.HOLD
        stance = TraderStance.CONSTRUCTIVE
        non_holder_action = NonHolderAction.WAIT
        holder_action = HolderAction.HOLD
        primary_reason_code = "entry_plan_not_valid"
        primary_reason = (
            "A valid entry plan is unavailable; hold existing positions rather than buy."
        )
    elif bullish_setup and downgraded:
        recommendation = TraderRecommendation.HOLD
        stance = TraderStance.CONSTRUCTIVE
        non_holder_action = NonHolderAction.WAIT
        holder_action = HolderAction.HOLD
        if resolved_constraints.has_code("bearish_market_regime"):
            primary_reason_code = "bearish_market_regime"
            primary_reason = (
                "Broad market regime is bearish; hold rather than open new long exposure."
            )
        elif resolved_constraints.has_code("near_resistance"):
            primary_reason_code = "near_resistance"
            primary_reason = (
                "The setup is constructive near resistance; wait for a confirmed price break."
            )
        elif resolved_constraints.has_code("extended_momentum"):
            primary_reason_code = "extended_momentum"
            primary_reason = (
                "Momentum is extended; holders may hold while non-holders wait for a better entry."
            )
        elif resolved_constraints.has_code("lower_structure"):
            primary_reason_code = "lower_structure"
            primary_reason = (
                "Lower market structure conflicts with a fresh buy; hold rather than add exposure."
            )
        else:
            primary_reason_code = "bullish_setup_downgraded"
            primary_reason = (
                "The bullish setup is constructive, but an authoritative constraint "
                "blocks a fresh entry."
            )
    elif bullish_setup and trade_plan_status == TradePlanStatus.VALID_ENTRY_PLAN:
        recommendation = TraderRecommendation.BUY
        stance = TraderStance.BULLISH
        non_holder_action = NonHolderAction.BUY
        holder_action = HolderAction.HOLD
        primary_reason_code = "bullish_setup_valid_entry"
        primary_reason = "Uptrend and directional evidence align with a valid entry plan."
    elif constructive_setup:
        recommendation = TraderRecommendation.HOLD
        stance = TraderStance.CONSTRUCTIVE
        non_holder_action = NonHolderAction.WAIT
        holder_action = HolderAction.HOLD
        primary_reason_code = "constructive_watch"
        primary_reason = "Structure remains constructive; holders may hold while non-holders wait."
    else:
        recommendation = TraderRecommendation.WAIT
        stance = TraderStance.NEUTRAL
        non_holder_action = NonHolderAction.WAIT
        holder_action = HolderAction.HOLD
        primary_reason_code = "no_directional_edge"
        primary_reason = "No strong directional edge is present; patience is preferred."

    reasoning.append(primary_reason)
    reasoning.extend(
        f"Constraint [{constraint.kind.value}]: {constraint.reason}"
        for constraint in resolved_constraints.constraints
    )
    evidence_strength = compute_evidence_strength(evidence, recommendation)
    return DecisionResult(
        recommendation=recommendation,
        confidence=evidence_strength.score,
        reasoning=reasoning,
        evidence_strength=evidence_strength.score,
        primary_reason=primary_reason,
        primary_reason_code=primary_reason_code,
        stance=stance,
        non_holder_action=non_holder_action,
        holder_action=holder_action,
        constraints=resolved_constraints.constraints,
    )
