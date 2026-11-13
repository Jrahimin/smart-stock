from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from fractions import Fraction
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI

from app.core.core_config import Settings
from app.core.enums import ExchangeCode, MarketDataState
from app.jobs.market_session_schedule import DHAKA_TZ, entry_quote_session, resolve_market_status
from app.modules.market_data.session_leadership import eligible_sector_returns
from app.modules.market_pulse.market_pulse_cache import pulse_cache_key
from app.modules.market_universe.market_universe_router import router
from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead
from app.modules.market_universe.market_universe_service import (
    MarketUniverseService,
    get_market_universe_service,
)
from app.modules.stock_details.decision.entry_contract import entry_contract
from app.modules.stock_details.decision.measured_facts import build_measured_facts
from app.modules.stock_details.stock_details_cache import stock_workspace_cache_key
from app.tests.test_entry_applicability import DAY, NOW, REFERENCE, assess, terms


def receipt_quote(**changes):
    return DisplayQuoteRead(current_price=100, as_of_trade_date=DAY.isoformat(),
        observation_session_date=DAY.isoformat(), volume=1000, data_quality="OK",
        observation_status="PROVISIONAL", batch_fetched_at=NOW, session_date_verified=True).model_copy(update=changes)


@pytest.mark.parametrize("price,reason", [(100, "ENTRY_TERMS_MET"), (105, "ABOVE_ENTRY_ZONE"),
    (98, "BELOW_ENTRY_ZONE"), (110, "TARGET_REACHED")])
def test_receipt_only_positive_and_negative_price_checks_share_deadline(price, reason):
    quote = receipt_quote(current_price=price)
    result = assess(quote=quote, price_basis_v2=True)
    assert (result.price_basis, result.reason_code, result.recheck_at) == ("SNAPSHOT", reason, NOW+timedelta(minutes=30))
    assert assess(quote=quote, now=result.recheck_at, price_basis_v2=True).reason_code == "QUOTE_UNUSABLE"
    assert assess(quote=quote).reason_code == "QUOTE_UNUSABLE"  # legacy remains source-timed


@pytest.mark.parametrize("changes", [
    {"batch_fetched_at": NOW+timedelta(seconds=1)}, {"batch_fetched_at": NOW-timedelta(hours=1)},
    {"source_observed_at": NOW+timedelta(seconds=1)}, {"source_observed_at": NOW-timedelta(hours=1)},
    {"volume": 0}, {"observation_status": "NO_TRADE"}, {"observation_session_date": REFERENCE.isoformat()},
    {"as_of_trade_date": REFERENCE.isoformat()}, {"data_quality": "SUSPICIOUS"}, {"data_quality": None},
    {"batch_fetched_at": None, "ingested_at": NOW},
])
def test_receipt_evidence_fails_closed(changes):
    assert assess(quote=receipt_quote(**changes), price_basis_v2=True).reason_code == "QUOTE_UNUSABLE"


def test_receipt_does_not_confirm_breakout_and_invalidation_precedes_timing():
    quote = receipt_quote()
    assert assess(quote=quote, price_basis_v2=True, plan=terms(entry_timing="BREAKOUT", trigger_price=99)).reason_code == "COMPLETED_BREAKOUT_REQUIRED"
    from app.modules.stock_details.decision.entry_applicability import EntryPathFacts
    breached = EntryPathFacts(sessions=(DAY,), reliable_lows=((DAY, 95),), complete=False)
    assert assess(quote=quote, price_basis_v2=True, path=breached).reason_code == "STOP_BREACHED"
    assert assess(quote=quote, price_basis_v2=True, path=replace(breached, reliable_lows=())).reason_code == "PATH_INCOMPLETE"
    expired = replace(breached, reliable_lows=(), completed_sessions=frozenset({DAY}))
    assert assess(quote=quote, price_basis_v2=True, plan=terms(expiry_sessions=1), path=expired).reason_code == "PLAN_EXPIRED"


