import os
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.schema import CreateSchema, DropSchema

from app.core.core_config import Settings
from app.models import TradingShadowSelection, TradingShadowOutcome, DecisionGenerationCapture
from app.modules.backtesting.backtesting_shadow import record_shadow_selection, mature_shadow_outcomes, shadow_progress, capture_dataset
from app.modules.backtesting.backtesting_models import BacktestConfig
from app.modules.market_universe.market_universe_compute import build_scored_universe_rows
from app.tests.test_canonical_decision_consistency import _stock, _prices


def empty_eligible_capture():
    stock = _stock("EMPTYELIG")
    prices = _prices(stock, 3)
    day = prices[-1].trade_date
    inputs = {}
    rows = build_scored_universe_rows({str(stock.id): {"stock": stock, "prices": prices}},
        exchange_session_dates=[price.trade_date for price in prices], decision_session_date=day, input_captures=inputs)
    observed = datetime.now(UTC)
    return SimpleNamespace(id=uuid4(), generation_id="shadow-test-"+uuid4().hex, session_date=day,
        exchange=stock.exchange, observed_at=observed, invalidated_at=None,
        result_payload={"strategy_version": rows[0].decision.canonical.strategy_version, "rows": [row.model_dump(mode="json") for row in rows]},
        input_payload={"inputs": inputs, "stocks": {str(stock.id): rows[0].stock.model_dump(mode="json")},
            "universe_membership": [str(stock.id)], "excluded_members": [],
            "membership_provenance": {"status": "OBSERVED_INDEPENDENT_LISTED_SET", "listed_count": 1,
                "observed_at": observed.isoformat(), "market_coverage_verified": True}})


@pytest.mark.asyncio
async def test_paired_empty_session_sealed_once_and_outcomes_append_idempotently():
    raw = os.getenv("TRADING_TEST_DATABASE_URL")
    if not raw:
        pytest.skip("Set isolated local TRADING_TEST_DATABASE_URL after the shadow migration")
    url = make_url(raw)
    assert url.host in {"localhost", "127.0.0.1"} and url.database.startswith("smart_stock_decision_qa_")
    schema = "shadow_receipt_test_" + uuid4().hex
    engine = create_async_engine(url.set(drivername="postgresql+asyncpg"), connect_args={"server_settings": {"search_path": schema+",public"}})
    async with engine.begin() as connection:
        await connection.execute(CreateSchema(schema))
        for table in ("decision_generation_captures", "trading_shadow_selections", "trading_shadow_outcomes"):
            await connection.execute(text(f'CREATE TABLE "{schema}".{table} (LIKE public.{table} INCLUDING ALL)'))
            await connection.execute(text(f'CREATE TRIGGER immutable_trading_capture BEFORE UPDATE OR DELETE ON "{schema}".{table} FOR EACH ROW EXECUTE FUNCTION public.guard_trading_capture_immutable()'))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        capture = empty_eligible_capture()
        async with factory() as session:
            session.add(DecisionGenerationCapture(id=capture.id, generation_id=capture.generation_id,
                exchange=capture.exchange, session_date=capture.session_date, observed_at=capture.observed_at,
                input_payload=capture.input_payload, result_payload=capture.result_payload))
            await session.commit()
            first = await record_shadow_selection(session, capture, Settings())
            assert first is not None and first.payload["empty_session"]
            assert first.payload["ranking_arms"] == first.payload["entry_arms"] == {"baseline": [], "challenger": []}
            stamp, digest = first.selected_at, first.record_hash
            second = await record_shadow_selection(session, capture, Settings())
            assert second.id == first.id and second.selected_at == stamp and second.record_hash == digest
            assert await session.scalar(select(func.count()).select_from(TradingShadowSelection)) == 1
            dataset = capture_dataset(capture)
            config = BacktestConfig(capture.exchange, capture.session_date, capture.session_date, horizons=(10,))
            await mature_shadow_outcomes(session, dataset, config)
            await mature_shadow_outcomes(session, dataset, config)
            assert await session.scalar(select(func.count()).select_from(TradingShadowOutcome)) == 1
            progress = await shadow_progress(session, exchange=capture.exchange)
            assert progress["empty_dates"] == 1 and progress["unknown_next_open_receipts"] == 1
            assert progress["eligible_cohort_dates"] == 0 and progress["promoted"] is False
            with pytest.raises(Exception, match="immutable"):
                await session.execute(text("UPDATE trading_shadow_selections SET record_hash='changed'"))
            await session.rollback()
    finally:
        async with engine.begin() as connection:
            await connection.execute(DropSchema(schema, cascade=True))
        await engine.dispose()
