from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ExchangeCode
from app.models import FinancialMetricDefinition, FinancialMetricValue, FinancialReport, ShareholdingSnapshot, Stock, ValuationSnapshot
from app.modules.stock_details.decision.fundamentals_snapshot import FUNDAMENTALS_PERFORMANCE_METRIC_CODES


@dataclass(frozen=True)
class MetricCoverageSummary:
    metric_code: str
    stocks_with_any: int
    stocks_with_three_plus_years: int
    stocks_with_five_plus_years: int


@dataclass(frozen=True)
class StockDetailsCoverageReport:
    exchange: ExchangeCode
    eligible_stock_count: int
    metric_coverage: list[MetricCoverageSummary]
    valuation_pe_count: int
    valuation_pb_count: int
    valuation_dividend_yield_count: int
    ownership_two_plus_snapshots: int
    ownership_four_plus_snapshots: int
    sparse_sectors: list[str]
    sample_gap_symbols: list[str]


async def _count_metric_years(session: AsyncSession, stock_ids: list[UUID], metric_code: str) -> dict[UUID, int]:
    if not stock_ids:
        return {}

    statement = (
        select(FinancialReport.stock_id, func.count(func.distinct(FinancialReport.fiscal_year)))
        .join(FinancialMetricValue, FinancialMetricValue.financial_report_id == FinancialReport.id)
        .join(
            FinancialMetricDefinition,
            FinancialMetricValue.metric_definition_id == FinancialMetricDefinition.id,
        )
        .where(
            FinancialReport.stock_id.in_(stock_ids),
            FinancialMetricDefinition.metric_code == metric_code,
            FinancialMetricValue.value.is_not(None),
            FinancialMetricValue.value != 0,
        )
        .group_by(FinancialReport.stock_id)
    )
    result = await session.execute(statement)
    return {stock_id: int(year_count) for stock_id, year_count in result.all()}


async def _latest_valuation_counts(session: AsyncSession, stock_ids: list[UUID]) -> tuple[int, int, int]:
    if not stock_ids:
        return 0, 0, 0

    ranked = (
        select(
            ValuationSnapshot.stock_id,
            ValuationSnapshot.pe_ratio,
            ValuationSnapshot.pb_ratio,
            ValuationSnapshot.dividend_yield,
            func.row_number()
            .over(
                partition_by=ValuationSnapshot.stock_id,
                order_by=(ValuationSnapshot.valuation_date.desc(), ValuationSnapshot.updated_at.desc()),
            )
            .label("row_number"),
        )
        .where(ValuationSnapshot.stock_id.in_(stock_ids))
        .subquery()
    )
    statement = select(ranked).where(ranked.c.row_number == 1)
    result = await session.execute(statement)
    pe_count = 0
    pb_count = 0
    yield_count = 0
    for _stock_id, pe_ratio, pb_ratio, dividend_yield, _row_number in result.all():
        if pe_ratio is not None and float(pe_ratio) > 0:
            pe_count += 1
        if pb_ratio is not None and float(pb_ratio) > 0:
            pb_count += 1
        if dividend_yield is not None and float(dividend_yield) >= 0:
            yield_count += 1
    return pe_count, pb_count, yield_count


async def _ownership_snapshot_counts(session: AsyncSession, stock_ids: list[UUID]) -> dict[UUID, int]:
    if not stock_ids:
        return {}

    statement = (
        select(ShareholdingSnapshot)
        .where(ShareholdingSnapshot.stock_id.in_(stock_ids))
        .order_by(
            ShareholdingSnapshot.stock_id,
            ShareholdingSnapshot.snapshot_date.desc(),
            ShareholdingSnapshot.updated_at.desc(),
        )
    )
    result = await session.scalars(statement)
    counts: dict[UUID, int] = {}
    seen: set[UUID] = set()
    for snapshot in result.all():
        if snapshot.stock_id in seen:
            continue
        seen.add(snapshot.stock_id)
        metadata = snapshot.metadata_json or {}
        history = metadata.get("indexed_history")
        history_len = len(history) if isinstance(history, list) else 0
        counts[snapshot.stock_id] = history_len
    return counts


