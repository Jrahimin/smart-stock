from __future__ import annotations

from datetime import date
from uuid import uuid4

from app.core.enums import DataQualityFlag, ExchangeCode, RiskLevelLabel, TraderRecommendation, TrendDirection
from app.models import DailyPrice, Stock
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


def test_build_dashboard_movers_only_includes_traded_session_rows() -> None:
    session_date = date(2026, 6, 17)
    stock = _stock("GAINER")
    rows = [
        (
            stock,
            DailyPrice(
                stock_id=stock.id,
                trade_date=date(2026, 6, 17),
                open_price=100,
                high_price=105,
                low_price=95,
                close_price=100,
                volume=1_000,
                turnover=100_000,
                source="TEST",
                data_quality_flag=DataQualityFlag.OK,
            ),
            _snapshot(trade_date="2026-06-17", price_change_percent=5.0),
        ),
    ]

    movers = _build_movers_from_rows(rows, session_trade_date=session_date)

    assert movers.gainers[0].symbol == "GAINER"
