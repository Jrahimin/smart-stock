"""Display-only facts from one canonical stock row and its decision generation."""
from pydantic import BaseModel, Field


class MeasuredDecisionFactsRead(BaseModel):
    entry_timing: str | None = Field(default=None, exclude_if=lambda value: value is None)
    confirmation_rule: str | None = Field(default=None, exclude_if=lambda value: value is None)
    rsi: float | None = None
    trend: str | None = None
    opportunity_score: int | None = None
    trigger_price: float | None = None
    resistance: float | None = None
    volume_ratio: float | None = None
    volume_baseline: str = "PRIOR_20_SESSION_MEDIAN"
    volume_sample_count: int = 0


def build_measured_facts(row) -> MeasuredDecisionFactsRead:
    technical = row.technical_snapshot
    plan = row.analysis.trade_plan if row.analysis else None
    # The existing technical baseline is the median of positive traded volumes
    # in the preceding 20 sessions, excluding the assessed session.
    baseline = technical.average_volume
    return MeasuredDecisionFactsRead(
        entry_timing=(plan.entry_timing or plan.scenario_entry_timing) if plan else None,
        confirmation_rule=plan.confirmation_rule if plan else None,
        rsi=technical.rsi, trend=technical.trend,
        opportunity_score=row.decision.opportunity_score if row.decision else None,
        trigger_price=plan.trigger_price if plan else None, resistance=technical.resistance,
        volume_ratio=technical.volume / baseline if baseline and baseline > 0 else None,
        volume_sample_count=technical.volume_observation_count,
    )