async def build_stock_details_coverage_report(
    session: AsyncSession,
    *,
    exchange: ExchangeCode = ExchangeCode.DSE,
) -> StockDetailsCoverageReport:
    stocks = list(
        (
            await session.scalars(
                select(Stock).where(
                    Stock.exchange == exchange,
                    Stock.is_active.is_(True),
                    Stock.should_fetch_details.is_(True),
                )
            )
        ).all()
    )
    stock_ids = [stock.id for stock in stocks]
    eligible_count = len(stocks)
    stocks_by_id = {stock.id: stock for stock in stocks}

    metric_coverage: list[MetricCoverageSummary] = []
    sector_three_year_counts: dict[str, list[bool]] = {}

    for metric_code in FUNDAMENTALS_PERFORMANCE_METRIC_CODES:
        year_counts = await _count_metric_years(session, stock_ids, metric_code)
        with_any = len(year_counts)
        with_three = sum(1 for count in year_counts.values() if count >= 3)
        with_five = sum(1 for count in year_counts.values() if count >= 5)
        metric_coverage.append(
            MetricCoverageSummary(
                metric_code=metric_code,
                stocks_with_any=with_any,
                stocks_with_three_plus_years=with_three,
                stocks_with_five_plus_years=with_five,
            )
        )
        if metric_code == "EPS":
            for stock_id, count in year_counts.items():
                stock = stocks_by_id.get(stock_id)
                if stock is None or not stock.sector:
                    continue
                sector_three_year_counts.setdefault(stock.sector, []).append(count >= 3)

    valuation_pe_count, valuation_pb_count, valuation_dividend_yield_count = await _latest_valuation_counts(
        session,
        stock_ids,
    )
    ownership_counts = await _ownership_snapshot_counts(session, stock_ids)
    ownership_two_plus = sum(1 for count in ownership_counts.values() if count >= 2)
    ownership_four_plus = sum(1 for count in ownership_counts.values() if count >= 4)

    sparse_sectors = sorted(
        sector
        for sector, flags in sector_three_year_counts.items()
        if flags and (sum(flags) / len(flags)) < 0.5
    )

    gap_scores: list[tuple[int, str]] = []
    eps_years = await _count_metric_years(session, stock_ids, "EPS")
    for stock in stocks:
        score = eps_years.get(stock.id, 0)
        if ownership_counts.get(stock.id, 0) >= 2:
            score += 1
        gap_scores.append((score, stock.symbol))
    gap_scores.sort(key=lambda item: item[0])
    sample_gap_symbols = [symbol for _score, symbol in gap_scores[:10]]

    return StockDetailsCoverageReport(
        exchange=exchange,
        eligible_stock_count=eligible_count,
        metric_coverage=metric_coverage,
        valuation_pe_count=valuation_pe_count,
        valuation_pb_count=valuation_pb_count,
        valuation_dividend_yield_count=valuation_dividend_yield_count,
        ownership_two_plus_snapshots=ownership_two_plus,
        ownership_four_plus_snapshots=ownership_four_plus,
        sparse_sectors=sparse_sectors,
        sample_gap_symbols=sample_gap_symbols,
    )


def format_coverage_report_markdown(report: StockDetailsCoverageReport) -> str:
    eligible = report.eligible_stock_count or 1
    lines = [
        f"# Stock Details Coverage — {report.exchange.value}",
        "",
        f"Eligible active stocks (`should_fetch_details=true`): **{report.eligible_stock_count}**",
        "",
        "## Financial metrics",
        "",
        "| Metric | Any data | >=3 years | >=5 years |",
        "|--------|----------|----------|----------|",
    ]
    for metric in report.metric_coverage:
        lines.append(
            f"| {metric.metric_code} | {metric.stocks_with_any} ({metric.stocks_with_any / eligible:.0%}) "
            f"| {metric.stocks_with_three_plus_years} ({metric.stocks_with_three_plus_years / eligible:.0%}) "
            f"| {metric.stocks_with_five_plus_years} ({metric.stocks_with_five_plus_years / eligible:.0%}) |"
        )

    lines.extend(
        [
            "",
            "## Valuation snapshots (latest per stock)",
            "",
            f"- P/E: {report.valuation_pe_count} ({report.valuation_pe_count / eligible:.0%})",
            f"- P/B: {report.valuation_pb_count} ({report.valuation_pb_count / eligible:.0%})",
            f"- Dividend yield: {report.valuation_dividend_yield_count} "
            f"({report.valuation_dividend_yield_count / eligible:.0%})",
            "",
            "## Ownership history (`indexed_history` length)",
            "",
            f"- >=2 snapshots: {report.ownership_two_plus_snapshots} "
            f"({report.ownership_two_plus_snapshots / eligible:.0%})",
            f"- >=4 snapshots: {report.ownership_four_plus_snapshots} "
            f"({report.ownership_four_plus_snapshots / eligible:.0%})",
            "",
            "## Sparse sectors (EPS >=3 years on <50% of sector stocks)",
            "",
        ]
    )
    if report.sparse_sectors:
        lines.extend(f"- {sector}" for sector in report.sparse_sectors)
    else:
        lines.append("- None identified")

    lines.extend(
        [
            "",
            "## Sample gap symbols (lowest EPS year coverage)",
            "",
            ", ".join(report.sample_gap_symbols) if report.sample_gap_symbols else "None",
            "",
        ]
    )
    return "\n".join(lines)
