from __future__ import annotations

from app.core.audit_hashing import stable_audit_hash
from app.modules.market_universe.market_universe_schemas import ScoredUniverseRow


def compute_universe_payload_revision(rows: list[ScoredUniverseRow]) -> str:
    """Hash the compact cache contract without relying on input ordering."""

    identities = []
    for row in rows:
        canonical = row.decision.canonical if row.decision is not None else None
        identities.append(
            {
                "stock_id": row.stock.id,
                "latest_trade_date": row.session.latest_trade_date,
                "session_updated_at": row.session.updated_at,
                "shared_decision_id": canonical.shared_decision_id if canonical else None,
                "input_hash": canonical.input_hash if canonical else None,
                "recommendation": canonical.recommendation if canonical else None,
                "internal_action": canonical.internal_action if canonical else None,
                "display_action": canonical.display_action if canonical else None,
                "decision_taxonomy_version": (
                    canonical.decision_taxonomy_version if canonical else None
                ),
                "entry_timing": canonical.entry_timing if canonical else None,
                "eligibility_status": canonical.eligibility_status if canonical else None,
            }
        )
    return stable_audit_hash(
        sorted(identities, key=lambda item: (str(item["stock_id"]), str(item["latest_trade_date"])))
    )
