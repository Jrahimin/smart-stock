"""Producer/trigger/public overlay controls for immutable price membership."""
import json
import os
from dataclasses import replace
from datetime import datetime, timedelta
from time import perf_counter
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import event, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.schema import CreateSchema, DropSchema

from app.core.core_config import Settings
from app.core.enums import ExchangeCode, MarketDataState
from app.jobs.market_session_schedule import DHAKA_TZ, entry_quote_session
from app.models import DailyMarketSummary, DailyPrice, Stock, TradingSourceObservation
from app.modules.market_data.market_data_repository import MarketDataRepository
from app.modules.market_data.market_data_service import MarketDataService
from app.modules.market_data.price_publication_evidence import PRICE_PUBLICATION_SOURCE
from app.modules.market_data.published_generation import PublishedMarketGeneration
from app.modules.market_universe.market_universe_service import MarketUniverseService
from app.tests.test_canonical_generation_architecture import _canonical_fixture, _MemoryRedis
from app.tests.test_entry_applicability import terms


@pytest_asyncio.fixture
async def price_db():
    raw = os.getenv("TRADING_TEST_DATABASE_URL")
    if not raw:
        pytest.skip("Requires isolated local QA database")
    url = make_url(raw)
    assert url.host in {"localhost", "127.0.0.1"} and url.database.startswith("smart_stock_decision_qa_")
    schema = "price_members_"+uuid4().hex
    engine = create_async_engine(url.set(drivername="postgresql+asyncpg"), connect_args={"server_settings": {"search_path": schema+",public"}})
    async with engine.begin() as connection:
        await connection.execute(CreateSchema(schema))
        for name in ("stocks", "daily_prices", "daily_market_summaries", "market_data_generations", "trading_source_observations"):
            await connection.execute(text(f'CREATE TABLE "{schema}".{name} (LIKE public.{name} INCLUDING ALL)'))
        assert await connection.scalar(text("SELECT current_schema()")) == schema
        assert await connection.scalar(text("SELECT relnamespace::regnamespace::text FROM pg_class WHERE oid=to_regclass('trading_source_observations')")) == schema
        await connection.execute(text(f'CREATE TRIGGER membership_journal AFTER INSERT OR UPDATE OR DELETE ON "{schema}".daily_prices FOR EACH ROW EXECUTE FUNCTION public.capture_trading_source_revision()'))
    try:
        yield engine, async_sessionmaker(engine, expire_on_commit=False)
    finally:
        async with engine.begin() as connection:
            await connection.execute(DropSchema(schema, cascade=True))
        await engine.dispose()


def price(stock_id, day, low=99, source=None):
    return DailyPrice(stock_id=stock_id, trade_date=day, open_price=100, high_price=102,
        low_price=low, close_price=100, volume=1000, data_quality_flag="OK", source="FIXTURE",
        source_observed_at=source, batch_fetched_at=datetime.now(DHAKA_TZ))


async def activate(session, reference):
    session.add(TradingSourceObservation(source_table="daily_prices", source_row_id="activation", session_date=reference,
        operation="INSERT", observed_at=datetime.combine(reference-timedelta(days=1), datetime.min.time(), tzinfo=DHAKA_TZ),
        finality="PROVISIONAL", payload={"stock_id": str(uuid4()), "trade_date": reference.isoformat()}))
    await session.commit()


