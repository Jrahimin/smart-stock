"""Lightweight dashboard market snapshot (no trader decision engine)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.core.constants.trading_constants import DASHBOARD_OVERVIEW_SUMMARIES_LIMIT
from app.core.enums import ExchangeCode
from app.core.perf_timing import PerfReport, async_perf_stage
from app.models import DailyMarketSummary, DailyPrice, Stock
from app.modules.market_data.market_data_repository import MarketDataRepository
from app.modules.stock_details.decision.technical import TechnicalSnapshot, build_technical_snapshot

DASHBOARD_SNAPSHOT_PRICES_LIMIT = 5000


@dataclass(frozen=True)
class DashboardSnapshotRow:
    stock: Stock
    price: DailyPrice
    technical: TechnicalSnapshot


@dataclass(frozen=True)
class DashboardMarketSnapshot:
    session_trade_date: date | None
    summaries: list[DailyMarketSummary]
    rows: list[DashboardSnapshotRow]


async def load_dashboard_market_snapshot(
    repository: MarketDataRepository,
    *,
    exchange: ExchangeCode,
    summaries_limit: int = DASHBOARD_OVERVIEW_SUMMARIES_LIMIT,
    prices_limit: int = DASHBOARD_SNAPSHOT_PRICES_LIMIT,
    session_trade_date: date | None = None,
    report: PerfReport | None = None,
) -> DashboardMarketSnapshot:
    perf = report or PerfReport("dashboard.snapshot.load")

    async with async_perf_stage(perf, "db.freshness"):
        if session_trade_date is None:
            session_trade_date, _ = await repository.get_market_price_freshness(exchange=exchange)

    async with async_perf_stage(perf, "db.summaries"):
        summaries = await repository.list_daily_market_summaries(
            exchange=exchange,
            limit=summaries_limit,
            offset=0,
        )

    async with async_perf_stage(perf, "db.latest_prices"):
        latest_rows = await repository.list_latest_daily_prices(
            exchange=exchange,
            limit=prices_limit,
            offset=0,
            end_date=session_trade_date,
        )

    async with async_perf_stage(perf, "compute.snapshot_rows"):
        rows: list[DashboardSnapshotRow] = []
        for stock, price in latest_rows:
            technical = build_technical_snapshot([price])
            if technical is None:
                continue
            rows.append(DashboardSnapshotRow(stock=stock, price=price, technical=technical))

    perf.log_summary()
    return DashboardMarketSnapshot(
        session_trade_date=session_trade_date,
        summaries=summaries,
        rows=rows,
    )
