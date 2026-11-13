"""Rollout regressions for immutable bytes, evidence and scheduled projections."""
import json
from dataclasses import replace
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.audit_hashing import stable_audit_hash
from app.core.core_config import Settings
from app.core.enums import ExchangeCode, MarketDataState, MarketSessionStatus
from app.jobs.market_session_schedule import DHAKA_TZ
from app.modules.market_data.published_generation import PublishedMarketGeneration
from app.modules.market_universe.market_universe_cache import universe_cache_key
from app.modules.market_universe.market_universe_schemas import (
    DisplayQuoteRead,
    ScoredUniverseCacheRead,
)
from app.modules.market_universe.market_universe_service import MarketUniverseService
from app.modules.stock_details.decision.entry_applicability import EntryApplicabilityRead
from app.tests.test_canonical_generation_architecture import _canonical_fixture, _MemoryRedis
from app.tests.test_entry_applicability import NOW, assess, terms


@pytest.mark.asyncio
@pytest.mark.parametrize("cache_hit", [True, False])
async def test_frozen_pre_rollout_publication_keeps_digest_in_cache_durable_and_overlays(cache_hit):
    # This static prior-shape wire fixture is never constructed from current DTOs.
    raw = json.loads((Path(__file__).parent/"fixtures/pr31_legacy_universe.json").read_text())
    wire_digest = stable_audit_hash(raw["rows"])
    assert raw["payload_revision"] == wire_digest
    parsed = ScoredUniverseCacheRead.model_validate(raw)
    assert parsed.model_dump(mode="json") == raw
    generation = PublishedMarketGeneration(trade_date=parsed.session_trade_date,
        sync_id=parsed.market_sync_id, source_last_synced_at=parsed.source_last_synced_at,
        published_at=parsed.source_last_synced_at, data_state=MarketDataState.FINALIZED)
    publication = SimpleNamespace(generation_id=generation.sync_id, session_date=generation.trade_date,
        observed_at=generation.published_at, invalidated_at=None, result_payload=raw)
    redis = _MemoryRedis()
    key = universe_cache_key("scored", ExchangeCode.DSE, generation.sync_id)
    if cache_hit:
        redis.storage[key] = raw
    else:
        redis.is_available = False
    repository = SimpleNamespace(latest_publication=AsyncMock(return_value=publication),
        get_publication=AsyncMock(return_value=publication), publication_coverage=AsyncMock(return_value={}))
    market = SimpleNamespace(list_recent_exchange_session_dates=AsyncMock(return_value=[]))
    service = MarketUniverseService(market, object(), redis, Settings(), repository)
    service.resolve_generation_context = AsyncMock(return_value=generation)
    service.resolve_quote_context = AsyncMock(return_value=None)
    snapshot = await service.get_canonical_universe(exchange=ExchangeCode.DSE)
    assert snapshot.payload.payload_revision == wire_digest
    stock_id = snapshot.rows[0].stock.id
    # Both contracts overlay the frozen prior-shape row without mutating the winner.
    for v2 in (False, True):
        projected = await service.project_current_entries(snapshot, exchange=ExchangeCode.DSE, price_basis_v2=v2)
        assert projected.rows[0].entry_applicability.reason_code == "ACTION_NOT_PERMITTED"
        assert projected.rows[0].measured_facts is not None
    assert raw["payload_revision"] == wire_digest == stable_audit_hash(raw["rows"])
    assert "volume" not in parsed.rows[0].display_quote.model_dump()
    assert parsed.rows[0].stock.id == stock_id
    if cache_hit:
        repository.get_publication.assert_not_awaited()
    else:
        repository.get_publication.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("basis", [None, "UNKNOWN", "CURRENT", "SNAPSHOT", "LAST_CLOSE"])
async def test_historic_basis_presence_controls_both_pulse_trigger_projections(basis):
    from app.modules.market_pulse.market_pulse_service import (
        MarketPulseService,
        PulsePresentationRow,
        _to_focus_stock_read,
    )
    from app.modules.market_pulse.pulse_score import compute_pulse_score, derive_pulse_focus_label
    from app.modules.market_universe.market_universe_compute import technical_snapshot_from_read
    from app.tests.test_market_pulse_cache import _pulse
    raw = {"status": "APPLICABLE", "reason_code": "ENTRY_TERMS_MET", "assessed_at": NOW}
    if basis is not None:
        raw["price_basis"] = basis
    assessment = EntryApplicabilityRead.model_validate(raw)
    if basis is None:
        assert "price_basis" not in assessment.model_dump()
    _, _, row, snapshot = _canonical_fixture()
    row = row.model_copy(update={"entry_applicability": assessment,
        "decision": row.decision.model_copy(update={"entry_applicability": assessment})})
    snapshot = replace(snapshot, payload=snapshot.payload.model_copy(update={"rows": [row]}))
    technical = technical_snapshot_from_read(row.technical_snapshot)
    score = compute_pulse_score(technical, row.decision)
    item = _to_focus_stock_read(PulsePresentationRow(row.stock, technical, row.decision, score,
        derive_pulse_focus_label(technical, row.decision, score)), 1)
    service = MarketPulseService(market_data_service=SimpleNamespace(get_market_freshness=AsyncMock(
        return_value=SimpleNamespace(market_status=MarketSessionStatus.OPEN))),
        universe_service=SimpleNamespace(project_current_entries=AsyncMock(return_value=snapshot)), redis=object(), settings=Settings())
    refreshed = await service._refresh_current_fields(_pulse("cached").model_copy(update={"focus_stocks": [item]}), snapshot)
    assert item.actionable_trigger is (basis == "CURRENT")
    assert refreshed.focus_stocks[0].actionable_trigger is (basis == "CURRENT")


