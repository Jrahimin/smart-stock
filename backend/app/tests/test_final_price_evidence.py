"""Actual decoder/projector/path/evaluator regressions for the final review."""
from dataclasses import replace
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.core_config import Settings
from app.core.enums import ExchangeCode, MarketDataState
from app.jobs.ingestion.amarstock_http_client import AmarStockHttpResponse
from app.jobs.ingestion.amarstock_msgpack_market_data_source import AmarStockMarketSnapshotSource
from app.jobs.market_session_schedule import DHAKA_TZ
from app.modules.market_data.published_generation import PublishedMarketGeneration
from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead
from app.modules.market_universe.market_universe_service import MarketUniverseService
from app.modules.stock_details.decision.display_metrics import build_quote_projection
from app.modules.stock_details.decision.entry_applicability import build_entry_path_facts, evaluate_entry_applicability
from app.tests.test_amarstock_msgpack_market_data_source import _pack
from app.tests.test_entry_applicability import terms


NOW = datetime(2026, 11, 12, 11, tzinfo=DHAKA_TZ)
PUBLISHED = NOW.replace(day=11, hour=16)


def path(prices, *, revisions=(), v2=True, cutoffs=None, publications=()):
    return build_entry_path_facts(prices=prices, revisions=revisions, sessions=[NOW.date()], completed_sessions=[],
        reference_date=PUBLISHED.date(), published_at=PUBLISHED, journal_started_at=PUBLISHED-timedelta(days=1),
        published_price_cutoffs=cutoffs or {}, price_basis_v2=v2, assessed_at=NOW, price_publications=publications)


def evaluate(quote, facts, *, v2=True, now=NOW, **kwargs):
    return evaluate_entry_applicability(decision=SimpleNamespace(display_action="POTENTIAL_BUY", blocker_codes=[]),
        plan=terms(preferred_entry_zone_low=119, preferred_entry_zone_high=122, entry_zone_low=119, entry_zone_high=122,
            stop_loss=117, invalidation_price=117, target_low=130), eligibility=SimpleNamespace(status="ELIGIBLE"), quote=quote,
        reference_date=PUBLISHED.date(), now=now, coverage_verified=True, path=facts, publication_observed_at=PUBLISHED,
        price_basis_v2=v2, **{"market_open": True, **kwargs})


@pytest.mark.asyncio
async def test_actual_undated_decoder_cross_day_replay_cannot_create_permanent_v2_breach():
    transport = AsyncMock()
    source = AmarStockMarketSnapshotSource(base_url="http://fixture", snapshot_path="/fixture", max_retries=1,
        retry_delay_seconds=0, max_response_bytes=1000000, max_last_modified_age_days=7, client=transport)
    bars = []
    for day in (11, 12):
        received = NOW.replace(day=day)
        transport.fetch_bytes.return_value = AmarStockHttpResponse(body=_pack(), status=200,
            content_type="application/x-msgpack", headers={}, received_at=received)
        incoming = (await source.fetch_daily_prices(received.date()))[0]
        bars.append(SimpleNamespace(**{**incoming.model_dump(), "updated_at": received, "price_change_percent": None, "price_change": None}))
    assert bars[0].low_price == bars[1].low_price == 117
    quote = DisplayQuoteRead(**build_quote_projection(bars, finality="LIVE", session_date=NOW.date()))
    replay_path = path(bars)
    assert replay_path.reliable_lows == () and not replay_path.complete
    assert evaluate(quote, replay_path).reason_code == "QUOTE_UNUSABLE"
    # Legacy semantics deliberately remain isolated from the v2 evidence rule.
    assert evaluate(quote, path(bars, v2=False), v2=False).reason_code == "STOP_BREACHED"
    old_payload = {**vars(bars[1]), "trade_date": NOW.date().isoformat(), "low_price": 116,
        "updated_at": NOW.isoformat(), "source_observed_at": None}
    revision = SimpleNamespace(session_date=NOW.date(), observed_at=NOW, payload=old_payload, previous_payload=old_payload)
    assert not path([], revisions=[revision]).reliable_lows


