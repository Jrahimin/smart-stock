from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from app.core.audit_hashing import stable_audit_hash

PULSE_HISTORY_MIN_ELIGIBLE_CANDIDATES = 20
PULSE_HISTORY_TREND_DELTA = 3


@dataclass(frozen=True)
class PulseOpportunityAggregate:
    score: int
    eligible_population_fingerprint: str


def compute_pulse_opportunity_aggregate(rows: Iterable[object]) -> PulseOpportunityAggregate:
    """Calculate the aggregate attention score and its deterministic eligible lineage."""

    normalized = list(rows)
    scores = [int(getattr(getattr(row, "score"), "total")) for row in normalized]
    score = int(round(sum(scores) / len(scores))) if scores else 50
    identities: list[dict[str, object]] = []
    for row in normalized:
        decision = getattr(row, "decision", None)
        canonical = getattr(decision, "canonical", None)
        stock = getattr(row, "stock")
        snapshot = getattr(row, "snapshot", None)
        identities.append(
            {
                "stock_id": getattr(stock, "id", None),
                "shared_decision_id": getattr(canonical, "shared_decision_id", None),
                "input_hash": getattr(canonical, "input_hash", None),
                "latest_trade_date": getattr(snapshot, "latest_trade_date", None),
                "pulse_score": int(getattr(getattr(row, "score"), "total")),
            }
        )
    return PulseOpportunityAggregate(
        score=score,
        eligible_population_fingerprint=stable_audit_hash(
            sorted(identities, key=lambda item: str(item["stock_id"]))
        ),
    )


def pulse_history_trend_label(current: int, previous: int) -> str:
    delta = current - previous
    if delta >= PULSE_HISTORY_TREND_DELTA:
        return "Improving"
    if delta <= -PULSE_HISTORY_TREND_DELTA:
        return "Weakening"
    return "Stable"
