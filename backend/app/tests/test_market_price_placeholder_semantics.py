from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.enums import DataQualityFlag, TurnoverProvenance
from app.modules.market_data.market_data_schemas import DailyPriceCreate
from app.modules.market_data.market_data_service import MarketDataService


def _placeholder_price() -> DailyPriceCreate:
    return DailyPriceCreate(
        stock_id=uuid4(),
        trade_date=date(2026, 8, 6),
        open_price=Decimal("0"),
        high_price=Decimal("0"),
        low_price=Decimal("1"),
        close_price=Decimal("2"),
        previous_close_price=Decimal("2"),
        volume=0,
        trade_count=0,
        turnover=Decimal("0"),
        source="AMARSTOCK_MARKET_MSGPACK",
        data_quality_flag=DataQualityFlag.PARTIAL,
    )


def test_zero_placeholder_bypasses_positive_ohlc_range_checks() -> None:
    price = _placeholder_price()

    assert price.high_price == 0
    assert price.low_price == 1


def test_positive_ohlc_still_requires_close_inside_range() -> None:
    with pytest.raises(ValidationError, match="close_price must be between"):
        DailyPriceCreate(
            stock_id=uuid4(),
            trade_date=date(2026, 8, 6),
            open_price=Decimal("10"),
            high_price=Decimal("11"),
            low_price=Decimal("9"),
            close_price=Decimal("12"),
            volume=1,
            source="TEST",
        )


@pytest.mark.asyncio
async def test_zero_placeholder_has_no_derived_day_range() -> None:
    service = MarketDataService(MagicMock(), MagicMock())

    values = await service._prepare_daily_price_values(_placeholder_price())

    assert values["day_range"] is None
    assert values["day_range_percent"] is None


@pytest.mark.asyncio
async def test_msgpack_price_keeps_the_canonical_daily_price_shape_and_derivations() -> None:
    price = DailyPriceCreate(
        stock_id=uuid4(),
        trade_date=date(2026, 8, 6),
        open_price=Decimal("118"),
        high_price=Decimal("122"),
        low_price=Decimal("117"),
        close_price=Decimal("120.5"),
        previous_close_price=Decimal("118.5"),
        volume=1_000,
        trade_count=50,
        turnover=Decimal("1250000"),
        source="AMARSTOCK_MARKET_MSGPACK",
        data_quality_flag=DataQualityFlag.OK,
    )
    service = MarketDataService(MagicMock(), MagicMock())

    values = await service._prepare_daily_price_values(price)

    assert values["open_price"] == Decimal("118")
    assert values["high_price"] == Decimal("122")
    assert values["low_price"] == Decimal("117")
    assert values["close_price"] == Decimal("120.5")
    assert values["previous_close_price"] == Decimal("118.5")
    assert values["price_change"] == Decimal("2.0")
    assert values["price_change_percent"] == Decimal("2.0") / Decimal("118.5") * 100
    assert values["day_range"] == Decimal("5")
    assert values["turnover"] == Decimal("1250000")
    assert values["vwap"] == Decimal("1250")
    assert values["turnover_provenance"] == TurnoverProvenance.REPORTED
    assert values["source"] == "AMARSTOCK_MARKET_MSGPACK"