def test_close_finalization_is_authoritative_but_provisional_or_missed_publication_is_not():
    closing = NOW+timedelta(hours=1)
    after = closing+timedelta(minutes=20)
    quote = receipt_quote(observation_status="FINALIZED")
    arguments = dict(quote=quote, now=after, market_open=False, session_close_at=closing,
        finalized_session_date=DAY, recheck_at=after+timedelta(days=1), price_basis_v2=True)
    result = assess(**arguments)
    assert (result.status, result.price_basis) == ("APPLICABLE", "LAST_CLOSE")
    assert assess(**{**arguments, "quote": quote.model_copy(update={"source_observed_at": NOW-timedelta(hours=2)})}).reason_code == "QUOTE_UNUSABLE"
    assert assess(**{**arguments, "quote": quote.model_copy(update={"observation_status": "PROVISIONAL"})}).reason_code == "QUOTE_UNUSABLE"
    assert assess(**{**arguments, "finalized_session_date": None}).reason_code == "QUOTE_UNUSABLE"
    assert assess(**{**arguments, "session_settling": True}).reason_code == "SESSION_SETTLING"


def test_receipt_deadline_caps_at_exchange_close():
    close = NOW+timedelta(minutes=2)
    result = assess(quote=receipt_quote(current_price=105), price_basis_v2=True, session_close_at=close)
    assert result.recheck_at == close
    assert assess(quote=receipt_quote(), now=close, price_basis_v2=True, session_close_at=close).reason_code == "QUOTE_UNUSABLE"


def test_known_weekday_closure_weekend_and_exact_reopening():
    settings = Settings(market_session_closures={date(2026,11,12)}, market_open_time="10:00", market_close_time="15:00")
    for day in (12, 13, 14):
        now = datetime(2026,11,day,11,tzinfo=DHAKA_TZ)
        assert resolve_market_status(now, settings).value == "HOLIDAY"
        opening, closing, deadline = entry_quote_session(now, settings)
        assert closing.date() == date(2026,11,11)
        assert deadline == datetime(2026,11,15,10,tzinfo=DHAKA_TZ)
    assert entry_quote_session(datetime(2026,11,15,10,tzinfo=DHAKA_TZ), settings)[2] is None
    # A silent ordinary weekday is still an expected trading session.
    assert entry_quote_session(datetime(2026,11,12,16,tzinfo=DHAKA_TZ), Settings())[1].date() == date(2026,11,12)


def test_sector_missing_evidence_excludes_only_affected_sector_and_preserves_exact_zero():
    stocks = [SimpleNamespace(sector=sector) for sector in ("Bank",)*3+("IT",)*3]
    sectors, excluded = eligible_sector_returns(zip(stocks, [Fraction(1,10), Fraction(2,10), Fraction(-3,10), Fraction(2), None, Fraction(3)], strict=True))
    assert sectors == [("Bank", Fraction(), 3)] and excluded == 1


def test_same_generation_measured_facts_use_prior_median_without_strategy_changes():
    from app.tests.test_canonical_generation_architecture import _canonical_fixture
    _, _, row, _ = _canonical_fixture()
    technical = row.technical_snapshot.model_copy(update={"volume": 160, "average_volume": 100, "volume_observation_count": 20})
    facts = build_measured_facts(row.model_copy(update={"technical_snapshot": technical}))
    assert facts.volume_ratio == 1.6 and facts.volume_baseline == "PRIOR_20_SESSION_MEDIAN"
    assert facts.rsi == row.technical_snapshot.rsi and facts.opportunity_score == row.decision.opportunity_score
    assert build_measured_facts(row.model_copy(update={"technical_snapshot": technical.model_copy(update={"average_volume": None})})).volume_ratio is None


