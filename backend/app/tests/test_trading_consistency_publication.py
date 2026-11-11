import asyncio
import os
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.schema import CreateSchema, DropSchema
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.engine import make_url

from app.core.core_config import Settings
from app.core.enums import ExchangeCode
from app.models import DecisionGenerationCapture
from app.modules.market_universe.market_universe_service import MarketUniverseService
from app.modules.trading_intelligence.decision_snapshot_repository import DecisionSnapshotRepository
from app.tests.test_canonical_generation_architecture import _canonical_fixture


@pytest.mark.asyncio
async def test_cache_uses_exact_durable_winner_on_duplicate_retry_and_redis_failure():
    _, _, row, snapshot = _canonical_fixture()
    durable = snapshot.payload.model_dump(mode="json")
    durable["durable_winner_marker"] = "first-publication"
    repository = SimpleNamespace(publish_generation=AsyncMock(return_value=SimpleNamespace(result_payload=durable)))
    redis = SimpleNamespace(set_json=AsyncMock(return_value=True))
    service = MarketUniverseService(object(), object(), redis, Settings(), repository)
    service._input_captures = {str(row.stock.id): {"test": "input"}}
    service.is_input_generation_current = AsyncMock(return_value=True)
    service.resolve_quote_context = AsyncMock(return_value=snapshot.generation)
    assert await service.cache_scored_universe(ExchangeCode.DSE, [row], generation=snapshot.generation)
    assert redis.set_json.call_args.args[1]["durable_winner_marker"] == "first-publication"
    redis.set_json.return_value = False
    assert await service.cache_scored_universe(ExchangeCode.DSE, [row], generation=snapshot.generation)
    assert repository.publish_generation.await_count == 2


@pytest.mark.asyncio
async def test_two_postgres_sessions_publish_one_durable_winner():
    raw = os.getenv("TRADING_TEST_DATABASE_URL")
    if not raw:
        pytest.skip("Set TRADING_TEST_DATABASE_URL to an isolated local decision QA database")
    url = make_url(raw)
    assert url.host in {"localhost", "127.0.0.1"} and url.database.startswith("smart_stock_decision_qa_")
    schema = "decision_publish_test_" + uuid4().hex
    engine = create_async_engine(url.set(drivername="postgresql+asyncpg"),
        connect_args={"server_settings": {"search_path": schema + ",public"}})
    async with engine.begin() as connection:
        await connection.execute(CreateSchema(schema))
        await connection.execute(text(f'CREATE TABLE "{schema}".decision_generation_captures (LIKE public.decision_generation_captures INCLUDING ALL)'))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    generation_id = "test-publication-race-" + uuid4().hex
    try:
        async def publish(marker):
            async with factory() as session:
                winner = await DecisionSnapshotRepository(session).publish_generation(
                    exchange=ExchangeCode.DSE, generation_id=generation_id, session_date=date(2026, 11, 10),
                    inputs={"marker": marker}, payload={"marker": marker},
                )
                return winner.result_payload, winner.input_payload, winner.observed_at
        left, right = await asyncio.gather(publish("left"), publish("right"))
        assert left == right
        async with factory() as session:
            winner = await DecisionSnapshotRepository(session).latest_publication(
                exchange=ExchangeCode.DSE, generation_id=generation_id,
            )
            assert winner.result_payload == left[0]
        assert await publish("retry-after-redis-eviction") == left
    finally:
        async with engine.begin() as connection:
            await connection.execute(DropSchema(schema, cascade=True))
        await engine.dispose()