@pytest.mark.asyncio
async def test_undated_body_cross_day_replay_cannot_certify_snapshot_session():
    from app.jobs.ingestion.amarstock_http_client import AmarStockHttpResponse
    from app.jobs.ingestion.amarstock_msgpack_market_data_source import (
        AmarStockMarketSnapshotSource,
    )
    from app.modules.stock_details.decision.display_metrics import build_quote_projection
    from app.tests.test_amarstock_msgpack_market_data_source import _pack
    transport = AsyncMock()
    source = AmarStockMarketSnapshotSource(base_url="http://fixture", snapshot_path="/fixture", max_retries=1,
        retry_delay_seconds=0, max_response_bytes=1000000, max_last_modified_age_days=7, client=transport)
    for day in (11, 12):
        now = datetime(2026,11,day,11,tzinfo=DHAKA_TZ)
        transport.fetch_bytes.return_value = AmarStockHttpResponse(body=_pack(), status=200,
            content_type="application/x-msgpack", headers={}, received_at=now)
        incoming = (await source.fetch_daily_prices(now.date()))[0]
        row = SimpleNamespace(**{**incoming.model_dump(), "updated_at": now,
            "previous_close_price": None, "price_change_percent": None, "price_change": None})
        quote = DisplayQuoteRead(**build_quote_projection([row], finality="LIVE", session_date=now.date()))
        result = assess(quote=quote, now=now, price_basis_v2=True)
        assert result.status == "UNVERIFIED" and result.reason_code == "QUOTE_UNUSABLE"


@pytest.mark.asyncio
async def test_final_public_pulse_cold_and_warm_stamp_uses_exact_leader():
    from app.modules.market_pulse.market_pulse_schemas import OpportunityScoreRead
    from app.tests.test_market_pulse_cache import _service_with_redis
    _, _, original, snapshot = _canonical_fixture()
    rows = []
    for name, stored, floating in [("LEGACYFLOAT", None, 2.0), ("EXACT", Decimal("1"), .1)]:
        rows.append(original.model_copy(update={
            "stock": original.stock.model_copy(update={"id": uuid4(), "symbol": name}),
            "eligibility": original.eligibility.model_copy(update={"status": "ELIGIBLE"}),
            "session": original.session.model_copy(update={"change_percent": stored}),
            "technical_snapshot": original.technical_snapshot.model_copy(update={"price_change_percent": floating, "price_change_percent_ratio": None}),
        }))
    snapshot = replace(snapshot, payload=snapshot.payload.model_copy(update={"rows": rows}))
    service = _service_with_redis({})
    service.universe_service.get_canonical_universe = AsyncMock(return_value=snapshot)
    service.market_data_service.list_daily_market_summaries = AsyncMock(return_value=[])
    service._resolve_opportunity_score = AsyncMock(return_value=OpportunityScoreRead(score=60, label="Test"))
    service._compute_market_pulse = AsyncMock(wraps=service._compute_market_pulse)
    for _ in range(2):
        payload = await service.get_market_pulse(exchange=ExchangeCode.DSE, previous=None)
        leader = next(card for card in payload.briefing.leadership.cards if card.kind == "stock")
        assert (leader.name, leader.detail) == ("EXACT", "+1.00%")
    service._compute_market_pulse.assert_awaited_once()


@pytest.mark.asyncio
async def test_warm_dashboard_reads_only_compact_projection_and_withdrawal_metadata():
    from app.modules.market_dashboard.market_dashboard_service import MarketDashboardService
    _, _, _, snapshot = _canonical_fixture()
    publication = SimpleNamespace(generation_id=snapshot.generation.sync_id,
        session_date=snapshot.generation.trade_date, invalidated_at=None,
        result_payload=snapshot.payload.model_dump(mode="json"))
    repository = SimpleNamespace(latest_publication=AsyncMock(return_value=publication),
        get_publication=AsyncMock(return_value=publication))
    market = SimpleNamespace(get_latest_market_data_generation=AsyncMock(return_value=SimpleNamespace(
        trade_date=publication.session_date, sync_id=publication.generation_id)),
        finalized_input_revision=AsyncMock(side_effect=AssertionError("No history fingerprint on dashboard")))
    service = MarketDashboardService(market, SimpleNamespace(get_market_freshness=AsyncMock(return_value=SimpleNamespace(
        trade_date=publication.session_date, market_sync_id="quote-1", last_synced_at=NOW,
        decision_generation_id=publication.generation_id, decision_status="CURRENT"))), object(), _MemoryRedis(), Settings(), repository)
    for _ in range(2):
        result = await service.get_sectors(exchange=ExchangeCode.DSE)
        assert result.decision_generation_id == publication.generation_id
        assert result.market_sync_id == "quote-1"
    repository.get_publication.assert_awaited_once()
    market.finalized_input_revision.assert_not_awaited()
    publication.invalidated_at = NOW
    assert (await service.get_sectors(exchange=ExchangeCode.DSE)).decision_generation_id is None
    repository.get_publication.assert_awaited_once()