@pytest.mark.asyncio
async def test_public_router_receipt_path_opt_in_and_request_context_reset(monkeypatch):
    from app.tests.test_canonical_generation_architecture import _canonical_fixture, _MemoryRedis
    stock, _, original, snapshot = _canonical_fixture()
    day = snapshot.generation.trade_date+timedelta(days=1)
    now = datetime.combine(day, datetime.min.time(), tzinfo=DHAKA_TZ).replace(hour=11)
    published = now-timedelta(days=1)
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now.astimezone(tz) if tz else now.replace(tzinfo=None)
    monkeypatch.setattr("app.modules.market_universe.market_universe_service.datetime", Clock)
    plan = original.analysis.trade_plan.model_copy(update=vars(terms()))
    row = original.model_copy(update={"decision": original.decision.model_copy(update={"display_action": "POTENTIAL_BUY"}),
        "eligibility": original.eligibility.model_copy(update={"status": "ELIGIBLE"}),
        "analysis": original.analysis.model_copy(update={"trade_plan": plan})})
    snapshot = replace(snapshot, payload=snapshot.payload.model_copy(update={"rows": [row]}))
    # This quote follows the same projection used by ingested unchanged OHLCV.
    from app.modules.stock_details.decision.display_metrics import build_quote_projection
    bar = SimpleNamespace(stock_id=stock.id, trade_date=day, open_price=100, high_price=102,
        low_price=99, close_price=100, volume=1000, data_quality_flag=SimpleNamespace(value="OK"),
        source="FIXTURE", updated_at=published, source_observed_at=None, batch_fetched_at=now,
        previous_close_price=100, price_change_percent=Decimal(0), price_change=Decimal(0))
    bar.data_quality_flag = "OK"
    market = SimpleNamespace(
        list_recent_exchange_session_dates=AsyncMock(return_value=[snapshot.generation.trade_date]),
        list_authenticated_exchange_session_dates=AsyncMock(return_value=[day]),
        list_entry_path_observations=AsyncMock(return_value=([bar], [], published-timedelta(days=1))),
        list_entry_basis_events=AsyncMock(return_value={}))
    publication = SimpleNamespace(generation_id=snapshot.generation.sync_id,
        session_date=snapshot.generation.trade_date, observed_at=published, invalidated_at=None)
    async def latest_publication(*, before_date=None, **kwargs):
        return None if before_date else publication
    durable = SimpleNamespace(latest_publication=AsyncMock(side_effect=latest_publication),
        publication_coverage=AsyncMock(return_value={"universe_membership": [str(stock.id)], "input_keys": [str(stock.id)], "excluded_members": [], "membership_provenance": {"status": "OBSERVED_INDEPENDENT_LISTED_SET", "observed_at": published.isoformat(), "listed_count": 1, "market_coverage_verified": True}}))
    service = MarketUniverseService(market, SimpleNamespace(count_stocks=AsyncMock(return_value=1)), _MemoryRedis(), Settings(), durable)
    service.get_canonical_universe = AsyncMock(return_value=snapshot)
    service.resolve_generation_context = AsyncMock(return_value=snapshot.generation)
    service.resolve_quote_context = AsyncMock(return_value=replace(snapshot.generation, trade_date=day, sync_id="receipt-quote", data_state=MarketDataState.LIVE))
    service.is_generation_current = AsyncMock(return_value=True)
    from app.core.enums import DataQualityFlag
    bar.data_quality_flag = DataQualityFlag.OK
    # Controlled independent instrument/session proof, including the path bar.
    # The ordinary undated bulk decoder does not supply this provenance.
    bar.session_date_verified = True
    quote = DisplayQuoteRead(**build_quote_projection([bar], finality="LIVE", session_date=day)).model_copy(update={"session_date_verified": True})
    service.get_display_quotes = AsyncMock(return_value={stock.id: quote})
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_market_universe_service] = lambda: service
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://fixture") as client:
        old = (await client.get("/market/universe-rows")).json()["data"]["rows"][0]
        new = (await client.get("/market/universe-rows?entry_contract=price-basis-v2")).json()["data"]["rows"][0]
        again = (await client.get("/market/universe-rows")).json()["data"]["rows"][0]
    assert old["entry_applicability"]["status"] == again["entry_applicability"]["status"] == "UNVERIFIED"
    assert new["entry_applicability"]["status"] == "APPLICABLE"
    assert new["entry_applicability"]["price_basis"] == "SNAPSHOT"
    assert new["measured_facts"]["volume_baseline"] == "PRIOR_20_SESSION_MEDIAN"
    assert entry_contract.get() == "legacy" and snapshot.rows[0].entry_applicability is None