async def overlay(session, monkeypatch, stocks, reference, assessed, quote_context, *, selected=None, actions=None):
    _, _, original, snapshot = _canonical_fixture()
    published = datetime.combine(reference, datetime.min.time(), tzinfo=DHAKA_TZ).replace(hour=16)
    generation = replace(snapshot.generation, trade_date=reference, source_last_synced_at=published, published_at=published)
    rows = [original.model_copy(update={"stock": original.stock.model_copy(update={"id": stock.id, "symbol": stock.symbol}),
        "decision": original.decision.model_copy(update={"display_action": (actions or {}).get(stock.id, "POTENTIAL_BUY")}),
        "eligibility": original.eligibility.model_copy(update={"status": "ELIGIBLE"}),
        "analysis": original.analysis.model_copy(update={"trade_plan": original.analysis.trade_plan.model_copy(update=vars(terms()))})}) for stock in stocks]
    snapshot = replace(snapshot, generation=generation, payload=snapshot.payload.model_copy(update={"rows": rows, "session_trade_date": reference}))
    publication = SimpleNamespace(generation_id=generation.sync_id, session_date=reference, observed_at=published, invalidated_at=None)
    async def latest(*, before_date=None, **kwargs): return None if before_date else publication
    durable = SimpleNamespace(latest_publication=AsyncMock(side_effect=latest), publication_coverage=AsyncMock(return_value={
        "universe_membership": [str(stock.id) for stock in stocks], "input_keys": [str(stock.id) for stock in stocks], "excluded_members": [],
        "membership_provenance": {"status": "OBSERVED_INDEPENDENT_LISTED_SET", "observed_at": published.isoformat(), "listed_count": len(stocks), "market_coverage_verified": True}}))
    repository = MarketDataRepository(session)
    repository.list_entry_basis_events = AsyncMock(return_value={})
    service = MarketUniverseService(repository, object(), _MemoryRedis(), Settings(), durable)
    service.resolve_generation_context = AsyncMock(return_value=generation)
    service.resolve_quote_context = AsyncMock(return_value=quote_context)
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None): return assessed.astimezone(tz) if tz else assessed.replace(tzinfo=None)
    monkeypatch.setattr("app.modules.market_universe.market_universe_service.datetime", Clock)
    from app.modules.stock_details.decision import entry_applicability as entry
    real_path, real_evaluate = entry.build_entry_path_facts, entry.evaluate_entry_applicability
    paths, pending = [], []
    def capture_path(**kwargs):
        result = real_path(**kwargs); paths.append(result); return result
    def capture_evaluate(**kwargs):
        pending.append(kwargs["session_settling"]); return real_evaluate(**kwargs)
    with monkeypatch.context() as local:
        local.setattr(entry, "build_entry_path_facts", capture_path)
        local.setattr(entry, "evaluate_entry_applicability", capture_evaluate)
        result = await service.project_current_entries(snapshot, exchange=ExchangeCode.DSE, stock_ids=selected, price_basis_v2=True)
    projected = {row.stock.id: row.entry_applicability for row in result.rows if row.entry_applicability is not None}
    return projected, paths, pending


@pytest.mark.parametrize("case", ["95-to-99", "99-to-95-recovered", "ordinary-close", "source-low-recovered", "legacy-clock"])
async def test_normal_same_transaction_publisher_and_live_promotion(price_db, monkeypatch, case):
    _, sessions = price_db
    async with sessions() as session:
        assessed = datetime.now(DHAKA_TZ)+timedelta(minutes=1)
        # Assess after the next close if the real local test clock is intraday.
        assessed = max(assessed, assessed.replace(hour=16, minute=0, second=0))
        day = entry_quote_session(assessed, Settings())[1].date()
        reference = day-timedelta(days=1)
        stock = Stock(id=uuid4(), symbol="MEMBER", name="Publication fixture", exchange=ExchangeCode.DSE)
        session.add(stock); await session.commit(); await activate(session, reference)
        row = price(stock.id, day, 95 if case in {"95-to-99", "source-low-recovered", "legacy-clock"} else 99,
            datetime.combine(day, datetime.min.time(), tzinfo=DHAKA_TZ).replace(hour=11) if case == "source-low-recovered" else None)
        session.add(row); await session.commit()
        transaction_start = await session.scalar(text("SELECT now()"))
        row.low_price = 95 if case == "99-to-95-recovered" else 98 if case == "ordinary-close" else 99
        row.source_observed_at = None
        await session.flush()
        await session.refresh(row)
        assert row.updated_at == transaction_start
        repository = MarketDataRepository(session)
        publisher = MarketDataService(repository, None)
        if case == "legacy-clock":
            # Historical un-attested protocol: promotion cannot infer members.
            generation = await repository.create_market_data_generation(exchange=ExchangeCode.DSE, trade_date=day,
                sync_id="legacy-clock", state=MarketDataState.LIVE, source="FIXTURE", source_last_synced_at=row.updated_at,
                fetched_count=1, accepted_count=1, suspicious_count=0)
            await session.commit(); sync = generation.sync_id
        else:
            sync = await publisher.publish_market_generation(exchange=ExchangeCode.DSE, trade_date=day, state=MarketDataState.LIVE,
                source="FIXTURE", fetched_count=1, accepted_count=1, suspicious_count=0)
        live = await repository.get_market_data_generation_by_sync_id(exchange=ExchangeCode.DSE, sync_id=sync)
        published_at = live.published_at
        known_before_promotion = await session.scalar(text("SELECT clock_timestamp()"))
        session.add(DailyMarketSummary(exchange=ExchangeCode.DSE, trade_date=day, index_name="DSEX", is_finalized=True, source="FIXTURE"))
        await session.commit()
        assert await publisher.publish_finalized_market_generation(exchange=ExchangeCode.DSE, trade_date=day) == sync
        assert live.published_at == published_at
        prior_knowledge = await repository.list_finalized_price_publications(exchange=ExchangeCode.DSE,
            start_date=day-timedelta(days=1), end_date=day, known_by=known_before_promotion)
        assert not any(item.price_versions for item in prior_knowledge)
        if case == "99-to-95-recovered":
            row.low_price = 99
            row.source_observed_at = datetime.combine(day, datetime.min.time(), tzinfo=DHAKA_TZ).replace(hour=14)
            await session.commit()
        # Knowledge includes the real trigger writes and promotion, not fixture clocks.
        assessed = max(assessed, datetime.now(DHAKA_TZ)+timedelta(seconds=1))
        context = PublishedMarketGeneration(trade_date=day, sync_id=sync, data_state=MarketDataState.FINALIZED,
            source_last_synced_at=live.source_last_synced_at, published_at=live.published_at)
        projected, paths, _ = await overlay(session, monkeypatch, [stock], reference, assessed, context)
        expected = "STOP_BREACHED" if case in {"99-to-95-recovered", "source-low-recovered"} else "QUOTE_UNUSABLE" if case == "legacy-clock" else "ENTRY_TERMS_MET"
        assert projected[stock.id].reason_code == expected
        if expected == "ENTRY_TERMS_MET":
            assert projected[stock.id].price_basis == "LAST_CLOSE" and paths[0].complete
            assert (day, 95.0) not in paths[0].reliable_lows
        if case == "99-to-95-recovered": assert (day, 95.0) in paths[0].reliable_lows
        journal = list((await session.scalars(select(TradingSourceObservation).where(TradingSourceObservation.source_table == PRICE_PUBLICATION_SOURCE))).all())
        if case == "legacy-clock": assert not journal
        else:
            capture = next(item for item in journal if item.operation == "PUBLISH")
            assert next(item for item in journal if item.operation == "FINALIZE").payload["capture_id"] == str(capture.id)
            assert float(capture.payload["price_versions"][0]["low_price"]) == (95 if case == "99-to-95-recovered" else 98 if case == "ordinary-close" else 99)


