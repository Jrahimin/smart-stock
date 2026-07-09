from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

# Display / trend codes emitted on the workspace snapshot.
FUNDAMENTALS_PERFORMANCE_METRIC_CODES: tuple[str, ...] = (
    "EPS",
    "NAV_PER_SHARE",
    "REVENUE",
    "NET_PROFIT_AFTER_TAX",
)

# AmarStock snapshot stores quarterly EPS under Q*_EPS; include them when loading
# so the snapshot builder can resolve the freshest EPS into the EPS slot.
EPS_CANDIDATE_METRIC_CODES: tuple[str, ...] = (
    "EPS",
    "Q1_EPS",
    "Q2_EPS",
    "Q3_EPS",
    "Q4_EPS",
)

FUNDAMENTALS_SNAPSHOT_QUERY_METRIC_CODES: tuple[str, ...] = (
    *EPS_CANDIDATE_METRIC_CODES,
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

# Lower rank wins when as_of_date ties (prefer later quarters over annual).
_EPS_SOURCE_RANK: dict[str, int] = {
    "Q4_EPS": 0,
    "Q3_EPS": 1,
    "Q2_EPS": 2,
    "Q1_EPS": 3,
    "EPS": 4,
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


def _pick_preferred_eps(candidates: list[LatestFinancialMetricRow]) -> LatestFinancialMetricRow | None:
    if not candidates:
        return None

    return min(
        candidates,
        key=lambda row: (
            -row.as_of_date.toordinal(),
            _EPS_SOURCE_RANK.get(row.metric_code, 99),
            -row.fiscal_year,
        ),
    )


def build_fundamentals_snapshot(rows: list[LatestFinancialMetricRow]) -> FundamentalsSnapshotResult:
    latest_by_code: dict[str, LatestFinancialMetricRow] = {}
    for row in rows:
        if row.metric_code not in latest_by_code:
            latest_by_code[row.metric_code] = row

    eps_candidates = [
        latest_by_code[code] for code in EPS_CANDIDATE_METRIC_CODES if code in latest_by_code
    ]
    resolved_eps = _pick_preferred_eps(eps_candidates)

    metrics: list[FinancialMetricSnapshotResult] = []
    latest_as_of: date | None = None
    latest_fiscal_year: int | None = None

    for metric_code in FUNDAMENTALS_PERFORMANCE_METRIC_CODES:
        if metric_code == "EPS":
            row = resolved_eps
        else:
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
