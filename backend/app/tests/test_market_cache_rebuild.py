from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.core_config import Settings
from app.core.enums import ExchangeCode
from app.jobs.market_cache_rebuild import rebuild_market_read_cache


@pytest.mark.asyncio
async def test_rebuild_market_read_cache_priority_order(monkeypatch) -> None:
    call_order: list[str] = []

    class FakeDashboardService:
        async def compute_overview(self, exchange, *, report=None):
            call_order.append("overview")
            return MagicMock(model_dump=lambda mode="json": {})

        async def compute_sectors(self, exchange, *, report=None):
            call_order.append("sectors")
            return MagicMock(model_dump=lambda mode="json": {})

        async def cache_dashboard_payload(self, section, exchange, payload):
            call_order.append(f"cache:{section}")

    class FakeUniverseService:
        async def recompute_scored_universe(self, exchange):
            call_order.append("universe")
            return []

        async def cache_scored_universe(self, exchange, rows):
            call_order.append("cache:universe")

    monkeypatch.setattr(
        "app.jobs.market_cache_rebuild._build_dashboard_service",
        lambda session, settings, redis: FakeDashboardService(),
    )
    monkeypatch.setattr(
        "app.jobs.market_cache_rebuild._build_universe_service",
        lambda session, settings, redis: FakeUniverseService(),
    )
    monkeypatch.setattr(
        "app.jobs.market_cache_rebuild.AsyncSessionLocal",
        lambda: MagicMock(__aenter__=AsyncMock(return_value=MagicMock()), __aexit__=AsyncMock(return_value=None)),
    )

    result = await rebuild_market_read_cache(ExchangeCode.DSE, settings=Settings(), redis=MagicMock(is_available=True))

    assert result.success is True
    assert call_order.index("overview") < call_order.index("sectors") < call_order.index("universe")
    assert call_order.index("cache:overview") < call_order.index("cache:sectors") < call_order.index("cache:universe")


def test_market_cache_rebuild_imports_universe_service() -> None:
    from app.jobs import market_cache_rebuild

    assert market_cache_rebuild.MarketUniverseService is not None
    assert market_cache_rebuild.MarketDataRepository is not None


def test_dashboard_service_does_not_import_universe_service() -> None:
    import inspect

    from app.modules.market_dashboard import market_dashboard_service

    source = inspect.getsource(market_dashboard_service)
    assert "MarketUniverseService" not in source
    assert "get_scored_universe" not in source
    assert "list_market_price_windows" not in source
    assert "build_scored_universe_rows" not in source


def test_build_dashboard_service_factory() -> None:
    from app.jobs.market_cache_rebuild import _build_dashboard_service

    service = _build_dashboard_service(
        session=MagicMock(),
        settings=Settings(),
        redis=MagicMock(is_available=False),
    )
    assert service is not None