@pytest.mark.parametrize("state", ["open", "pending", "closed"])
@pytest.mark.parametrize("action", ["POTENTIAL_BUY", "WAIT"])
async def test_exchange_calendar_is_independent_of_requested_ids_and_candidate_actions(price_db, monkeypatch, state, action):
    _, sessions = price_db
    async with sessions() as session:
        day = datetime.now(DHAKA_TZ).date()+timedelta(days=7)
        while day.weekday() != 3: day += timedelta(days=1)
        missing = datetime.now(DHAKA_TZ).date()-timedelta(days=2)
        reference = missing-timedelta(days=1)
        assessed = datetime.combine(day, datetime.min.time(), tzinfo=DHAKA_TZ).replace(hour=11 if state == "open" else 16)
        stocks = [Stock(id=uuid4(), symbol=name, name=name, exchange=ExchangeCode.DSE) for name in ("PROVEN_A", "MISSING_B")]
        session.add_all(stocks); await session.commit(); await activate(session, reference)
        old = price(stocks[0].id, missing, 95, datetime.combine(missing, datetime.min.time(), tzinfo=DHAKA_TZ).replace(hour=11))
        # Its source clock predates the real trigger observation; recovery
        # removes that clock from the mutable row, leaving only the journal.
        session.add(old)
        await session.commit()
        old.low_price = 99; old.source_observed_at = None; await session.commit()
        for stock in stocks:
            session.add(price(stock.id, day, 99, assessed.replace(hour=10 if state == "open" else 14, minute=55)))
        await session.commit()
        context = PublishedMarketGeneration(trade_date=day, sync_id=state, data_state=MarketDataState.FINALIZATION_PENDING if state == "pending" else MarketDataState.LIVE,
            source_last_synced_at=assessed, published_at=assessed)
        repository = MarketDataRepository(session)
        if state == "closed":
            sync = await MarketDataService(repository, None).publish_market_generation(exchange=ExchangeCode.DSE, trade_date=day, state=MarketDataState.FINALIZED,
                source="controlled-final-fixture", fetched_count=2, accepted_count=2, suspicious_count=0)
            manifest = await repository.get_market_data_generation_by_sync_id(exchange=ExchangeCode.DSE, sync_id=sync)
            context = replace(context, sync_id=sync, data_state=MarketDataState.FINALIZED,
                source_last_synced_at=manifest.source_last_synced_at, published_at=manifest.published_at)
        dates = await repository.list_authenticated_exchange_session_dates(exchange=ExchangeCode.DSE, start_date=reference, end_date=day, known_by=assessed)
        assert missing in dates and day in dates
        for order, selected in ((stocks, None), (list(reversed(stocks)), None), (stocks, {stocks[1].id}), ([stocks[1]], None), ([stocks[0]], None)):
            projected, paths, settling = await overlay(session, monkeypatch, order, reference, assessed, context,
                selected=selected, actions={stocks[0].id: action})
            if stocks[1].id in projected:
                assert projected[stocks[1].id].reason_code == ("SESSION_SETTLING" if state == "pending" else "PATH_INCOMPLETE")
            if stocks[0].id in projected and action == "POTENTIAL_BUY":
                assert projected[stocks[0].id].reason_code == "STOP_BREACHED"
            assert all(missing in path.sessions for path in paths)
            if state != "open":
                assert all(missing in path.ended_sessions and day in path.ended_sessions for path in paths)
                if state == "pending": assert all(settling)
                else: assert not any(settling)
        # Receipt-only rows cannot add a date to the same exchange calendar.
        replay_day = day-timedelta(days=1)
        session.add(price(stocks[1].id, replay_day, 95)); await session.commit()
        assert replay_day not in await repository.list_authenticated_exchange_session_dates(exchange=ExchangeCode.DSE, start_date=reference, end_date=day, known_by=assessed)


