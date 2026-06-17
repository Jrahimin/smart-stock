from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.core.enums import DataQualityFlag, ExchangeCode, PulseFocusLabel, TrendDirection
from app.models import DailyPrice, Stock
from app.modules.market_data.market_mover_rules import is_eligible_session_mover
from app.modules.market_pulse.market_pulse_service import PulsePresentationRow, _build_market_movers
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
) -> TechnicalSnapshot:
    return TechnicalSnapshot(
        latest_price=latest_price,
        previous_close=102.5,
        price_change=-2.5,
        price_change_percent=price_change_percent,
        volume=volume,
        average_volume=8_000.0,
        turnover=1_000_000.0,
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


def _row(snapshot: TechnicalSnapshot, symbol: str = "TEST") -> PulsePresentationRow:
    return PulsePresentationRow(
        stock=_stock(symbol),
        snapshot=snapshot,
        decision=object(),
        score=object(),
        label=PulseFocusLabel.MOMENTUM_BUILDING,
    )


def test_eligible_mover_requires_current_session_trade() -> None:
    session_date = date(2026, 6, 17)
    traded = _snapshot(trade_date="2026-06-17", price_change_percent=-3.0)
    stale = _snapshot(trade_date="2026-06-16", price_change_percent=-100.0, latest_price=0.0, volume=0)

    assert is_eligible_session_mover(traded, session_date) is True
    assert is_eligible_session_mover(stale, session_date) is False


def test_eligible_mover_rejects_zero_volume_and_invalid_price() -> None:
    session_date = date(2026, 6, 17)
    no_volume = _snapshot(trade_date="2026-06-17", volume=0, price_change_percent=-100.0, latest_price=0.0)
    zero_price = _snapshot(trade_date="2026-06-17", latest_price=0.0, volume=1_000, price_change_percent=-100.0)

    assert is_eligible_session_mover(no_volume, session_date) is False
    assert is_eligible_session_mover(zero_price, session_date) is False


def test_build_market_movers_only_includes_traded_losers() -> None:
    session_date = date(2026, 6, 17)
    rows = [
        _row(_snapshot(trade_date="2026-06-17", price_change_percent=5.0), "GAINER"),
        _row(_snapshot(trade_date="2026-06-17", price_change_percent=-4.0), "LOSER"),
        _row(_snapshot(trade_date="2026-06-16", price_change_percent=-100.0, latest_price=0.0, volume=0), "STALE"),
    ]

    movers = _build_market_movers(rows, session_trade_date=session_date)

    assert [mover.symbol for mover in movers.gainers] == ["GAINER"]
    assert [mover.symbol for mover in movers.losers] == ["LOSER"]
