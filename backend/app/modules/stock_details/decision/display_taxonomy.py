from __future__ import annotations

from dataclasses import dataclass

from app.core.constants.trading_constants import TRADING_ACTION_TAXONOMY
from app.core.enums import (
    DecisionDisplayAction,
    EntryReadiness,
    EntryTiming,
    HolderAction,
    OpportunityQuality,
    TradePlanStatus,
    TraderRecommendation,
)


@dataclass(frozen=True)
class DisplayDecisionResult:
    internal_action: TraderRecommendation
    display_action: DecisionDisplayAction
    entry_timing: EntryTiming | None
    entry_condition: str | None


def resolve_display_decision(
    internal_action: TraderRecommendation,
    *,
    opportunity_quality: OpportunityQuality,
    entry_readiness: EntryReadiness,
    entry_timing: EntryTiming | None,
    trade_plan_status: TradePlanStatus,
    entry_condition: str | None,
) -> DisplayDecisionResult:
    """Resolve the generic, non-holder v2 action without weakening safeguards."""
    normalized_condition = entry_condition.strip() if entry_condition else None
    valid_potential_buy = (
        internal_action == TraderRecommendation.BUY
        and opportunity_quality == OpportunityQuality.STRONG
        and entry_readiness in {EntryReadiness.READY, EntryReadiness.CONDITIONAL}
        and entry_timing is not None
        and trade_plan_status == TradePlanStatus.VALID_ENTRY_PLAN
        and normalized_condition is not None
    )
    if valid_potential_buy:
        return DisplayDecisionResult(
            internal_action=internal_action,
            display_action=DecisionDisplayAction.POTENTIAL_BUY,
            entry_timing=entry_timing,
            entry_condition=normalized_condition,
        )
    if internal_action == TraderRecommendation.SELL:
        return DisplayDecisionResult(
            internal_action=internal_action,
            display_action=DecisionDisplayAction.SELL,
            entry_timing=None,
            entry_condition=None,
        )

    # HOLD is holder guidance in the legacy result. Generic stock surfaces are
    # portfolio-neutral, so a non-holder sees WAIT until an entry is actionable.
    return DisplayDecisionResult(
        internal_action=internal_action,
        display_action=DecisionDisplayAction.WAIT,
        entry_timing=None,
        entry_condition=None,
    )


def resolve_versioned_internal_action(
    internal_action: TraderRecommendation,
    *,
    action_taxonomy: str,
) -> DecisionDisplayAction | None:
    """Map a persisted v2 internal action; fail closed for legacy taxonomies."""
    if action_taxonomy != TRADING_ACTION_TAXONOMY:
        return None
    if internal_action == TraderRecommendation.BUY:
        return DecisionDisplayAction.POTENTIAL_BUY
    if internal_action == TraderRecommendation.SELL:
        return DecisionDisplayAction.SELL
    return DecisionDisplayAction.WAIT


def resolve_holder_display_action(holder_action: HolderAction) -> DecisionDisplayAction:
    if holder_action in {HolderAction.SELL, HolderAction.REDUCE}:
        return DecisionDisplayAction.SELL
    if holder_action == HolderAction.HOLD:
        return DecisionDisplayAction.HOLD
    return DecisionDisplayAction.WAIT