@pytest.mark.parametrize("raw_replaced", [False, True])
async def test_decision_revision_inherits_exact_parent_membership_and_live_promotion(price_db, raw_replaced):
    _, sessions = price_db
    async with sessions() as session:
        stock = Stock(id=uuid4(), symbol="REVISION", name="Revision fixture", exchange=ExchangeCode.DSE)
        session.add(stock); await session.commit()
        day = datetime.now(DHAKA_TZ).date()
        row = price(stock.id, day); session.add(row)
        repository = MarketDataRepository(session)
        publisher = MarketDataService(repository, None)
        sync = await publisher.publish_market_generation(exchange=ExchangeCode.DSE, trade_date=day, state=MarketDataState.LIVE,
            source="FIXTURE", fetched_count=1, accepted_count=1, suspicious_count=0)
        parent = await repository.get_market_data_generation_by_sync_id(exchange=ExchangeCode.DSE, sync_id=sync)
        context = PublishedMarketGeneration(trade_date=day, sync_id=sync, data_state=MarketDataState.LIVE,
            source_last_synced_at=parent.source_last_synced_at, published_at=parent.published_at)
        if raw_replaced:
            row.low_price = 95; await session.flush()
        publisher._resolve_published_market_generation = AsyncMock(return_value=context)
        child_sync = await publisher.publish_decision_input_revision(exchange=ExchangeCode.DSE, source="decision-only-correction")
        child = await repository.get_market_data_generation_by_sync_id(exchange=ExchangeCode.DSE, sync_id=child_sync)
        assert child.source_last_synced_at == parent.source_last_synced_at
        session.add(DailyMarketSummary(exchange=ExchangeCode.DSE, trade_date=day, index_name="DSEX", is_finalized=True, source="FIXTURE")); await session.commit()
        assert await publisher.publish_finalized_market_generation(exchange=ExchangeCode.DSE, trade_date=day) == child_sync
        evidence = await repository.list_finalized_price_publications(exchange=ExchangeCode.DSE, start_date=day-timedelta(days=1), end_date=day, known_by=datetime.now(DHAKA_TZ)+timedelta(seconds=1))
        assert len(evidence) == 1 and float(evidence[0].price_versions[0]["low_price"]) == 99
        universe = MarketUniverseService(repository, object(), object(), Settings())
        child_context = replace(context, sync_id=child_sync, data_state=MarketDataState.FINALIZED)
        expected = "UNAVAILABLE" if raw_replaced else "FINALIZED"
        assert (await universe.get_display_quotes({stock.id}, context=child_context, price_basis_v2=True))[stock.id].observation_status == expected
        publisher._resolve_published_market_generation = AsyncMock(return_value=child_context)
        final_revision = await publisher.publish_decision_input_revision(exchange=ExchangeCode.DSE, source="second-decision-only-correction")
        final_context = replace(child_context, sync_id=final_revision)
        assert (await universe.get_display_quotes({stock.id}, context=final_context, price_basis_v2=True))[stock.id].observation_status == expected
        republished = await publisher.publish_market_generation(exchange=ExchangeCode.DSE, trade_date=day, state=MarketDataState.FINALIZED,
            source="real-price-correction", fetched_count=1, accepted_count=1, suspicious_count=0)
        assert (await universe.get_display_quotes({stock.id}, context=replace(final_context, sync_id=republished), price_basis_v2=True))[stock.id].observation_status == "FINALIZED"


