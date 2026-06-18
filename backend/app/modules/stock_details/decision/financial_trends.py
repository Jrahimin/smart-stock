from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.modules.stock_details.decision.fundamentals_snapshot import (
    FUNDAMENTALS_PERFORMANCE_METRIC_CODES,
    METRIC_DISPLAY_LABELS,
)

CoverageStatus = str  # "full" | "partial" | "none"
TrendDirection = str  # "improving" | "deteriorating" | "flat"


@dataclass(frozen=True)
class FinancialMetricHistoryRow:
    metric_code: str
    display_name: str
    value: Decimal
    fiscal_year: int


@dataclass(frozen=True)
class FinancialTrendPointResult:
    fiscal_year: int
    value: float


@dataclass(frozen=True)
class FinancialTrendResult:
    metric_code: str
    label: str
    latest_value: float | None
    points: list[FinancialTrendPointResult]
    coverage_status: CoverageStatus
    direction: TrendDirection | None


def _to_float(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    parsed = float(value)
    if parsed == 0:
        return None
    return parsed


def _resolve_coverage_status(point_count: int) -> CoverageStatus:
    if point_count >= 3:
        return "full"
    if point_count >= 1:
        return "partial"
    return "none"


def _resolve_direction(points: list[FinancialTrendPointResult]) -> TrendDirection | None:
    if len(points) < 3:
        return None
    newest = points[0].value
    oldest = points[-1].value
    if oldest == 0:
        return "improving" if newest > 0 else "flat"
    delta_ratio = (newest - oldest) / abs(oldest)
    if delta_ratio >= 0.05:
        return "improving"
    if delta_ratio <= -0.05:
        return "deteriorating"
    return "flat"


def build_financial_trends(
    histories: dict[str, list[FinancialMetricHistoryRow]],
) -> list[FinancialTrendResult]:
    trends: list[FinancialTrendResult] = []

    for metric_code in FUNDAMENTALS_PERFORMANCE_METRIC_CODES:
        rows = histories.get(metric_code, [])
        points: list[FinancialTrendPointResult] = []
        seen_years: set[int] = set()
        for row in rows:
            if row.fiscal_year in seen_years:
                continue
            value = _to_float(row.value)
            if value is None:
                continue
            seen_years.add(row.fiscal_year)
            points.append(FinancialTrendPointResult(fiscal_year=row.fiscal_year, value=value))
            if len(points) >= 5:
                break

        coverage_status = _resolve_coverage_status(len(points))
        latest_value = points[0].value if points else None
        label = METRIC_DISPLAY_LABELS.get(metric_code, metric_code)
        direction = _resolve_direction(points) if coverage_status == "full" else None

        trends.append(
            FinancialTrendResult(
                metric_code=metric_code,
                label=label,
                latest_value=latest_value,
                points=points,
                coverage_status=coverage_status,
                direction=direction,
            )
        )

    return trends
