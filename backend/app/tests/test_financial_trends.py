from datetime import date
from decimal import Decimal

from app.modules.stock_details.decision.financial_trends import (
    FinancialMetricHistoryRow,
    build_financial_trends,
)
from app.modules.stock_details.decision.valuation_context import build_valuation_context


def test_build_financial_trends_full_coverage_and_improving_direction() -> None:
    histories = {
        "EPS": [
            FinancialMetricHistoryRow("EPS", "EPS", Decimal("6"), 2024),
            FinancialMetricHistoryRow("EPS", "EPS", Decimal("5"), 2023),
            FinancialMetricHistoryRow("EPS", "EPS", Decimal("4"), 2022),
        ]
    }

    trends = build_financial_trends(histories)
    eps = next(trend for trend in trends if trend.metric_code == "EPS")

    assert eps.coverage_status == "full"
    assert eps.direction == "improving"
    assert eps.latest_value == 6.0
    assert len(eps.points) == 3


def test_build_financial_trends_partial_coverage_has_limited_status() -> None:
    histories = {
        "REVENUE": [
            FinancialMetricHistoryRow("REVENUE", "Revenue", Decimal("100"), 2024),
            FinancialMetricHistoryRow("REVENUE", "Revenue", Decimal("90"), 2023),
        ]
    }

    trends = build_financial_trends(histories)
    revenue = next(trend for trend in trends if trend.metric_code == "REVENUE")

    assert revenue.coverage_status == "partial"
    assert revenue.direction is None


def test_build_financial_trends_none_coverage() -> None:
    trends = build_financial_trends({})
    eps = next(trend for trend in trends if trend.metric_code == "EPS")
    assert eps.coverage_status == "none"
    assert eps.points == []


def test_build_valuation_context_discount_to_sector() -> None:
    context = build_valuation_context(
        stock_pe=10.0,
        stock_pb=1.0,
        peer_pe_values=[12.0, 14.0, 16.0],
        peer_pb_values=[1.4, 1.6, 1.8],
    )

    assert context.pe is not None
    assert context.pe.relative_label == "Discount to Sector"
    assert context.pb is not None
    assert context.pb.relative_label == "Discount to Sector"


def test_build_valuation_context_insufficient_peers() -> None:
    context = build_valuation_context(
        stock_pe=12.0,
        stock_pb=1.2,
        peer_pe_values=[14.0],
        peer_pb_values=[1.4],
    )

    assert context.pe is not None
    assert context.pe.has_sufficient_peers is False
    assert context.pe.sector_median is None
