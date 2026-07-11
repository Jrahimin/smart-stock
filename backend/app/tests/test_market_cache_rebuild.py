from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.core_config import Settings
from app.core.enums import ExchangeCode
from app.core.redis_client import OptionalRedisClient
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

        async def compute_movers(self, exchange, *, report=None):
            call_order.append("movers")
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

    redis = MagicMock(is_available=True)
    redis.set_if_not_exists = AsyncMock(return_value=True)
    redis.delete = AsyncMock()

    result = await rebuild_market_read_cache(ExchangeCode.DSE, settings=Settings(), redis=redis)

    assert result.success is True
    assert call_order.index("overview") < call_order.index("sectors") < call_order.index("movers") < call_order.index("universe")
    assert (
        call_order.index("cache:overview")
        < call_order.index("cache:sectors")
        < call_order.index("cache:movers")
        < call_order.index("cache:universe")
    )


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


@pytest.mark.asyncio
async def test_warm_market_read_cache_if_cold_spawns_when_universe_missing(monkeypatch) -> None:
    from app.jobs.market_cache_spawn import warm_market_read_cache_if_cold

    spawned: list[ExchangeCode] = []
    redis = MagicMock(is_available=True)
    redis.get_json = AsyncMock(return_value=None)

    monkeypatch.setattr(
        "app.jobs.market_cache_spawn.spawn_rebuild_market_read_cache",
        lambda exchange, settings=None: spawned.append(exchange),
    )

    await warm_market_read_cache_if_cold(ExchangeCode.DSE, settings=Settings(), redis=redis)

    assert spawned == [ExchangeCode.DSE]


@pytest.mark.asyncio
async def test_warm_market_read_cache_if_cold_skips_when_scored_present(monkeypatch) -> None:
    from app.jobs.market_cache_spawn import warm_market_read_cache_if_cold

    spawned: list[ExchangeCode] = []
    redis = MagicMock(is_available=True)
    redis.get_json = AsyncMock(return_value={"rows": []})

    monkeypatch.setattr(
        "app.jobs.market_cache_spawn.spawn_rebuild_market_read_cache",
        lambda exchange, settings=None: spawned.append(exchange),
    )

    await warm_market_read_cache_if_cold(ExchangeCode.DSE, settings=Settings(), redis=redis)

    assert spawned == []


def test_build_dashboard_service_factory() -> None:
    from app.jobs.market_cache_rebuild import _build_dashboard_service

    service = _build_dashboard_service(
        session=MagicMock(),
        settings=Settings(),
        redis=MagicMock(is_available=False),
    )
    assert service is not None


@pytest.mark.asyncio
async def test_spawn_rebuild_universe_read_cache_dedupes_inflight(monkeypatch) -> None:
    import app.jobs.market_cache_spawn as spawn_module
    from app.jobs.market_cache_spawn import spawn_rebuild_universe_read_cache

    spawn_module._inflight_rebuilds.clear()
    spawn_module._rebuild_tasks.clear()

    call_count = 0
    started = asyncio.Event()
    release = asyncio.Event()

    async def slow_rebuild(*_args, **_kwargs):
        nonlocal call_count
        call_count += 1
        started.set()
        await release.wait()

    monkeypatch.setattr(
        "app.jobs.market_cache_rebuild.rebuild_universe_read_cache",
        slow_rebuild,
    )

    assert spawn_rebuild_universe_read_cache(ExchangeCode.DSE) is True
    await asyncio.wait_for(started.wait(), timeout=1)

    assert spawn_rebuild_universe_read_cache(ExchangeCode.DSE) is False
    assert call_count == 1

    release.set()
    await asyncio.sleep(0.05)
    assert spawn_module._inflight_rebuilds == {}


@pytest.mark.asyncio
async def test_spawn_rebuild_universe_skips_when_market_read_inflight(monkeypatch) -> None:
    import app.jobs.market_cache_spawn as spawn_module
    from app.jobs.market_cache_spawn import spawn_rebuild_market_read_cache, spawn_rebuild_universe_read_cache

    spawn_module._inflight_rebuilds.clear()
    spawn_module._rebuild_tasks.clear()

    universe_calls = 0
    market_started = asyncio.Event()
    release = asyncio.Event()

    async def slow_market_rebuild(*_args, **_kwargs):
        market_started.set()
        await release.wait()
        return MagicMock(success=True, steps=[])

    async def slow_universe_rebuild(*_args, **_kwargs):
        nonlocal universe_calls
        universe_calls += 1
        await release.wait()

    monkeypatch.setattr("app.jobs.market_cache_rebuild.rebuild_market_read_cache", slow_market_rebuild)
    monkeypatch.setattr("app.jobs.market_cache_rebuild.rebuild_universe_read_cache", slow_universe_rebuild)

    assert spawn_rebuild_market_read_cache(ExchangeCode.DSE) is True
    await asyncio.wait_for(market_started.wait(), timeout=1)

    assert spawn_rebuild_universe_read_cache(ExchangeCode.DSE) is False
    assert universe_calls == 0

    release.set()
    await asyncio.sleep(0.05)


