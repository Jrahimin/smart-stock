from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from starlette.requests import Request

from app.api.dependencies.auth_dependencies import require_admin
from app.core.constants.trading_constants import (
    DECISION_TAXONOMY_VERSION,
    SCANNER_CONDITION_VERSION,
    TRADING_INPUT_SCHEMA_VERSION,
    TRADING_STRATEGY_VERSION,
    TRADING_THRESHOLD_VERSION,
)
from app.core.core_config import Settings
from app.core.enums import DataQualityFlag, ExchangeCode, MarketDataState
from app.core.exception_handlers import UnauthorizedError
from app.core.redis_client import OptionalRedisClient
from app.core.security_config import ANONYMOUS_USER_CONTEXT
from app.jobs.market_cache_rebuild import _acquire_rebuild_lock
from app.models import DailyPrice, Stock
from app.modules.market_data.market_data_service import MarketDataService
from app.modules.market_data.published_generation import PublishedMarketGeneration
from app.modules.market_universe.market_universe_cache import universe_cache_key
from app.modules.market_universe.market_universe_compute import (
    build_scored_universe_rows,
    group_price_window_rows,
)
from app.modules.market_universe.market_universe_lineage import compute_universe_payload_revision
from app.modules.market_universe.market_universe_schemas import ScoredUniverseCacheRead
from app.modules.market_universe.market_universe_service import (
    CanonicalUniverseSnapshot,
    MarketUniverseService,
    UniverseCacheUnavailableError,
)
from app.modules.signals.trader_decisions_service import TraderDecisionsService
from app.modules.stock_details.stock_details_decision_service import StockDetailsDecisionService


SESSION_DATE = date(2026, 8, 9)
SYNCED_AT = datetime(2026, 8, 9, 6, 30, tzinfo=UTC)


def _generation(
    sync_id: str,
    state: MarketDataState = MarketDataState.LIVE,
) -> PublishedMarketGeneration:
    return PublishedMarketGeneration(
        trade_date=SESSION_DATE,
        sync_id=sync_id,
        data_state=state,
        source_last_synced_at=SYNCED_AT,
        published_at=SYNCED_AT,
    )


def _canonical_fixture():
    stock = Stock(
        id=uuid4(),
        symbol="CENTRALINS",
        name="Central Insurance PLC.",
        exchange=ExchangeCode.DSE,
        category="A",
        is_active=True,
        should_fetch_details=False,
        created_at=SYNCED_AT,
        updated_at=SYNCED_AT,
    )
    start = SESSION_DATE - timedelta(days=79)
    prices = [
        DailyPrice(
            stock_id=stock.id,
            trade_date=start + timedelta(days=index),
            open_price=Decimal(80 + index) / Decimal("2"),
            high_price=Decimal(82 + index) / Decimal("2"),
            low_price=Decimal(78 + index) / Decimal("2"),
            close_price=Decimal(81 + index) / Decimal("2"),
            volume=50_000 + index * 1_000,
            turnover=Decimal(5_000_000 + index * 100_000),
            source="TEST",
            data_quality_flag=DataQualityFlag.OK,
            created_at=SYNCED_AT,
            updated_at=SYNCED_AT,
        )
        for index in range(80)
    ]
    rows = build_scored_universe_rows(
        group_price_window_rows([(stock, price) for price in prices]),
        exchange_session_dates=[price.trade_date for price in prices],
        decision_session_date=SESSION_DATE,
    )
    assert len(rows) == 1
    row = rows[0]
    assert row.decision is not None and row.decision.canonical is not None
    assert row.analysis is not None
    generation = _generation("G123")
    payload = ScoredUniverseCacheRead(
        strategy_version=TRADING_STRATEGY_VERSION,
        threshold_version=TRADING_THRESHOLD_VERSION,
        input_schema_version=TRADING_INPUT_SCHEMA_VERSION,
        decision_taxonomy_version=DECISION_TAXONOMY_VERSION,
        scanner_version=SCANNER_CONDITION_VERSION,
        session_trade_date=SESSION_DATE,
        decision_session_date=SESSION_DATE,
        live_data_as_of=SYNCED_AT,
        is_live_session=True,
        source_last_synced_at=SYNCED_AT,
        market_sync_id=generation.sync_id,
        data_state=generation.data_state,
        payload_revision=compute_universe_payload_revision(rows),
        rows=rows,
    )
    return stock, prices, row, CanonicalUniverseSnapshot(generation, payload)


