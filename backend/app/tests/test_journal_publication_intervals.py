"""Actual overlay + repository proof of historical version/publication ordering."""
import os
from dataclasses import replace
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.schema import CreateSchema, DropSchema

from app.core.core_config import Settings
from app.core.enums import DataQualityFlag, ExchangeCode, MarketDataState
from app.jobs.market_session_schedule import DHAKA_TZ
from app.models import DailyPrice, MarketDataGeneration, TradingSourceObservation
from app.modules.market_data.market_data_repository import MarketDataRepository
from app.modules.market_data.price_publication_evidence import PRICE_PUBLICATION_CONTRACT, PRICE_PUBLICATION_SOURCE
from app.modules.market_data.published_generation import PublishedMarketGeneration
from app.modules.market_universe.market_universe_service import MarketUniverseService
from app.tests.test_canonical_generation_architecture import _canonical_fixture, _MemoryRedis
from app.tests.test_entry_applicability import terms

REFERENCE = date(2026, 11, 10)
DAY = date(2026, 11, 11)


def clock(hour, minute=0, day=DAY):
    return datetime.combine(day, datetime.min.time(), tzinfo=DHAKA_TZ).replace(hour=hour, minute=minute)


def body(stock_id, low, written, *, source=None, day=DAY):
    return {"id": str(uuid4()), "stock_id": str(stock_id), "trade_date": day.isoformat(),
        "open_price": 100, "high_price": 102, "low_price": low, "close_price": 100, "volume": 1000,
        "data_quality_flag": "OK", "source": "FIXTURE", "updated_at": written.isoformat(),
        "source_observed_at": source.isoformat() if source else None, "batch_fetched_at": written.isoformat()}


def event(payload, operation, observed, previous=None):
    return TradingSourceObservation(id=uuid4(), source_table="daily_prices", source_row_id=payload["id"],
        session_date=date.fromisoformat(payload["trade_date"]), operation=operation, observed_at=observed,
        finality="PROVISIONAL", payload=payload, previous_payload=previous)


def manifest(sync, cutoff, published):
    return MarketDataGeneration(id=uuid4(), exchange=ExchangeCode.DSE, trade_date=DAY, sync_id=sync,
        state=MarketDataState.FINALIZED, source="FIXTURE", source_last_synced_at=cutoff,
        published_at=published, fetched_count=1, accepted_count=1, suspicious_count=0)


