from __future__ import annotations

from app.core.enums import DecisionDisplayAction
from app.modules.stock_details.decision.engine import TraderDecisionBundle
from app.modules.stock_details.stock_details_schemas import (
    DataReliabilityRead,
    DecisionConstraintRead,
    ScoreComponentRead,
    TraderDecisionSummaryRead,
    TradingRiskRead,
    canonical_decision_to_read,
)


def build_trader_decision_summary(bundle: TraderDecisionBundle) -> TraderDecisionSummaryRead:
    data_reliability = bundle.data_reliability
    trading_risk = bundle.trading_risk
    canonical = bundle.canonical_result
    return TraderDecisionSummaryRead(
        recommendation=bundle.decision.recommendation,
        internal_action=(canonical.internal_action if canonical else bundle.decision.recommendation),
        display_action=(canonical.display_action if canonical else DecisionDisplayAction.WAIT),
        decision_taxonomy_version=(canonical.decision_taxonomy_version if canonical else "v1"),
        confidence=bundle.decision.confidence,
        reason=bundle.decision.primary_reason,
        opportunity_score=bundle.opportunity.score,
        risk_label=bundle.risk.label,
        evidence_strength=bundle.decision.evidence_strength,
        primary_reason=bundle.decision.primary_reason,
        primary_reason_code=bundle.decision.primary_reason_code,
        stance=bundle.decision.stance,
        non_holder_action=bundle.decision.non_holder_action,
        holder_action=bundle.decision.holder_action,
        data_reliability=(
            DataReliabilityRead(
                score=data_reliability.score,
                label=data_reliability.label,
                reason_codes=list(data_reliability.reason_codes),
                explanation=data_reliability.explanation,
            )
            if data_reliability is not None
            else None
        ),
        trading_risk=(
            TradingRiskRead(
                score=trading_risk.score,
                label=trading_risk.label,
                components=[
                    ScoreComponentRead(
                        key=component.key,
                        label=component.label,
                        score=component.score,
                        weight=component.weight,
                        explanation=component.explanation,
                    )
                    for component in trading_risk.components
                ],
            )
            if trading_risk is not None
            else None
        ),
        constraints=[
            DecisionConstraintRead(
                code=constraint.code,
                title=constraint.title,
                kind=constraint.kind,
                reason=constraint.reason,
                is_critical=constraint.is_critical,
            )
            for constraint in bundle.decision.constraints
        ],
        opportunity_quality=(
            bundle.opportunity_quality.quality
            if bundle.opportunity_quality is not None
            else None
        ),
        entry_readiness=bundle.trade_plan.entry_readiness,
        entry_timing=bundle.trade_plan.entry_timing,
        entry_condition=(canonical.entry_condition if canonical else None),
        blocker_codes=(
            list(bundle.canonical_result.blocker_codes)
            if bundle.canonical_result is not None
            else []
        ),
        canonical=(
            canonical_decision_to_read(bundle.canonical_result)
            if bundle.canonical_result is not None
            else None
        ),
    )
