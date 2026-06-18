from datetime import date
from decimal import Decimal

from app.modules.stock_details.decision.fundamentals_snapshot import (
    LatestFinancialMetricRow,
    build_fundamentals_snapshot,
)


def test_build_fundamentals_snapshot_picks_latest_period_and_labels() -> None:
    rows = [
        LatestFinancialMetricRow(
            metric_code="EPS",
            display_name="Earnings Per Share",
            value=Decimal("4.5"),
            as_of_date=date(2023, 12, 31),
            fiscal_year=2023,
        ),
        LatestFinancialMetricRow(
            metric_code="REVENUE",
            display_name="Revenue",
            value=Decimal("1200000000"),
            as_of_date=date(2024, 12, 31),
            fiscal_year=2024,
        ),
        LatestFinancialMetricRow(
            metric_code="NAV_PER_SHARE",
            display_name="Net Asset Value Per Share",
            value=Decimal("0"),
            as_of_date=date(2024, 12, 31),
            fiscal_year=2024,
        ),
    ]

    snapshot = build_fundamentals_snapshot(rows)

    assert snapshot.latest_fiscal_year == 2024
    assert snapshot.latest_as_of_date == "2024-12-31"
    assert len(snapshot.metrics) == 3

    eps = next(metric for metric in snapshot.metrics if metric.metric_code == "EPS")
    assert eps.label == "EPS"
    assert eps.value == 4.5

    nav = next(metric for metric in snapshot.metrics if metric.metric_code == "NAV_PER_SHARE")
    assert nav.value is None
