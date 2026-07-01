"""Dashboard lightweight snapshot — no scored universe dependency."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest

from app.core.enums import DataQualityFlag, ExchangeCode, TrendDirection
from app.models import DailyMarketSummary, DailyPrice, Stock
from app.modules.market_dashboard.market_dashboard_compute import (
    build_sector_snapshots_from_snapshot,
    derive_market_breadth_from_snapshot,
)
from app.modules.market_dashboard.market_snapshot import DashboardSnapshotRow
from app.modules.stock_details.decision.technical import TechnicalSnapshot


def _stock(symbol: str = "TEST", sector: str = "Bank") -> Stock:
    now = datetime.now()
    return Stock(
        id=uuid4(),
        symbol=symbol,
        name=f"{symbol} Limited",
        exchange=ExchangeCode.DSE,
        sector=sector,
        is_active=True,
        should_fetch_details=False,
        created_at=now,
        updated_at=now,
    )


def _price(stock_id, trade_date: date) -> DailyPrice:
    return DailyPrice(
        stock_id=stock_id,
        trade_date=trade_date,
        open_price=Decimal("100"),
        high_price=Decimal("105"),
        low_price=Decimal("95"),
        close_price=Decimal("102"),
        volume=10_000,
        turnover=Decimal("1000000"),
        source="TEST",
        data_quality_flag=DataQualityFlag.OK,
    )


def _technical(*, change: float = 2.0) -> TechnicalSnapshot:
    return TechnicalSnapshot(
        latest_price=102.0,
        previous_close=100.0,
        price_change=2.0,
        price_change_percent=change,
        volume=10_000,
        average_volume=8_000.0,
        turnover=1_000_000.0,
        rsi=55.0,
        sma20=101.0,
        ema20=100.5,
        volatility=1.2,
        support=95.0,
        resistance=110.0,
        trend=TrendDirection.UPTREND,
        data_quality=DataQualityFlag.OK,
        latest_trade_date="2026-06-11",
        ohlcv_row_count=1,
    )


def test_derive_market_breadth_from_snapshot_counts_moves() -> None:
    trade_date = date(2026, 6, 11)
    rows = [
        DashboardSnapshotRow(stock=_stock("A"), price=_price(uuid4(), trade_date), technical=_technical(change=2.0)),
        DashboardSnapshotRow(stock=_stock("B"), price=_price(uuid4(), trade_date), technical=_technical(change=-1.0)),
        DashboardSnapshotRow(stock=_stock("C"), price=_price(uuid4(), trade_date), technical=_technical(change=0.0)),
    ]

    advancing, declining, unchanged, total = derive_market_breadth_from_snapshot(rows)

    assert (advancing, declining, unchanged, total) == (1, 1, 1, 3)


def test_build_sector_snapshots_from_snapshot_groups_by_stock_sector() -> None:
    trade_date = date(2026, 6, 11)
    bank_rows = [
        DashboardSnapshotRow(
            stock=_stock(f"B{i}", sector="Bank"),
            price=_price(uuid4(), trade_date),
            technical=_technical(change=1.0 + i * 0.1),
        )
        for i in range(3)
    ]
    it_rows = [
        DashboardSnapshotRow(
            stock=_stock(f"I{i}", sector="IT"),
            price=_price(uuid4(), trade_date),
            technical=_technical(change=-0.5),
        )
        for i in range(3)
    ]

    sectors, top_gainer = build_sector_snapshots_from_snapshot(
        bank_rows + it_rows,
        session_trade_date=trade_date,
    )

    sector_names = {sector["name"] for sector in sectors}
    assert "Bank" in sector_names
    assert "IT" in sector_names
    assert top_gainer is not None
    assert top_gainer["symbol"].startswith("B")


def test_dashboard_service_module_has_no_universe_imports() -> None:
    import inspect

    from app.modules.market_dashboard import market_dashboard_service

    source = inspect.getsource(market_dashboard_service)
    assert "MarketUniverseService" not in source
    assert "get_scored_universe" not in source
    assert "list_market_price_windows" not in source
    assert "build_scored_universe_rows" not in source
    assert "compute_trader_decision" not in source
