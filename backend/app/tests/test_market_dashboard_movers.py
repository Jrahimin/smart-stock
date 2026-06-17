from __future__ import annotations

from datetime import date
from uuid import uuid4

from app.core.enums import DataQualityFlag, ExchangeCode, TrendDirection
from app.models import DailyPrice, Stock
from app.modules.market_dashboard.market_dashboard_cache import (
    DASHBOARD_CACHE_KEY_NAMES,
    dashboard_cache_key,
)
from app.modules.market_dashboard.market_dashboard_service import _build_movers_from_rows
from app.modules.stock_details.decision.technical import TechnicalSnapshot


def _stock(symbol: str = "TEST") -> Stock:
    return Stock(
        id=uuid4(),
        symbol=symbol,
        name=f"{symbol} Limited",
        exchange=ExchangeCode.DSE,
        is_active=True,
    )


def _snapshot(
    *,
    trade_date: str,
    latest_price: float = 100.0,
    price_change_percent: float = -2.5,
    volume: int = 10_000,
    turnover: float = 1_000_000.0,
) -> TechnicalSnapshot:
    return TechnicalSnapshot(
        latest_price=latest_price,
        previous_close=102.5,
        price_change=-2.5,
        price_change_percent=price_change_percent,
        volume=volume,
        average_volume=8_000.0,
        turnover=turnover,
        rsi=45.0,
        sma20=101.0,
        ema20=100.5,
        volatility=1.2,
        support=95.0,
        resistance=110.0,
        trend=TrendDirection.DOWNTREND,
        data_quality=DataQualityFlag.OK,
        latest_trade_date=trade_date,
        ohlcv_row_count=20,
    )


def _row(
    snapshot: TechnicalSnapshot,
    symbol: str = "TEST",
) -> tuple[Stock, DailyPrice, TechnicalSnapshot]:
    stock = _stock(symbol)
    price = DailyPrice(
        stock_id=stock.id,
        trade_date=date.fromisoformat(snapshot.latest_trade_date),
        open_price=100,
        high_price=105,
        low_price=95,
        close_price=snapshot.latest_price or 0,
        volume=snapshot.volume,
        turnover=snapshot.turnover,
        source="TEST",
        data_quality_flag=DataQualityFlag.OK,
    )
    return stock, price, snapshot


def test_dashboard_cache_key_format() -> None:
    assert dashboard_cache_key("overview", ExchangeCode.DSE) == "dashboard:overview:DSE"
    assert len(DASHBOARD_CACHE_KEY_NAMES) == 7


def test_build_dashboard_movers_only_includes_traded_session_rows() -> None:
    session_date = date(2026, 6, 17)
    rows = [
        _row(_snapshot(trade_date="2026-06-17", price_change_percent=5.0), "GAINER"),
        _row(_snapshot(trade_date="2026-06-17", price_change_percent=-4.0), "LOSER"),
        _row(
            _snapshot(
                trade_date="2026-06-16",
                price_change_percent=-100.0,
                latest_price=0.0,
                volume=0,
                turnover=0.0,
            ),
            "STALE",
        ),
    ]

    movers = _build_movers_from_rows(rows, session_trade_date=session_date)

    assert [mover.symbol for mover in movers.gainers] == ["GAINER"]
    assert [mover.symbol for mover in movers.losers] == ["LOSER"]
    assert movers.session_trade_date == session_date


def test_build_dashboard_movers_ranks_turnover_and_volume_leaders() -> None:
    session_date = date(2026, 6, 17)
    rows = [
        _row(_snapshot(trade_date="2026-06-17", price_change_percent=1.0, turnover=500_000, volume=1_000), "LOW"),
        _row(_snapshot(trade_date="2026-06-17", price_change_percent=2.0, turnover=2_000_000, volume=5_000), "HIGH"),
    ]

    movers = _build_movers_from_rows(rows, session_trade_date=session_date, limit=1)

    assert movers.turnover_leaders[0].symbol == "HIGH"
    assert movers.volume_leaders[0].symbol == "HIGH"