@pytest.mark.parametrize("source_confirmed", [True, False])
def test_genuine_source_or_published_breach_survives_price_recovery(source_confirmed):
    low_time = NOW-timedelta(minutes=15)
    low = dict(id=str(uuid4()), trade_date=NOW.date().isoformat(), open_price=120, high_price=123, low_price=116,
        close_price=120, volume=1000, data_quality_flag="OK", updated_at=low_time.isoformat(),
        source_observed_at=low_time.isoformat() if source_confirmed else None)
    recovered = SimpleNamespace(**{**low, "trade_date": NOW.date(), "low_price": 119,
        "updated_at": NOW, "source_observed_at": NOW if source_confirmed else None})
    revision = SimpleNamespace(source_row_id=low["id"], operation="UPDATE", session_date=NOW.date(), observed_at=NOW, payload={**low, "low_price": 119, "updated_at": NOW.isoformat()}, previous_payload=low)
    inserted = SimpleNamespace(source_row_id=low["id"], operation="INSERT", session_date=NOW.date(), observed_at=low_time+timedelta(seconds=1), payload=low, previous_payload=None)
    publications = [] if source_confirmed else [SimpleNamespace(trade_date=NOW.date(), source_last_synced_at=low_time,
        published_at=low_time+timedelta(seconds=2), evidence_observed_at=low_time+timedelta(seconds=2), price_versions=(low,))]
    facts = path([recovered], revisions=[inserted, revision], cutoffs={} if source_confirmed else {NOW.date(): low_time}, publications=publications)
    quote = DisplayQuoteRead(current_price=120, volume=1000, as_of_trade_date=NOW.date().isoformat(),
        observation_session_date=NOW.date().isoformat(), observation_status="PROVISIONAL", data_quality="OK", source_observed_at=NOW)
    assert (NOW.date(), 116.0) in facts.reliable_lows
    assert evaluate(quote, facts).reason_code == "STOP_BREACHED"


@pytest.mark.asyncio
@pytest.mark.parametrize("case", ["published", "post-cutoff", "republished", "summary-only"])
async def test_real_quote_projector_requires_exact_durable_closing_publication(case):
    stock_id = uuid4()
    close = NOW.replace(hour=15, minute=30)
    row_time = close-timedelta(minutes=1) if case == "published" else close+timedelta(minutes=1)
    cutoff = row_time if case == "republished" else close
    context = PublishedMarketGeneration(trade_date=NOW.date(), sync_id="legacy-summary" if case == "summary-only" else "real-publication",
        data_state=MarketDataState.FINALIZED, source_last_synced_at=cutoff, published_at=cutoff)
    from app.core.enums import DataQualityFlag
    row = SimpleNamespace(stock_id=stock_id, trade_date=NOW.date(), open_price=120, high_price=123, low_price=119,
        close_price=120, volume=1000, data_quality_flag=DataQualityFlag.OK, source="FIXTURE", updated_at=row_time,
        source_observed_at=None, batch_fetched_at=row_time, previous_close_price=None, price_change_percent=None, price_change=None)
    manifest = None if case == "summary-only" else SimpleNamespace(sync_id=context.sync_id, trade_date=NOW.date(),
        state=MarketDataState.FINALIZED, accepted_count=1, source_last_synced_at=cutoff)
    evidence = SimpleNamespace(sync_id=context.sync_id, evidence_observed_at=cutoff, price_versions=({**vars(row)},))
    repository = SimpleNamespace(list_quote_price_observations=AsyncMock(return_value=[row]),
        get_market_data_generation_by_sync_id=AsyncMock(return_value=manifest),
        list_finalized_price_publications=AsyncMock(return_value=[evidence] if manifest else []))
    service = MarketUniverseService(repository, object(), object(), Settings())
    quote = (await service.get_display_quotes({stock_id}, context=context, exchange=ExchangeCode.DSE, price_basis_v2=True))[stock_id]
    facts = path([])
    result = evaluate(quote, replace(facts, complete=True), now=close+timedelta(hours=1), market_open=False,
        session_close_at=NOW.replace(hour=15), finalized_session_date=NOW.date() if manifest else None,
        recheck_at=NOW+timedelta(days=3))
    if case in {"published", "republished"}:
        assert quote.observation_status == "FINALIZED" and result.status == "APPLICABLE"
    else:
        assert quote.observation_status == "UNAVAILABLE" and result.status == "UNVERIFIED"
    legacy = (await service.get_display_quotes({stock_id}, context=context, price_basis_v2=False))[stock_id]
    assert legacy.observation_status == "FINALIZED"  # unchanged legacy display fallback


