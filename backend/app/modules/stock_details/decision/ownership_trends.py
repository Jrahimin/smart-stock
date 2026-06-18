from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from app.models import ShareholdingSnapshot

CoverageStatus = str  # "full" | "partial" | "none"
OwnershipDirection = str  # "accumulation" | "distribution" | "stable"

SEGMENT_DEFINITIONS: tuple[tuple[str, str, str], ...] = (
    ("sponsor", "Sponsor", "sponsor_director_percent"),
    ("institution", "Institution", "institution_percent"),
    ("foreign", "Foreign", "foreign_percent"),
    ("public", "Public", "public_percent"),
)

AMARSTOCK_FIELD_TO_SEGMENT: dict[str, str] = {
    "SponsorDirector": "sponsor_director_percent",
    "Govt": "government_percent",
    "Institute": "institution_percent",
    "Foreign": "foreign_percent",
    "Public": "public_percent",
    "freefloat": "free_float_percent",
}


@dataclass(frozen=True)
class OwnershipTrendPointResult:
    snapshot_label: str | None
    value: float


@dataclass(frozen=True)
class OwnershipTrendResult:
    segment_key: str
    label: str
    points: list[OwnershipTrendPointResult]
    coverage_status: CoverageStatus
    direction: OwnershipDirection | None


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed < 0:
        return None
    return parsed


def _resolve_coverage_status(point_count: int) -> CoverageStatus:
    if point_count >= 4:
        return "full"
    if point_count >= 1:
        return "partial"
    return "none"


def _resolve_direction(points: list[OwnershipTrendPointResult]) -> OwnershipDirection | None:
    if len(points) < 4:
        return None
    newest = points[0].value
    oldest = points[-1].value
    delta = newest - oldest
    if delta >= 1.5:
        return "accumulation"
    if delta <= -1.5:
        return "distribution"
    return "stable"


def _normalize_history_entry(entry: dict[str, Any]) -> dict[str, float | None]:
    normalized: dict[str, float | None] = {}
    for source_field, target_field in AMARSTOCK_FIELD_TO_SEGMENT.items():
        if source_field in entry:
            normalized[target_field] = _to_float(entry.get(source_field))
        elif target_field in entry:
            normalized[target_field] = _to_float(entry.get(target_field))
    return normalized


def _history_entries(snapshot: ShareholdingSnapshot) -> list[dict[str, Any]]:
    metadata = snapshot.metadata_json or {}
    indexed_history = metadata.get("indexed_history")
    if not isinstance(indexed_history, list):
        return []

    entries: list[dict[str, Any]] = []
    for item in indexed_history:
        if isinstance(item, dict):
            entries.append(item)
    return entries


def build_ownership_trends(snapshot: ShareholdingSnapshot | None) -> list[OwnershipTrendResult]:
    if snapshot is None:
        return []

    history = _history_entries(snapshot)
    trends: list[OwnershipTrendResult] = []

    for segment_key, label, field_name in SEGMENT_DEFINITIONS:
        points: list[OwnershipTrendPointResult] = []
        for entry in history:
            normalized = _normalize_history_entry(entry)
            value = normalized.get(field_name)
            if value is None:
                continue
            snapshot_label = entry.get("snapshot_label")
            label_text = str(snapshot_label).strip() if snapshot_label else None
            points.append(OwnershipTrendPointResult(snapshot_label=label_text, value=value))

        coverage_status = _resolve_coverage_status(len(points))
        direction = _resolve_direction(points) if coverage_status == "full" else None
        trends.append(
            OwnershipTrendResult(
                segment_key=segment_key,
                label=label,
                points=points,
                coverage_status=coverage_status,
                direction=direction,
            )
        )

    return trends
