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


def selected_explanation_fields(decision, opportunity):
    """The existing summary selection, also projected for older immutable rows."""
    priority = {"EXIT_AVOID": 0, "BLOCK": 1, "DOWNGRADE": 2, "CAUTION": 3}
    opposing = sorted((item for item in decision.constraints if item.code != decision.primary_reason_code),
        key=lambda item: priority.get(getattr(item.kind, "value", item.kind), 4))
    strongest = max(opportunity.components, key=lambda item: item.score * item.weight) if opportunity.components else None
    weakest = min(opportunity.components, key=lambda item: item.score) if opportunity.components else None
    return dict(measured_support_component=ScoreComponentRead.model_validate(strongest, from_attributes=True) if strongest else None,
        opposing_constraint_code=opposing[0].code if opposing else None,
        opposing_component=ScoreComponentRead.model_validate(weakest, from_attributes=True) if not opposing and weakest else None)


def build_trader_decision_summary(bundle: TraderDecisionBundle) -> TraderDecisionSummaryRead:
    data_reliability = bundle.data_reliability
    trading_risk = bundle.trading_risk
    canonical = bundle.canonical_result
    priority = {"EXIT_AVOID": 0, "BLOCK": 1, "DOWNGRADE": 2, "CAUTION": 3}
    opposing = sorted((item for item in bundle.decision.constraints if item.code != bundle.decision.primary_reason_code),
        key=lambda item: priority.get(item.kind.value, 4))
    strongest = max(bundle.opportunity.components, key=lambda item: item.score * item.weight) if bundle.opportunity.components else None
    weakest = min(bundle.opportunity.components, key=lambda item: item.score) if bundle.opportunity.components else None
    counterargument = next((item.reason for item in opposing), None)
    if counterargument is None:
        counterargument = (f"Weakest setup factor: {weakest.label}. {weakest.explanation}"
                           if weakest else "No additional opposing constraint identified.")
        if bundle.data_reliability and bundle.data_reliability.score < 100:
            counterargument += " Input limitations: " + ", ".join(bundle.data_reliability.reason_codes) + "."
    return TraderDecisionSummaryRead(
        recommendation=bundle.decision.recommendation,
        internal_action=(canonical.internal_action if canonical else bundle.decision.recommendation),
        display_action=(canonical.display_action if canonical else DecisionDisplayAction.WAIT),
        decision_taxonomy_version=(canonical.decision_taxonomy_version if canonical else "v1"),
        confidence=bundle.decision.confidence,
        reason=bundle.decision.primary_reason,
        measured_support=f"{strongest.explanation} ({strongest.score * strongest.weight:.1f} contribution points)." if strongest else None,
        opposing_constraint=counterargument,
        **selected_explanation_fields(bundle.decision, bundle.opportunity),
        opportunity_score=bundle.opportunity.score,
        risk_label=canonical.risk_label if canonical else (trading_risk.label if trading_risk else bundle.risk.label),
        legacy_composite_risk_label=bundle.risk.label,
        evidence_strength=bundle.decision.evidence_strength,
        evidence_status=canonical.evidence_status if canonical else "UNAVAILABLE",
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