@pytest.mark.asyncio
async def test_scheduled_observation_without_shared_redis_reports_gap(caplog):
    from app.modules.stock_details.decision.entry_observation_log import observe_scheduled_entries
    service = SimpleNamespace(redis=SimpleNamespace(is_available=False), get_canonical_universe=AsyncMock())
    with caplog.at_level("WARNING"):
        await observe_scheduled_entries(service, exchange=ExchangeCode.DSE)
    service.get_canonical_universe.assert_not_awaited()
    assert "SHARED_COORDINATOR_UNAVAILABLE" in caplog.text


@pytest.mark.asyncio
async def test_summary_finalized_manifest_failure_cannot_confirm_breakout(monkeypatch):
    from unittest.mock import MagicMock

    from app.jobs.ingestion.ingest_daily_market_prices import run_daily_market_sync
    from app.modules.stock_details.decision.entry_applicability import (
        build_entry_path_facts,
    )
    service = SimpleNamespace(run_daily_news_sync=AsyncMock(return_value=SimpleNamespace(news_upserted=0, news_skipped=0, news_error=None)),
        finalize_market_session=AsyncMock(return_value=True), publish_finalized_market_generation=AsyncMock(side_effect=RuntimeError("manifest write failed")))
    monkeypatch.setattr("app.jobs.ingestion.ingest_daily_market_prices._build_service", lambda session: service)
    monkeypatch.setattr("app.jobs.ingestion.ingest_daily_market_prices.AsyncSessionLocal", lambda: MagicMock(
        __aenter__=AsyncMock(return_value=object()), __aexit__=AsyncMock(return_value=None)))
    monkeypatch.setattr("app.jobs.ingestion.ingest_daily_market_prices.spawn_rebuild_market_read_cache", lambda *args, **kwargs: None)
    capture = AsyncMock()
    monkeypatch.setattr("app.jobs.ingestion.ingest_daily_market_prices._capture_market_pulse_session_snapshot", capture)
    result = await run_daily_market_sync(settings=Settings(), skip_session_validation=True)
    assert result.session_finalized is True
    capture.assert_not_awaited()
    day = NOW.date()-timedelta(days=1)
    row = SimpleNamespace(trade_date=day, open_price=100, high_price=102, low_price=99,
        close_price=100, volume=1000, data_quality_flag="OK", updated_at=NOW-timedelta(hours=20))
    plan = terms(entry_timing="BREAKOUT", trigger_price=99)
    current = SimpleNamespace(**{**vars(row), "trade_date": NOW.date(), "updated_at": NOW})
    common = dict(prices=[row, current], revisions=[], sessions=[day, NOW.date()], reference_date=day-timedelta(days=1),
        published_at=NOW-timedelta(days=2), journal_started_at=NOW-timedelta(days=3), plan=plan, average_volume=500)
    # The summary date may remain in the calendar, but no finalized price
    # manifest means it cannot appear in the trusted completed confirmation set.
    unpublished = build_entry_path_facts(**common, completed_sessions=[], published_price_cutoffs={})
    assert unpublished.confirmed_on is None
    quote = DisplayQuoteRead(current_price=100, as_of_trade_date=NOW.date().isoformat(),
        observation_session_date=NOW.date().isoformat(), observation_status="PROVISIONAL", data_quality="OK", volume=1000, source_observed_at=NOW)
    assert assess(quote=quote, plan=plan, path=unpublished, reference_date=day-timedelta(days=1), price_basis_v2=True).reason_code == "COMPLETED_BREAKOUT_REQUIRED"
    published = build_entry_path_facts(**common, completed_sessions=[day], published_price_cutoffs={day: NOW-timedelta(hours=19)})
    assert published.confirmed_on == day
    assert assess(quote=quote, plan=plan, path=published, reference_date=day-timedelta(days=1), price_basis_v2=True).status == "APPLICABLE"
    late_row = SimpleNamespace(**{**vars(row), "updated_at": NOW})
    assert build_entry_path_facts(**{**common, "prices": [late_row, current]}, completed_sessions=[day],
        published_price_cutoffs={day: NOW-timedelta(hours=19)}).confirmed_on is None