def test_contract_response_cache_keys_are_partitioned():
    def keys():
        return (pulse_cache_key("response", ExchangeCode.DSE, DAY, "g"),
            stock_workspace_cache_key("workspace", ExchangeCode.DSE, "TEST", str(DAY), str(DAY), "g"))
    old = keys()
    token = entry_contract.set("price-basis-v2")
    try:
        assert all(a != b for a, b in zip(old, keys(), strict=True))
    finally:
        entry_contract.reset(token)
    assert keys() == old


@pytest.mark.asyncio
async def test_dashboard_and_pulse_share_eligible_leaders_and_partial_sectors(monkeypatch):
    from app.modules.market_dashboard.market_dashboard_schemas import DashboardSectorsRead
    from app.modules.market_dashboard.market_dashboard_service import MarketDashboardService
    from app.modules.market_pulse.market_pulse_schemas import OpportunityScoreRead
    from app.tests.test_canonical_generation_architecture import _canonical_fixture, _MemoryRedis
    from app.tests.test_market_pulse_cache import _service_with_redis
    _, _, original, snapshot = _canonical_fixture()
    rows = []
    for index, change in enumerate([Decimal("0.1"), Decimal("0.2"), Decimal("-0.3"), Decimal(2), None, Decimal(3)]):
        rows.append(original.model_copy(update={
            "stock": original.stock.model_copy(update={"symbol": f"S{index}", "sector": "Bank" if index < 3 else "IT"}),
            "eligibility": original.eligibility.model_copy(update={"status": "ELIGIBLE"}),
            "session": original.session.model_copy(update={"change_percent": change}),
            "technical_snapshot": original.technical_snapshot.model_copy(update={"price_change_percent": float(change) if change is not None else None, "price_change_percent_ratio": None}),
        }))
    snapshot = replace(snapshot, payload=snapshot.payload.model_copy(update={"rows": rows}))
    monkeypatch.setattr("app.modules.market_data.published_generation.resolve_finalized_decision_generation", AsyncMock(return_value=snapshot.generation))
    publication = SimpleNamespace(generation_id=snapshot.generation.sync_id, session_date=snapshot.generation.trade_date, invalidated_at=None,
        result_payload=snapshot.payload.model_dump(mode="json"))
    dashboard = MarketDashboardService(object(), object(), object(), _MemoryRedis(), Settings(),
        SimpleNamespace(latest_publication=AsyncMock(return_value=publication), get_publication=AsyncMock(return_value=publication)))
    result = await dashboard._project_session_leaders(DashboardSectorsRead(), exchange=ExchangeCode.DSE)
    pulse = _service_with_redis({})
    pulse.market_data_service.list_daily_market_summaries = AsyncMock(return_value=[])
    pulse._resolve_opportunity_score = AsyncMock(return_value=OpportunityScoreRead(score=60, label="Test"))
    briefing = (await pulse._compute_market_pulse(exchange=ExchangeCode.DSE, previous=None, snapshot=snapshot)).briefing
    assert result.top_gainer.symbol == "S5"
    assert next(card.name for card in briefing.leadership.cards if card.kind == "stock") == result.top_gainer.symbol
    assert result.leadership_status == "NO_ADVANCING_SECTOR" and result.excluded_sector_count == 1
    assert [(sector.name, sector.change_percent) for sector in result.sectors] == [("Bank", Decimal(0))]
    assert briefing.state.excluded_sector_count == 1 and not briefing.money_flow.inflows
    publication.invalidated_at = NOW
    assert (await dashboard._project_session_leaders(result, exchange=ExchangeCode.DSE)).top_gainer is None