class _DetailsRepository:
    def __init__(self, stock, prices) -> None:
        self.stock = stock
        self.prices = prices

    async def get_stock_by_exchange_symbol(self, **kwargs):
        return self.stock

    async def list_daily_prices_window(self, **kwargs):
        end_date = kwargs.get("end_date")
        return [price for price in self.prices if end_date is None or price.trade_date <= end_date]

    async def list_dividend_events(self, **kwargs):
        return []

    async def list_corporate_actions(self, **kwargs):
        return []

    async def get_latest_shareholding_snapshot(self, stock_id):
        return None

    async def get_latest_valuation_snapshot(self, stock_id):
        return None

    async def list_market_events(self, **kwargs):
        return []


class _CanonicalUniverseDouble:
    def __init__(self, snapshot: CanonicalUniverseSnapshot, *, current: bool = True) -> None:
        self.snapshot = snapshot
        self.current = current

    async def get_canonical_universe(self, **kwargs):
        return self.snapshot

    async def get_scored_universe(self, **kwargs):
        return self.snapshot.rows

    async def is_generation_current(self, generation, **kwargs):
        return self.current


@pytest.mark.asyncio
async def test_universe_signals_and_stock_details_share_canonical_identity() -> None:
    stock, prices, universe_row, snapshot = _canonical_fixture()
    universe = _CanonicalUniverseDouble(snapshot)
    signal_row = (
        await TraderDecisionsService(universe).list_latest_trader_decisions(
            exchange=ExchangeCode.DSE,
            limit=10,
            offset=0,
            price_window_limit=90,
        )
    )[0]
    detail = await StockDetailsDecisionService(
        _DetailsRepository(stock, prices),
        universe,
    ).get_decision_support(exchange=ExchangeCode.DSE, symbol=stock.symbol)

    universe_decision = universe_row.decision
    assert universe_decision is not None and universe_decision.canonical is not None
    for decision in (signal_row.decision.canonical, detail.canonical_decision):
        assert decision is not None
        assert decision.display_action == universe_decision.canonical.display_action
        assert decision.shared_decision_id == universe_decision.canonical.shared_decision_id
        assert decision.input_hash == universe_decision.canonical.input_hash
        assert decision.as_of_date == universe_decision.canonical.as_of_date
        assert decision.strategy_version == universe_decision.canonical.strategy_version
    assert detail.market_sync_id == snapshot.generation.sync_id


class _MemoryRedis:
    is_available = True

    def __init__(self) -> None:
        self.storage: dict[str, dict] = {}
        self.deleted: list[str] = []

    async def get_json(self, key):
        return self.storage.get(key)

    async def set_json(self, key, value, *, ttl_seconds):
        self.storage[key] = value

    async def delete(self, key):
        self.deleted.append(key)
        self.storage.pop(key, None)


@pytest.mark.asyncio
async def test_old_generation_cannot_overwrite_newer_generation() -> None:
    _, _, row, _ = _canonical_fixture()
    redis = _MemoryRedis()
    service = MarketUniverseService(object(), object(), redis, Settings())
    service.resolve_generation_context = AsyncMock(side_effect=[_generation("G123"), _generation("G124")])

    cached = await service.cache_scored_universe(
        ExchangeCode.DSE,
        [row],
        generation=_generation("G123"),
    )

    old_key = universe_cache_key("scored", ExchangeCode.DSE, "G123")
    assert cached is False
    assert old_key not in redis.storage
    assert old_key in redis.deleted


@pytest.mark.asyncio
async def test_state_only_transition_reuses_same_generation_cache() -> None:
    _, _, _, live_snapshot = _canonical_fixture()
    redis = _MemoryRedis()
    cache_key = universe_cache_key("scored", ExchangeCode.DSE, "G123")
    redis.storage[cache_key] = live_snapshot.payload.model_dump(mode="json")
    service = MarketUniverseService(object(), object(), redis, Settings())

    stale = await service.get_canonical_universe(
        exchange=ExchangeCode.DSE,
        generation=_generation("G123", MarketDataState.STALE),
    )

    assert stale.generation.data_state == MarketDataState.STALE
    assert stale.payload.market_sync_id == "G123"
    assert redis.deleted == []