CASES = [
    ("superseded-before-first", "ENTRY_TERMS_MET", False),
    ("cutoff-equals-replacement", "ENTRY_TERMS_MET", False),
    ("old-publication-then-correction", "STOP_BREACHED", False),
    ("unpublished-between-publishes", "ENTRY_TERMS_MET", False),
    ("source-recovered-undated", "STOP_BREACHED", False),
    ("source-recovered-after-close", "STOP_BREACHED", True),
    ("receipt-replay-open", "QUOTE_UNUSABLE", False),
    ("receipt-replay-after-close", "QUOTE_UNUSABLE", False),
    ("publication-replacement-tie", "PATH_INCOMPLETE", False),
    ("write-tie", "PATH_INCOMPLETE", False),
    ("journal-tie", "PATH_INCOMPLETE", False),
    ("delete-before-publication", "PATH_INCOMPLETE", False),
    ("published-before-delete", "STOP_BREACHED", False),
    ("missing-insert", "PATH_INCOMPLETE", False),
    ("unknown-operation", "PATH_INCOMPLETE", False),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("case,reason,pending", CASES)
async def test_actual_overlay_retains_only_versions_present_at_real_publications(monkeypatch, case, reason, pending):
    raw = os.getenv("TRADING_TEST_DATABASE_URL")
    if not raw:
        pytest.skip("Requires isolated local QA database")
    url = make_url(raw)
    assert url.host in {"localhost", "127.0.0.1"} and url.database.startswith("smart_stock_decision_qa_")
    schema = "journal_interval_"+uuid4().hex
    engine = create_async_engine(url.set(drivername="postgresql+asyncpg"), connect_args={"server_settings": {"search_path": schema+",public"}})
    async with engine.begin() as connection:
        await connection.execute(CreateSchema(schema))
        for name in ("stocks", "daily_prices", "daily_market_summaries", "market_data_generations", "trading_source_observations"):
            await connection.execute(text(f'CREATE TABLE "{schema}".{name} (LIKE public.{name} INCLUDING ALL)'))
        assert await connection.scalar(text("SELECT current_schema()")) == schema
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            stock, _, original, snapshot = _canonical_fixture()
            session.add(stock)
            low = body(stock.id, 95, clock(10, 5), source=clock(10, 5) if case.startswith("source-") else None)
            safe = body(stock.id, 99, clock(10, 30)); safe["id"] = low["id"]
            records = [event(low, "INSERT", clock(10, 5)+timedelta(seconds=1)), event(safe, "UPDATE", clock(10, 30)+timedelta(seconds=1), low)]
            pubs = []
            if case in {"superseded-before-first", "old-publication-then-correction", "unpublished-between-publishes", "write-tie"}:
                pubs = [manifest("late-final", clock(15), clock(15, 1))]
            if case == "old-publication-then-correction": pubs.insert(0, manifest("first-final", clock(10, 5), clock(10, 10)))
            if case == "cutoff-equals-replacement": pubs = [manifest("first-final", clock(10, 30), clock(15, 1))]
            if case == "unpublished-between-publishes":
                first = body(stock.id, 99, clock(10, 5)); first["id"] = low["id"]
                low = body(stock.id, 95, clock(10, 20)); low["id"] = first["id"]
                records = [event(first, "INSERT", clock(10, 5)+timedelta(seconds=1)), event(low, "UPDATE", clock(10, 20)+timedelta(seconds=1), first), records[-1]]
                records[-1].previous_payload = low
                pubs.insert(0, manifest("first-final", clock(10, 5), clock(10, 10)))
            if case == "publication-replacement-tie": pubs = [manifest("first-final", clock(10, 30), records[-1].observed_at)]
            if case == "write-tie":
                safe["updated_at"] = low["updated_at"]
                records[-1].payload = safe
                pubs.insert(0, manifest("first-final", clock(10, 5), clock(10, 10)))
            if case == "journal-tie":
                records[-1].observed_at = records[0].observed_at
                pubs = [manifest("first-final", clock(15), clock(15, 1))]
            if case in {"delete-before-publication", "published-before-delete"}:
                records = [records[0], event(low, "DELETE", clock(10, 30))]
                pubs = [manifest("after-delete", clock(15), clock(15, 1))] if case == "delete-before-publication" else [manifest("before-delete", clock(10, 5), clock(10, 10))]
            if case in {"missing-insert", "unknown-operation"}:
                records = [records[-1]]
                if case == "unknown-operation": records[0].operation = "UNKNOWN"
                pubs = [manifest("first-final", clock(15), clock(15, 1))]
            now_day = DAY if case == "source-recovered-after-close" else DAY+timedelta(days=1)
            now = clock(16 if case.endswith("after-close") else 11, day=now_day)
            current = safe
            if case.startswith("receipt-replay"):
                safe = body(stock.id, 95, clock(10, 30)); safe["id"] = low["id"]
                records = [records[0], event(safe, "UPDATE", clock(10, 30)+timedelta(seconds=1), low)]
                current = safe
            if case not in {"delete-before-publication", "published-before-delete"}:
                session.add(DailyPrice(id=UUID(current["id"]), stock_id=stock.id, trade_date=DAY,
                    open_price=100, high_price=102, low_price=current["low_price"], close_price=100, volume=1000,
                    source="FIXTURE", data_quality_flag=DataQualityFlag.OK,
                    updated_at=datetime.fromisoformat(current["updated_at"]), source_observed_at=None, batch_fetched_at=clock(10, 30)))
            if now_day > DAY:
                session.add(DailyPrice(id=uuid4(), stock_id=stock.id, trade_date=now_day,
                    open_price=100, high_price=102, low_price=95 if case.startswith("receipt-replay") else 99,
                    close_price=100, volume=1000, source="FIXTURE", data_quality_flag=DataQualityFlag.OK,
                    updated_at=now, source_observed_at=None if case.startswith("receipt-replay") else now, batch_fetched_at=now))
            # Global journal activation predates this plan; the candidate query
            # does not receive this unrelated sentinel as price evidence.
            sentinel = {"stock_id": str(uuid4()), "trade_date": REFERENCE.isoformat()}
            session.add(TradingSourceObservation(id=uuid4(), source_table="daily_prices", source_row_id="activation",
                session_date=REFERENCE, observed_at=clock(9, day=REFERENCE)-timedelta(days=1), operation="INSERT", finality="PROVISIONAL", payload=sentinel))
            # Explicit immutable membership for these controlled publications.
            # The ambiguous legacy clock cases intentionally have no attestation.
            certificates = []
            if case not in {"publication-replacement-tie", "write-tie", "journal-tie"}:
                for pub in pubs:
                    members = [change for change in records if change.observed_at < pub.published_at]
                    member = members[-1].payload if members and members[-1].operation != "DELETE" else None
                    certificates.append(TradingSourceObservation(id=uuid4(), source_table=PRICE_PUBLICATION_SOURCE,
                        source_row_id=str(pub.id), session_date=DAY, operation="PUBLISH", observed_at=pub.published_at,
                        finality="FINALIZED", payload={"contract": PRICE_PUBLICATION_CONTRACT, "manifest_id": str(pub.id),
                            "sync_id": pub.sync_id, "exchange": "DSE", "trade_date": DAY.isoformat(),
                            "source_last_synced_at": pub.source_last_synced_at.isoformat(), "price_versions": [member] if member else []}))
            session.add_all(records+pubs+certificates); await session.commit()
            repository = MarketDataRepository(session)
            repository.list_entry_basis_events = AsyncMock(return_value={})
            plan_time = clock(16, day=REFERENCE)
            generation = replace(snapshot.generation, trade_date=REFERENCE, published_at=plan_time, source_last_synced_at=plan_time)
            plan = original.analysis.trade_plan.model_copy(update=vars(terms()))
            row = original.model_copy(update={"decision": original.decision.model_copy(update={"display_action": "POTENTIAL_BUY"}),
                "eligibility": original.eligibility.model_copy(update={"status": "ELIGIBLE"}),
                "analysis": original.analysis.model_copy(update={"trade_plan": plan})})
            snapshot = replace(snapshot, generation=generation, payload=snapshot.payload.model_copy(update={"rows": [row], "session_trade_date": REFERENCE}))
            decision_publication = SimpleNamespace(generation_id=generation.sync_id, session_date=REFERENCE, observed_at=plan_time, invalidated_at=None)
            async def latest(*, before_date=None, **kwargs): return None if before_date else decision_publication
            durable = SimpleNamespace(latest_publication=AsyncMock(side_effect=latest), publication_coverage=AsyncMock(return_value={
                "universe_membership": [str(stock.id)], "input_keys": [str(stock.id)], "excluded_members": [],
                "membership_provenance": {"status": "OBSERVED_INDEPENDENT_LISTED_SET", "observed_at": plan_time.isoformat(), "listed_count": 1, "market_coverage_verified": True}}))
            service = MarketUniverseService(repository, object(), _MemoryRedis(), Settings(), durable)
            quote_context = PublishedMarketGeneration(trade_date=now_day, sync_id="live-q", data_state=MarketDataState.FINALIZATION_PENDING if now.hour == 16 else MarketDataState.LIVE,
                source_last_synced_at=now, published_at=now)
            service.resolve_generation_context = AsyncMock(return_value=generation)
            service.resolve_quote_context = AsyncMock(return_value=quote_context)
            class Clock(datetime):
                @classmethod
                def now(cls, tz=None): return now.astimezone(tz) if tz else now.replace(tzinfo=None)
            monkeypatch.setattr("app.modules.market_universe.market_universe_service.datetime", Clock)
            from app.modules.stock_details.decision import entry_applicability as entry
            real_path, real_evaluate = entry.build_entry_path_facts, entry.evaluate_entry_applicability
            captured = {}
            def path_capture(**kwargs):
                captured["path"] = real_path(**kwargs); return captured["path"]
            def evaluate_capture(**kwargs):
                captured["pending"] = kwargs["session_settling"]; return real_evaluate(**kwargs)
            monkeypatch.setattr(entry, "build_entry_path_facts", path_capture)
            monkeypatch.setattr(entry, "evaluate_entry_applicability", evaluate_capture)
            result = await service.project_current_entries(snapshot, exchange=ExchangeCode.DSE, price_basis_v2=True)
            assert result.rows[0].entry_applicability.reason_code == reason
            assert captured["pending"] is pending
            if case.startswith("source-"):
                assert DAY in captured["path"].sessions and DAY in captured["path"].ended_sessions
                assert (DAY, 95.0) in captured["path"].reliable_lows
            if case.startswith("receipt-replay"):
                assert not captured["path"].reliable_lows
            if case in {"superseded-before-first", "cutoff-equals-replacement", "unpublished-between-publishes"}:
                assert (DAY, 95.0) not in captured["path"].reliable_lows
            if case in {"superseded-before-first", "receipt-replay-open"}:
                legacy = await service.project_current_entries(snapshot, exchange=ExchangeCode.DSE, price_basis_v2=False)
                assert legacy.rows[0].entry_applicability.reason_code == "STOP_BREACHED"
    finally:
        async with engine.begin() as connection: await connection.execute(DropSchema(schema, cascade=True))
        await engine.dispose()