@pytest.mark.asyncio
async def test_daily_scheduled_summary_survives_split_workers_restart_and_status_transitions(caplog):
    from app.modules.stock_details.decision.entry_observation_log import observe_scheduled_entries
    from app.tests.test_canonical_generation_architecture import _canonical_fixture
    _, _, original, snapshot = _canonical_fixture()
    opened = datetime(2026,11,12,11,tzinfo=DHAKA_TZ)
    closed = opened.replace(hour=16)
    context = replace(snapshot.generation, trade_date=opened.date(), sync_id="live", data_state=MarketDataState.LIVE)
    store = {}
    class SharedRedis:
        is_available = True
        async def get_json(self, key): return store.get(key)
        async def set_json(self, key, value, **kwargs): store[key] = value; return True
        async def set_if_not_exists(self, key, value, **kwargs):
            if key in store: return False
            store[key] = value; return True
        async def delete_if_value(self, key, value):
            if store.get(key) == value: del store[key]
    def worker(basis, status="APPLICABLE"):
        row = original.model_copy(update={"entry_applicability": SimpleNamespace(price_basis=basis, status=status, reason_code="QUOTE_UNUSABLE" if status == "UNVERIFIED" else "ENTRY_TERMS_MET")})
        projected = replace(snapshot, quote_generation=context, payload=snapshot.payload.model_copy(update={"rows": [row]}))
        return SimpleNamespace(redis=SharedRedis(), settings=Settings(),
            resolve_quote_context=AsyncMock(return_value=context), get_canonical_universe=AsyncMock(return_value=snapshot),
            project_current_entries=AsyncMock(return_value=projected))
    with caplog.at_level("INFO"):
        first = worker("SNAPSHOT")
        await observe_scheduled_entries(first, exchange=ExchangeCode.DSE, now=opened)
        # Another worker now sees UNVERIFIED, but cannot overwrite the defined OPEN observation.
        second = worker("CURRENT", "UNVERIFIED")
        await observe_scheduled_entries(second, exchange=ExchangeCode.DSE, now=opened+timedelta(minutes=15))
        second.project_current_entries.assert_not_awaited()
        context = replace(context, sync_id="final", data_state=MarketDataState.FINALIZED)
        restarted = worker("LAST_CLOSE")
        await observe_scheduled_entries(restarted, exchange=ExchangeCode.DSE, now=closed)
        await observe_scheduled_entries(worker("LAST_CLOSE"), exchange=ExchangeCode.DSE, now=closed)
    events = [record.message for record in caplog.records if "entry_applicability_daily" in record.message]
    assert len(events) == 1 and "'SNAPSHOT': 1" in events[0] and "'CURRENT': 0" in events[0]
    assert "'LAST_CLOSE': 1" in events[0] and "open_observed=True" in events[0]