@pytest.mark.asyncio
async def test_stock_details_rejects_mid_request_generation_change() -> None:
    stock, prices, _, snapshot = _canonical_fixture()
    universe = _CanonicalUniverseDouble(snapshot, current=False)

    with pytest.raises(UniverseCacheUnavailableError, match="generation changed"):
        await StockDetailsDecisionService(
            _DetailsRepository(stock, prices),
            universe,
        ).get_decision_support(
            exchange=ExchangeCode.DSE,
            symbol=stock.symbol,
            canonical_snapshot=snapshot,
        )


@pytest.mark.asyncio
async def test_concurrent_rebuild_lock_requests_have_one_owner() -> None:
    class LockRedis:
        is_available = True

        def __init__(self) -> None:
            self.owner: str | None = None

        async def set_if_not_exists(self, key, value, *, ttl_seconds):
            await asyncio.sleep(0)
            if self.owner is not None:
                return False
            self.owner = value
            return True

    redis = LockRedis()
    owners = await asyncio.gather(
        _acquire_rebuild_lock(redis, ExchangeCode.DSE, wait=False),
        _acquire_rebuild_lock(redis, ExchangeCode.DSE, wait=False),
    )
    assert sum(owner is not None for owner in owners) == 1


@pytest.mark.asyncio
async def test_redis_lock_error_fails_closed() -> None:
    class FailingRedis:
        async def set(self, *args, **kwargs):
            raise ConnectionError("redis unavailable")

    redis = OptionalRedisClient(None)
    redis._redis = FailingRedis()
    redis._available = True

    owner = await asyncio.wait_for(
        _acquire_rebuild_lock(redis, ExchangeCode.DSE, wait=True),
        timeout=0.2,
    )
    assert owner is None
    assert redis.coordination_failed is True


@pytest.mark.asyncio
async def test_historical_correction_advances_generation_and_cache_identity() -> None:
    current = SimpleNamespace(
        trade_date=SESSION_DATE,
        sync_id="G123",
        state=MarketDataState.FINALIZED,
        source_last_synced_at=SYNCED_AT,
        fetched_count=400,
        accepted_count=390,
        suspicious_count=1,
    )

    class Repository:
        def __init__(self) -> None:
            self.created: list[dict] = []

        async def get_latest_market_data_generation(self, **kwargs):
            return current

        async def get_market_data_generation_by_sync_id(self, **kwargs):
            return current

        async def create_market_data_generation(self, **kwargs):
            self.created.append(kwargs)

        async def commit(self):
            return None

    repository = Repository()
    service = MarketDataService(repository, ANONYMOUS_USER_CONTEXT)
    service._resolve_published_market_generation = AsyncMock(return_value=_generation("G123", MarketDataState.FINALIZED))

    revised = await service.publish_decision_input_revision(
        exchange=ExchangeCode.DSE,
        source="historical-ohlcv-correction",
    )

    assert revised is not None and revised != "G123"
    assert repository.created[0]["sync_id"] == revised
    assert universe_cache_key("scored", ExchangeCode.DSE, revised) != universe_cache_key(
        "scored", ExchangeCode.DSE, "G123"
    )


def test_canonical_market_mutation_routes_require_admin_dependency() -> None:
    from app.modules.market_data.market_data_router import router as market_router
    from app.modules.stock_details.stock_details_router import router as stock_details_router

    protected = {
        ("/stocks/{stock_id}/prices", "POST"),
        ("/market-data/ingestion/daily-prices", "POST"),
        ("/market/summaries", "POST"),
        ("/stock-details/sync", "POST"),
    }
    found: set[tuple[str, str]] = set()
    for route in [*market_router.routes, *stock_details_router.routes]:
        for method in route.methods or set():
            identity = (route.path, method)
            if identity not in protected:
                continue
            found.add(identity)
            assert any(dependency.call is require_admin for dependency in route.dependant.dependencies)
    assert found == protected

    request = Request({"type": "http", "method": "POST", "path": "/", "headers": []})
    request.state.user = ANONYMOUS_USER_CONTEXT
    with pytest.raises(UnauthorizedError):
        require_admin(request)