async def test_snapshot_membership_rejects_concurrent_old_transaction_replacement(price_db):
    _, sessions = price_db
    async with sessions() as session, sessions() as concurrent:
        stock = Stock(id=uuid4(), symbol="CONCURRENT", name="Concurrent fixture", exchange=ExchangeCode.DSE)
        session.add(stock); await session.commit()
        day = datetime.now(DHAKA_TZ).date()
        row = price(stock.id, day); session.add(row); await session.commit()
        replacement = await concurrent.get(DailyPrice, row.id)
        old_transaction = await concurrent.scalar(text("SELECT now()"))
        repository = MarketDataRepository(session)
        publisher = MarketDataService(repository, None)
        # The publisher cannot see another connection's uncommitted replacement.
        replacement.low_price = 95; await concurrent.flush()
        await concurrent.refresh(replacement)
        # A second visible row advances the shared cutoff beyond the earlier
        # transaction's timestamp. Cutoff alone would falsely admit its low.
        other = Stock(id=uuid4(), symbol="CUTOFF", name="Cutoff control", exchange=ExchangeCode.DSE)
        session.add(other); await session.flush()
        session.add(price(other.id, day))
        sync = await publisher.publish_market_generation(exchange=ExchangeCode.DSE, trade_date=day, state=MarketDataState.FINALIZED,
            source="FIXTURE", fetched_count=2, accepted_count=2, suspicious_count=0)
        manifest = await repository.get_market_data_generation_by_sync_id(exchange=ExchangeCode.DSE, sync_id=sync)
        assert float((await repository.list_finalized_price_publications(exchange=ExchangeCode.DSE, start_date=day-timedelta(days=1), end_date=day, known_by=datetime.now(DHAKA_TZ)+timedelta(seconds=1)))[0].price_versions[0]["low_price"]) == 99
        context = PublishedMarketGeneration(trade_date=day, sync_id=sync, data_state=MarketDataState.FINALIZED,
            source_last_synced_at=manifest.source_last_synced_at, published_at=manifest.published_at)
        await concurrent.commit(); session.expire_all()
        await session.refresh(stock)
        universe = MarketUniverseService(repository, object(), object(), Settings())
        assert replacement.updated_at == old_transaction
        assert old_transaction <= context.source_last_synced_at
        assert (await universe.get_display_quotes({stock.id}, context=context, price_basis_v2=True))[stock.id].observation_status == "UNAVAILABLE"


async def test_membership_426_row_payload_and_batched_read_cost(price_db, capsys):
    engine, sessions = price_db
    async with sessions() as session:
        day = datetime.now(DHAKA_TZ).date()
        stocks = [Stock(id=uuid4(), symbol=f"SIZE{index:03}", name="Representative membership fixture", exchange=ExchangeCode.DSE) for index in range(426)]
        session.add_all(stocks); await session.flush()
        session.add_all([price(stock.id, day) for stock in stocks])
        repository = MarketDataRepository(session)
        publisher = MarketDataService(repository, None)
        start = perf_counter()
        await publisher.publish_market_generation(exchange=ExchangeCode.DSE, trade_date=day, state=MarketDataState.FINALIZED,
            source="FIXTURE", fetched_count=426, accepted_count=426, suspicious_count=0)
        publish_ms = (perf_counter()-start)*1000
        capture = await session.scalar(select(TradingSourceObservation).where(TradingSourceObservation.source_table == PRICE_PUBLICATION_SOURCE))
        statements = []
        def count_sql(*args): statements.append(args[2])
        event.listen(engine.sync_engine, "before_cursor_execute", count_sql)
        try:
            start = perf_counter()
            evidence = await repository.list_finalized_price_publications(exchange=ExchangeCode.DSE, start_date=day-timedelta(days=1), end_date=day, known_by=datetime.now(DHAKA_TZ)+timedelta(seconds=1))
            read_ms = (perf_counter()-start)*1000
        finally:
            event.remove(engine.sync_engine, "before_cursor_execute", count_sql)
        assert len(evidence[0].price_versions) == 426 and len(statements) == 2
        # New record kinds do not enter price-history/replay source inventory.
        _, revisions, _ = await repository.list_entry_path_observations(stock_ids={stocks[0].id}, start_date=day-timedelta(days=1), end_date=day)
        assert revisions and all(item.source_table == "daily_prices" for item in revisions)
        with capsys.disabled():
            print(f"MEMBERSHIP_426 payload_bytes={len(json.dumps(capture.payload).encode())} publication_ms={publish_ms:.2f} read_ms={read_ms:.2f} read_queries={len(statements)}")
