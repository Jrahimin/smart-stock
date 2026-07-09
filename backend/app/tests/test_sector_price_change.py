from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest

from app.models import DailyPrice
from app.modules.stock_details.sector_intelligence_service import _price_change_percent


def _daily_price(*, trade_date: str, close: float) -> DailyPrice:
    return DailyPrice(
        id=uuid4(),
        stock_id=uuid4(),
        trade_date=date.fromisoformat(trade_date),
        open_price=Decimal(str(close)),
        high_price=Decimal(str(close)),
        low_price=Decimal(str(close)),
        close_price=Decimal(str(close)),
        volume=1_000,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )


def test_price_change_percent_sorts_prices_before_lookback() -> None:
    # Repository returns newest-first; calculation must still use chronological closes.
    prices = [
        _daily_price(trade_date="2026-07-09", close=110.0),
        _daily_price(trade_date="2026-07-08", close=105.0),
        _daily_price(trade_date="2026-07-07", close=104.0),
        _daily_price(trade_date="2026-07-06", close=103.0),
        _daily_price(trade_date="2026-07-05", close=102.0),
        _daily_price(trade_date="2026-07-02", close=100.0),
    ]

    assert _price_change_percent(prices, 5) == pytest.approx(10.0)