@pytest.mark.asyncio
async def test_ingested_unchanged_traded_receipt_refresh_preserves_published_identity():
    """Real local Postgres upsert/publication; provider transport is a fixture."""
    import os
    from uuid import uuid4

    from sqlalchemy import select, text
    from sqlalchemy.engine import make_url
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.schema import CreateSchema, DropSchema

    from app.jobs.ingestion.amarstock_http_client import AmarStockHttpResponse
    from app.jobs.ingestion.amarstock_msgpack_market_data_source import (
        AmarStockMarketSnapshotSource,
    )
    from app.models import DailyMarketSummary, DailyPrice, Stock
    from app.modules.market_data.market_data_repository import MarketDataRepository
    from app.modules.stock_details.decision.display_metrics import build_quote_projection
    from app.modules.stock_details.decision.entry_applicability import EntryPathFacts
    from app.modules.trading_intelligence.decision_snapshot_repository import (
        DecisionSnapshotRepository,
    )
    from app.tests.test_amarstock_msgpack_market_data_source import _pack

    raw = os.getenv("TRADING_TEST_DATABASE_URL")
    if not raw:
        pytest.skip("Set isolated local TRADING_TEST_DATABASE_URL")
    url = make_url(raw)
    assert url.host in {"localhost", "127.0.0.1"} and url.database.startswith("smart_stock_decision_qa_")
    schema = "price_basis_test_"+uuid4().hex
    engine = create_async_engine(url.set(drivername="postgresql+asyncpg"),
        connect_args={"server_settings": {"search_path": schema+",public"}})
    async with engine.begin() as connection:
        await connection.execute(CreateSchema(schema))
        for table in ("stocks", "daily_prices", "decision_generation_captures", "daily_market_summaries", "market_data_generations"):
            await connection.execute(text(f'CREATE TABLE "{schema}".{table} (LIKE public.{table} INCLUDING ALL)'))
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            stock = Stock(id=uuid4(), symbol="ACI", name="Fixture", exchange=ExchangeCode.DSE)
            session.add(stock)
            await session.commit()
            transport = AsyncMock()
            source = AmarStockMarketSnapshotSource(base_url="http://fixture", snapshot_path="/snapshot",
                max_retries=1, retry_delay_seconds=0, max_response_bytes=1000000,
                max_last_modified_age_days=7, client=transport)
            repository = MarketDataRepository(session)
            day = date(2026,11,12)
            now = datetime(2026,11,12,5,tzinfo=UTC)
            original_updated = None
            for receipt in (now-timedelta(minutes=20), now-timedelta(minutes=1)):
                transport.fetch_bytes.return_value = AmarStockHttpResponse(body=_pack(), status=200,
                    content_type="application/x-msgpack", headers={}, received_at=receipt)
                incoming = (await source.fetch_daily_prices(day))[0]
                values = {key: value for key, value in incoming.model_dump().items() if key in DailyPrice.__table__.columns}
                values["stock_id"] = stock.id
                changed = await repository.upsert_daily_price_if_changed(values)
                await session.commit()
                row = await session.scalar(select(DailyPrice).execution_options(populate_existing=True))
                if original_updated is None:
                    assert changed is not None
                    original_updated = row.updated_at
                    publication = await DecisionSnapshotRepository(session).publish_generation(
                        exchange=ExchangeCode.DSE, generation_id="fixed-generation", session_date=day,
                        inputs={"receipt_test": True}, payload={"unchanged_quote": str(row.close_price)})
                else:
                    assert changed is None and row.updated_at == original_updated
                assert row.batch_fetched_at == receipt and row.source_observed_at is None
            winner = await DecisionSnapshotRepository(session).latest_publication(exchange=ExchangeCode.DSE)
            assert winner.generation_id == publication.generation_id == "fixed-generation"
            session.add(DailyMarketSummary(exchange=ExchangeCode.DSE, trade_date=day,
                index_name="DSEX", source="FIXTURE", is_finalized=True))
            await session.commit()
            assert await repository.list_recent_exchange_session_dates(exchange=ExchangeCode.DSE, limit=10) == [day]
            assert await repository.list_published_finalized_price_cutoffs(exchange=ExchangeCode.DSE,
                start_date=day-timedelta(days=1), end_date=day) == {}
            await repository.create_market_data_generation(exchange=ExchangeCode.DSE, trade_date=day,
                sync_id="published-price-manifest", state=MarketDataState.FINALIZED,
                source="FIXTURE", source_last_synced_at=row.updated_at,
                fetched_count=1, accepted_count=1, suspicious_count=0)
            await session.commit()
            assert (await repository.list_published_finalized_price_cutoffs(exchange=ExchangeCode.DSE,
                start_date=day-timedelta(days=1), end_date=day))[day] == row.updated_at
            quote = DisplayQuoteRead(**build_quote_projection([row], finality="LIVE", session_date=day))
            assessment = assess(quote=quote, now=now, reference_date=day-timedelta(days=1), price_basis_v2=True,
                plan=terms(preferred_entry_zone_low=118, preferred_entry_zone_high=122, target_low=130),
                path=EntryPathFacts(sessions=(day,), complete=True))
            # The bulk source is undated: /Info and actual receipt cannot
            # establish that this instrument traded in the requested session.
            assert assessment.status == "UNVERIFIED" and assessment.reason_code == "QUOTE_UNUSABLE"
            assert await repository.list_traded_exchange_session_dates(exchange=ExchangeCode.DSE,
                start_date=day-timedelta(days=1), end_date=day) == []
            row.source_observed_at = now
            await session.commit()
            assert await repository.list_traded_exchange_session_dates(exchange=ExchangeCode.DSE,
                start_date=day-timedelta(days=1), end_date=day) == [day]
    finally:
        async with engine.begin() as connection:
            await connection.execute(DropSchema(schema, cascade=True))
        await engine.dispose()
