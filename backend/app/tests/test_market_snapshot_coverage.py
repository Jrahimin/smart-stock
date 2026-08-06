from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.enums import ExchangeCode
from app.jobs.ingestion.ingestion_source_base import IngestedDailyPrice, MarketDataSource
from app.modules.market_data.market_data_service import (
    MarketDataService,
    MarketSnapshotCoverageError,
)


class SyntheticSource(MarketDataSource):
    source_name = "SYNTHETIC"

    def __init__(self, prices: list[IngestedDailyPrice], symbols: set[str] | None = None) -> None:
        self.prices = prices
        self.symbols = symbols

    async def fetch_daily_prices(self, trade_date: date) -> list[IngestedDailyPrice]:
        return self.prices

    def coverage_symbols(self, prices: list[IngestedDailyPrice]) -> set[str]:
        return self.symbols if self.symbols is not None else super().coverage_symbols(prices)


def _price(symbol: str) -> IngestedDailyPrice:
    return IngestedDailyPrice(
        symbol=symbol,
        trade_date=date(2026, 8, 6),
        open_price=Decimal("10"),
        high_price=Decimal("11"),
        low_price=Decimal("9"),
        close_price=Decimal("10.5"),
        previous_close_price=Decimal("10"),
        volume=100,
        trade_count=5,
        turnover=Decimal("1000"),
        source="SYNTHETIC",
    )


def _service(active_symbols: set[str]) -> tuple[MarketDataService, MagicMock]:
    repository = MagicMock()
    repository.list_active_stock_symbols = AsyncMock(return_value=active_symbols)
    repository.get_stocks_by_symbols = AsyncMock(return_value={})
    repository.session = MagicMock()
    repository.session.rollback = AsyncMock()
    return MarketDataService(repository, MagicMock()), repository


@pytest.mark.asyncio
async def test_active_universe_coverage_passes_with_unknown_symbols_excluded() -> None:
    service, _repository = _service({"A", "B", "C", "D"})
    source = SyntheticSource([_price("A")], symbols={"A", "B", "C", "D", "UNKNOWN"})

    await service._validate_snapshot_coverage(
        exchange=ExchangeCode.DSE,
        source=source,
        ingested_prices=source.prices,
        min_active_coverage_percent=95,
        min_source_symbols=4,
    )


@pytest.mark.asyncio
async def test_active_universe_coverage_failure_happens_before_writes() -> None:
    service, repository = _service({"A", "B", "C", "D"})
    source = SyntheticSource([_price("A")], symbols={"A", "B"})

    with pytest.raises(MarketSnapshotCoverageError, match="active_coverage=50.00%"):
        await service.ingest_daily_prices(
            exchange=ExchangeCode.DSE,
            trade_date=date(2026, 8, 6),
            source=source,
            enforce_snapshot_coverage=True,
            min_active_coverage_percent=95,
            min_source_symbols=1,
        )

    repository.get_stocks_by_symbols.assert_not_awaited()
    repository.upsert_daily_price.assert_not_called()
    repository.commit.assert_not_called()


@pytest.mark.asyncio
async def test_absolute_source_symbol_floor_is_enforced() -> None:
    service, _repository = _service({"A", "B"})
    source = SyntheticSource([_price("A"), _price("B")], symbols={"A", "B"})

    with pytest.raises(
        MarketSnapshotCoverageError,
        match="matched_source_symbols=2 below minimum=3",
    ):
        await service._validate_snapshot_coverage(
            exchange=ExchangeCode.DSE,
            source=source,
            ingested_prices=source.prices,
            min_active_coverage_percent=95,
            min_source_symbols=3,
        )


@pytest.mark.asyncio
async def test_unknown_symbols_do_not_help_absolute_floor() -> None:
    service, _repository = _service({"A", "B", "C"})
    source = SyntheticSource(
        [_price("A"), _price("B"), _price("C")],
        symbols={"A", "B", "C", "UNKNOWN"},
    )

    with pytest.raises(
        MarketSnapshotCoverageError,
        match="matched_source_symbols=3 below minimum=4",
    ):
        await service._validate_snapshot_coverage(
            exchange=ExchangeCode.DSE,
            source=source,
            ingested_prices=source.prices,
            min_active_coverage_percent=95,
            min_source_symbols=4,
        )