@pytest.mark.asyncio
async def test_spawn_rebuild_market_read_cache_dedupes_inflight(monkeypatch) -> None:
    import app.jobs.market_cache_spawn as spawn_module
    from app.jobs.market_cache_spawn import spawn_rebuild_market_read_cache

    spawn_module._inflight_rebuilds.clear()
    spawn_module._rebuild_tasks.clear()

    call_count = 0
    started = asyncio.Event()
    release = asyncio.Event()

    async def slow_market_rebuild(*_args, **_kwargs):
        nonlocal call_count
        call_count += 1
        started.set()
        await release.wait()
        return MagicMock(success=True, steps=[])

    monkeypatch.setattr("app.jobs.market_cache_rebuild.rebuild_market_read_cache", slow_market_rebuild)

    assert spawn_rebuild_market_read_cache(ExchangeCode.DSE) is True
    await asyncio.wait_for(started.wait(), timeout=1)
    assert spawn_rebuild_market_read_cache(ExchangeCode.DSE) is False
    assert call_count == 1

    release.set()
    await asyncio.sleep(0.05)


@pytest.mark.asyncio
async def test_rebuild_market_read_cache_skips_when_redis_lock_held(monkeypatch) -> None:
    redis = MagicMock(is_available=True)
    redis.set_if_not_exists = AsyncMock(return_value=False)
    redis.delete = AsyncMock()

    compute_calls = 0

    class FakeDashboardService:
        async def compute_overview(self, exchange, *, report=None):
            nonlocal compute_calls
            compute_calls += 1
            return MagicMock()

        async def cache_dashboard_payload(self, section, exchange, payload):
            return None

    monkeypatch.setattr(
        "app.jobs.market_cache_rebuild._build_dashboard_service",
        lambda session, settings, redis_client: FakeDashboardService(),
    )
    monkeypatch.setattr(
        "app.jobs.market_cache_rebuild.AsyncSessionLocal",
        lambda: MagicMock(__aenter__=AsyncMock(return_value=MagicMock()), __aexit__=AsyncMock(return_value=None)),
    )

    result = await rebuild_market_read_cache(ExchangeCode.DSE, settings=Settings(), redis=redis)

    assert compute_calls == 0
    assert [step.step for step in result.steps] == ["skipped-duplicate"]
    redis.delete.assert_not_called()


@pytest.mark.asyncio
async def test_rebuild_market_read_cache_proceeds_when_redis_unavailable(monkeypatch) -> None:
    call_order: list[str] = []
    redis = OptionalRedisClient(None)

    class FakeDashboardService:
        async def compute_overview(self, exchange, *, report=None):
            call_order.append("overview")
            return MagicMock(model_dump=lambda mode="json": {})

        async def compute_sectors(self, exchange, *, report=None):
            call_order.append("sectors")
            return MagicMock(model_dump=lambda mode="json": {})

        async def compute_movers(self, exchange, *, report=None):
            call_order.append("movers")
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
        lambda session, settings, redis_client: FakeDashboardService(),
    )
    monkeypatch.setattr(
        "app.jobs.market_cache_rebuild._build_universe_service",
        lambda session, settings, redis_client: FakeUniverseService(),
    )
    monkeypatch.setattr(
        "app.jobs.market_cache_rebuild.AsyncSessionLocal",
        lambda: MagicMock(__aenter__=AsyncMock(return_value=MagicMock()), __aexit__=AsyncMock(return_value=None)),
    )

    result = await rebuild_market_read_cache(ExchangeCode.DSE, settings=Settings(), redis=redis)

    assert result.success is True
    assert "movers" in call_order


@pytest.mark.asyncio
async def test_rebuild_market_read_cache_releases_lock_after_completion(monkeypatch) -> None:
    redis = MagicMock(is_available=True)
    redis.set_if_not_exists = AsyncMock(return_value=True)
    redis.delete = AsyncMock()

    class FakeDashboardService:
        async def compute_overview(self, exchange, *, report=None):
            return MagicMock(model_dump=lambda mode="json": {})

        async def compute_sectors(self, exchange, *, report=None):
            return MagicMock(model_dump=lambda mode="json": {})

        async def compute_movers(self, exchange, *, report=None):
            return MagicMock(model_dump=lambda mode="json": {})

        async def cache_dashboard_payload(self, section, exchange, payload):
            return None

    class FakeUniverseService:
        async def recompute_scored_universe(self, exchange):
            return []

        async def cache_scored_universe(self, exchange, rows):
            return None

    monkeypatch.setattr(
        "app.jobs.market_cache_rebuild._build_dashboard_service",
        lambda session, settings, redis_client: FakeDashboardService(),
    )
    monkeypatch.setattr(
        "app.jobs.market_cache_rebuild._build_universe_service",
        lambda session, settings, redis_client: FakeUniverseService(),
    )
    monkeypatch.setattr(
        "app.jobs.market_cache_rebuild.AsyncSessionLocal",
        lambda: MagicMock(__aenter__=AsyncMock(return_value=MagicMock()), __aexit__=AsyncMock(return_value=None)),
    )

    await rebuild_market_read_cache(ExchangeCode.DSE, settings=Settings(), redis=redis)

    redis.delete.assert_called_once_with("market:rebuild-lock:DSE")
