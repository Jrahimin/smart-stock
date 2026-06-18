from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.models import ShareholdingSnapshot
from app.modules.stock_details.decision.ownership_trends import OwnershipTrendResult, build_ownership_trends


def _to_float(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


@dataclass(frozen=True)
class OwnershipInsightResult:
    sponsor_percent: float | None
    institution_percent: float | None
    foreign_percent: float | None
    public_percent: float | None
    free_float_percent: float | None
    interpretations: list[str]
    snapshot_date: str | None
    source: str | None
    trends: list[OwnershipTrendResult]


def build_ownership_insights(snapshot: ShareholdingSnapshot | None) -> OwnershipInsightResult | None:
    if snapshot is None:
        return None
    sponsor = _to_float(snapshot.sponsor_director_percent)
    institution = _to_float(snapshot.institution_percent)
    foreign = _to_float(snapshot.foreign_percent)
    public = _to_float(snapshot.public_percent)
    free_float = _to_float(snapshot.free_float_percent)
    interpretations: list[str] = []
    if sponsor is not None and sponsor >= 50:
        interpretations.append("Strong sponsor ownership.")
    if free_float is not None and free_float < 20:
        interpretations.append("Low free float may increase volatility.")
    elif free_float is not None and free_float >= 35:
        interpretations.append("Free float is healthy for tradable liquidity.")
    if institution is not None and institution >= 10:
        interpretations.append("Institutional participation is meaningful.")
    elif institution is not None and institution < 3:
        interpretations.append("Institutional participation is limited.")
    if foreign is not None and foreign >= 5:
        interpretations.append("Foreign ownership adds external investor interest.")
    if not interpretations:
        interpretations.append("Ownership mix is balanced without extreme concentration flags.")
    return OwnershipInsightResult(
        sponsor_percent=sponsor,
        institution_percent=institution,
        foreign_percent=foreign,
        public_percent=public,
        free_float_percent=free_float,
        interpretations=interpretations,
        snapshot_date=snapshot.snapshot_date.isoformat(),
        source=snapshot.source,
        trends=build_ownership_trends(snapshot),
    )