@pytest.mark.asyncio
@pytest.mark.parametrize("evidence", ["undated", "source", "published"])
async def test_actual_database_journal_previous_payload_retains_only_proven_breaches(evidence):
    import os
    from sqlalchemy import text
    from sqlalchemy.engine import make_url
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.schema import CreateSchema, DropSchema
    from app.models import DailyMarketSummary, DailyPrice, Stock
    from app.modules.market_data.market_data_repository import MarketDataRepository

    raw = os.getenv("TRADING_TEST_DATABASE_URL")
    if not raw:
        pytest.skip("Requires isolated local QA database")
    url = make_url(raw)
    assert url.host in {"localhost", "127.0.0.1"} and url.database.startswith("smart_stock_decision_qa_")
    schema = "final_evidence_"+uuid4().hex
    engine = create_async_engine(url.set(drivername="postgresql+asyncpg"), connect_args={"server_settings": {"search_path": schema+",public"}})
    async with engine.begin() as connection:
        await connection.execute(CreateSchema(schema))
        for name in ("stocks", "daily_prices", "daily_market_summaries", "market_data_generations", "trading_source_observations"):
            await connection.execute(text(f'CREATE TABLE "{schema}".{name} (LIKE public.{name} INCLUDING ALL)'))
        assert await connection.scalar(text("SELECT current_schema()")) == schema
        assert await connection.scalar(text("SELECT relnamespace::regnamespace::text FROM pg_class WHERE oid=to_regclass('trading_source_observations')")) == schema
        # Exercise the real installed trigger/function: its to_jsonb(OLD)
        # captures previous source/write clocks in this disposable schema.
        await connection.execute(text(f'CREATE TRIGGER final_evidence_journal AFTER INSERT OR UPDATE OR DELETE ON "{schema}".daily_prices FOR EACH ROW EXECUTE FUNCTION public.capture_trading_source_revision()'))
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            now = datetime.now(DHAKA_TZ)
            day = now.date()
            stock = Stock(id=uuid4(), symbol="EVIDENCE", name="Fixture", exchange=ExchangeCode.DSE)
            session.add(stock); await session.commit()
            row = DailyPrice(stock_id=stock.id, trade_date=day, open_price=120, high_price=123, low_price=116,
                close_price=120, volume=1000, source="FIXTURE", data_quality_flag="OK",
                source_observed_at=now if evidence == "source" else None, batch_fetched_at=now)
            session.add(row); await session.commit(); await session.refresh(row)
            repository = MarketDataRepository(session)
            service = MarketUniverseService(repository, object(), object(), Settings())
            context = None
            async def closing_result(context):
                from app.modules.stock_details.decision.entry_applicability import EntryPathFacts
                quote = (await service.get_display_quotes({stock.id}, context=context, price_basis_v2=True))[stock.id]
                closed_now = max(datetime.now(DHAKA_TZ), datetime.combine(day, datetime.min.time(), tzinfo=DHAKA_TZ).replace(hour=16))+timedelta(seconds=1)
                result = evaluate_entry_applicability(decision=SimpleNamespace(display_action="POTENTIAL_BUY", blocker_codes=[]),
                    plan=terms(preferred_entry_zone_low=119, preferred_entry_zone_high=122, stop_loss=115, invalidation_price=115, target_low=130),
                    eligibility=SimpleNamespace(status="ELIGIBLE"), quote=quote, reference_date=day-timedelta(days=1), now=closed_now,
                    market_open=False, coverage_verified=True, path=EntryPathFacts(sessions=(day,), complete=True),
                    publication_observed_at=closed_now-timedelta(days=1), price_basis_v2=True,
                    session_close_at=closed_now.replace(hour=15), finalized_session_date=day, recheck_at=closed_now+timedelta(days=3))
                return quote, result
            if evidence == "published":
                # Separate committed summary and manifest transactions reproduce
                # the real summary-published/price-publication-failed boundary.
                session.add(DailyMarketSummary(exchange=ExchangeCode.DSE, trade_date=day, index_name="DSEX", is_finalized=True, source="FIXTURE"))
                await session.commit()
                synthetic = await service.resolve_quote_context(exchange=ExchangeCode.DSE)
                assert synthetic.sync_id.startswith("legacy-")
                quote, result = await closing_result(synthetic)
                assert quote.observation_status == "UNAVAILABLE" and result.status == "UNVERIFIED"
                manifest = await repository.create_market_data_generation(exchange=ExchangeCode.DSE, trade_date=day, sync_id="published-low",
                    state=MarketDataState.FINALIZED, source="FIXTURE", source_last_synced_at=row.updated_at,
                    fetched_count=1, accepted_count=1, suspicious_count=0, capture_price_versions=True)
                await session.commit()
                context = PublishedMarketGeneration(trade_date=day, sync_id=manifest.sync_id, data_state=MarketDataState.FINALIZED,
                    source_last_synced_at=manifest.source_last_synced_at, published_at=manifest.published_at)
                assert (await closing_result(context))[1].status == "APPLICABLE"
            row.low_price = 119  # recovery must not erase a genuine previous low
            if evidence == "source": row.source_observed_at = datetime.now(DHAKA_TZ)
            await session.commit()
            prices, revisions, started = await repository.list_entry_path_observations(stock_ids={stock.id}, start_date=day-timedelta(days=1), end_date=day)
            update = next(item for item in revisions if item.previous_payload is not None)
            assert "source_observed_at" in update.previous_payload and "updated_at" in update.previous_payload
            assert (update.previous_payload["source_observed_at"] is not None) is (evidence == "source")
            cutoffs = await repository.list_published_finalized_price_cutoffs(exchange=ExchangeCode.DSE, start_date=day-timedelta(days=1), end_date=day)
            assessed = max(item.observed_at for item in revisions)+timedelta(seconds=1)
            published = datetime.combine(day-timedelta(days=1), datetime.min.time(), tzinfo=DHAKA_TZ)
            facts = build_entry_path_facts(prices=prices, revisions=revisions, sessions=[day], completed_sessions=[],
                reference_date=published.date(), published_at=published, journal_started_at=started,
                price_basis_v2=True, assessed_at=assessed, published_price_cutoffs=cutoffs,
                price_publications=await repository.list_finalized_price_publications(exchange=ExchangeCode.DSE,
                    start_date=day-timedelta(days=1), end_date=day, known_by=assessed))
            assert ((day, 116.0) in facts.reliable_lows) is (evidence != "undated")
            quote = DisplayQuoteRead(**build_quote_projection(prices, finality="LIVE", session_date=day))
            result = evaluate_entry_applicability(decision=SimpleNamespace(display_action="POTENTIAL_BUY", blocker_codes=[]),
                plan=terms(preferred_entry_zone_low=119, preferred_entry_zone_high=122, stop_loss=117, invalidation_price=117, target_low=130),
                eligibility=SimpleNamespace(status="ELIGIBLE"), quote=quote, reference_date=published.date(), now=assessed.astimezone(DHAKA_TZ),
                market_open=True, coverage_verified=True, path=facts, publication_observed_at=published, price_basis_v2=True)
            assert (result.reason_code == "STOP_BREACHED") is (evidence != "undated")
            if context is not None:
                # The existing q cannot certify the later mutable recovered row.
                assert (await closing_result(context))[1].status == "UNVERIFIED"
                corrected = await repository.create_market_data_generation(exchange=ExchangeCode.DSE, trade_date=day, sync_id="published-correction",
                    state=MarketDataState.FINALIZED, source="FIXTURE", source_last_synced_at=prices[0].updated_at,
                    fetched_count=1, accepted_count=1, suspicious_count=0, capture_price_versions=True)
                await session.commit()
                context = replace(context, sync_id=corrected.sync_id, source_last_synced_at=corrected.source_last_synced_at, published_at=corrected.published_at)
                assert (await closing_result(context))[1].status == "APPLICABLE"
    finally:
        async with engine.begin() as connection:
            await connection.execute(DropSchema(schema, cascade=True))
        await engine.dispose()
