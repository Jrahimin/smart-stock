from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

FUNDAMENTALS_PERFORMANCE_METRIC_CODES: tuple[str, ...] = (
    "EPS",
    "NAV_PER_SHARE",
    "REVENUE",
    "NET_PROFIT_AFTER_TAX",
)

METRIC_DISPLAY_LABELS: dict[str, str] = {
    "EPS": "EPS",
    "NAV_PER_SHARE": "NAV",
    "REVENUE": "Revenue",
    "NET_PROFIT_AFTER_TAX": "Net Profit",
}


@dataclass(frozen=True)
class LatestFinancialMetricRow:
    metric_code: str
    display_name: str
    value: Decimal
    as_of_date: date
    fiscal_year: int


@dataclass(frozen=True)
class FinancialMetricSnapshotResult:
    metric_code: str
    label: str
    value: float | None
    as_of_date: str | None
    fiscal_year: int | None


@dataclass(frozen=True)
class FundamentalsSnapshotResult:
    metrics: list[FinancialMetricSnapshotResult]
    latest_fiscal_year: int | None
    latest_as_of_date: str | None


def _to_float(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


def build_fundamentals_snapshot(rows: list[LatestFinancialMetricRow]) -> FundamentalsSnapshotResult:
    latest_by_code: dict[str, LatestFinancialMetricRow] = {}
    for row in rows:
        if row.metric_code not in latest_by_code:
            latest_by_code[row.metric_code] = row

    metrics: list[FinancialMetricSnapshotResult] = []
    latest_as_of: date | None = None
    latest_fiscal_year: int | None = None

    for metric_code in FUNDAMENTALS_PERFORMANCE_METRIC_CODES:
        row = latest_by_code.get(metric_code)
        if row is None:
            continue

        value = _to_float(row.value)
        if value is not None and value == 0:
            value = None

        metrics.append(
            FinancialMetricSnapshotResult(
                metric_code=metric_code,
                label=METRIC_DISPLAY_LABELS.get(metric_code, row.display_name),
                value=value,
                as_of_date=row.as_of_date.isoformat(),
                fiscal_year=row.fiscal_year,
            )
        )

        if latest_as_of is None or row.as_of_date > latest_as_of:
            latest_as_of = row.as_of_date
            latest_fiscal_year = row.fiscal_year
        elif row.as_of_date == latest_as_of and latest_fiscal_year is not None and row.fiscal_year > latest_fiscal_year:
            latest_fiscal_year = row.fiscal_year

    return FundamentalsSnapshotResult(
        metrics=metrics,
        latest_fiscal_year=latest_fiscal_year,
        latest_as_of_date=latest_as_of.isoformat() if latest_as_of else None,
    )
