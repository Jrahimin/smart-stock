from __future__ import annotations

from dataclasses import dataclass

from app.core.constants.trading_constants import (
    RECOMMENDATION_BUY_OPPORTUNITY_MIN,
    RECOMMENDATION_HOLD_OPPORTUNITY_MIN,
)
from app.core.enums import (
    EntryReadiness,
    EntryTiming,
    EvidenceDirection,
    OpportunityQuality,
    TradePlanStatus,
    TrendDirection,
)
from app.modules.stock_details.decision.evidence import DirectionalEvidenceResult
from app.modules.stock_details.decision.scoring import OpportunityScoreResult
from app.modules.stock_details.decision.technical import TechnicalSnapshot


@dataclass(frozen=True)
class OpportunityQualityResult:
    quality: OpportunityQuality
    score: int
    explanation: str


def assess_opportunity_quality(
    snapshot: TechnicalSnapshot,
    opportunity: OpportunityScoreResult,
    evidence: DirectionalEvidenceResult,
) -> OpportunityQualityResult:
    strong = (
        opportunity.score >= RECOMMENDATION_BUY_OPPORTUNITY_MIN
        and evidence.direction == EvidenceDirection.BULLISH
        and snapshot.trend == TrendDirection.UPTREND
    )
    if strong:
        return OpportunityQualityResult(
            quality=OpportunityQuality.STRONG,
            score=opportunity.score,
            explanation="Completed-session trend, evidence, and opportunity score are strong.",
        )

    constructive = (
        opportunity.score >= RECOMMENDATION_HOLD_OPPORTUNITY_MIN
        and snapshot.trend == TrendDirection.UPTREND
    )
    if constructive:
        return OpportunityQualityResult(
            quality=OpportunityQuality.CONSTRUCTIVE,
            score=opportunity.score,
            explanation=(
                "The setup is constructive but does not meet every strong-opportunity rule."
            ),
        )
    return OpportunityQualityResult(
        quality=OpportunityQuality.WEAK,
        score=opportunity.score,
        explanation="Completed-session evidence does not support a strong long opportunity.",
    )


def resolve_entry_readiness(
    status: TradePlanStatus,
    timing: EntryTiming | None,
) -> EntryReadiness:
    if status != TradePlanStatus.VALID_ENTRY_PLAN or timing is None:
        return EntryReadiness.NOT_READY
    if timing == EntryTiming.READY:
        return EntryReadiness.READY
    return EntryReadiness.CONDITIONAL
