from __future__ import annotations

from app.core.audit_hashing import stable_audit_hash
from app.modules.market_universe.market_universe_schemas import ScoredUniverseRow


def compute_universe_payload_revision(rows: list[ScoredUniverseRow]) -> str:
    """Hash the compact cache contract without relying on input ordering."""

    return stable_audit_hash([
        row.model_dump(mode="json")
        for row in sorted(rows, key=lambda row: (row.stock.symbol.casefold(), str(row.stock.id)))
    ])
