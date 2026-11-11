from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.core_config import Settings
from app.core.enums import ExchangeCode, MarketDataState
from app.core.security_config import ANONYMOUS_USER_CONTEXT
from app.modules.market_data.market_data_service import MarketDataService, MarketSnapshotCoverageError
from app.modules.market_pulse.market_pulse_cache import pulse_cache_key
from app.modules.market_pulse.market_pulse_service import MarketPulseService, PulsePresentationRow, _to_focus_stock_read
from app.modules.market_pulse.pulse_score import compute_pulse_score, derive_pulse_focus_label
from app.modules.market_universe.market_universe_compute import technical_snapshot_from_read
from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead
from app.modules.market_universe.market_universe_service import MarketUniverseService, UniverseCacheUnavailableError
from app.modules.signals.trader_decisions_service import TraderDecisionsService
from app.modules.stock_details.decision.entry_applicability import PriceBasisEvent, build_entry_path_facts
from app.modules.stock_details.stock_details_decision_service import StockDetailsDecisionService
from app.modules.stock_details.stock_details_workspace_service import StockDetailsWorkspaceService
from app.modules.trading_intelligence.capture_inventory import capture_inventory, inspect_capture, verify_capture_coverage
from app.tests.test_canonical_generation_architecture import _canonical_fixture, _DetailsRepository, _MemoryRedis
from app.tests.test_entry_applicability import assess, terms
from app.tests.test_market_pulse_cache import _pulse
from app.tests.test_portfolios import _item, _price, _service


def coverage(ids):
    return {"universe_membership": list(ids), "input_keys": list(ids), "excluded_members": [],
        "membership_provenance": {"status": "OBSERVED_INDEPENDENT_LISTED_SET", "observed_at": "2026-11-11T00:00:00Z",
            "listed_count": len(ids), "market_coverage_verified": True}}


def normal_reader(*, warm=True, withdrawn=False):
    stock, prices, row, snapshot = _canonical_fixture()
    for price in prices:
        price.id = uuid4()
        price.turnover_provenance = "REPORTED"
    publication = SimpleNamespace(generation_id=snapshot.generation.sync_id,
        session_date=snapshot.generation.trade_date, observed_at=snapshot.generation.published_at,
        invalidated_at=datetime.now(UTC) if withdrawn else None, result_payload=snapshot.payload.model_dump(mode="json"))
    durable = SimpleNamespace(latest_publication=AsyncMock(return_value=publication),
        get_publication=AsyncMock(return_value=publication),
        publication_coverage=AsyncMock(return_value=coverage([str(stock.id)])))
    market = SimpleNamespace(list_quote_price_observations=AsyncMock(return_value=prices[-1:]),
        list_decision_event_observations=AsyncMock(return_value={}),
        list_entry_basis_events=AsyncMock(return_value={}),
        list_recent_exchange_session_dates=AsyncMock(return_value=[snapshot.generation.trade_date]),
        list_entry_path_observations=AsyncMock(return_value=([], [], None)))
    redis = _MemoryRedis()
    redis.is_available = warm
    if warm:
        from app.modules.market_universe.market_universe_cache import universe_cache_key
        redis.storage[universe_cache_key("scored", stock.exchange, snapshot.generation.sync_id)] = publication.result_payload
    universe = MarketUniverseService(market, SimpleNamespace(count_stocks=AsyncMock(return_value=1)), redis, Settings(), durable)
    # The normal canonical reader, projection and currentness check are exercised.
    universe.resolve_generation_context = AsyncMock(return_value=snapshot.generation)
    universe.resolve_quote_context = AsyncMock(return_value=snapshot.generation)
    details_repo = _DetailsRepository(stock, prices)
    details_repo.list_latest_metric_values = AsyncMock(return_value=[])
    details_repo.list_metric_histories = AsyncMock(return_value={})
    details = StockDetailsDecisionService(details_repo, universe)
    return stock, snapshot, universe, details, durable


@pytest.mark.asyncio
@pytest.mark.parametrize("warm", [True, False])
async def test_withdrawn_head_remains_visible_on_all_public_plan_reads(warm):
    stock, snapshot, universe, details, durable = normal_reader(warm=warm, withdrawn=True)
    rows = await universe.get_universe_rows(exchange=stock.exchange)
    signals = await TraderDecisionsService(universe).list_latest_trader_decisions(exchange=stock.exchange, limit=10, offset=0, price_window_limit=90)
    support = await details.get_decision_support(exchange=stock.exchange, symbol=stock.symbol)
    workspace = await StockDetailsWorkspaceService(details.repository, details, _MemoryRedis(), Settings()).get_workspace(exchange=stock.exchange, symbol=stock.symbol)
    row = snapshot.rows[0]
    technical = technical_snapshot_from_read(row.technical_snapshot)
    score = compute_pulse_score(technical, row.decision)
    focus = _to_focus_stock_read(PulsePresentationRow(stock, technical, row.decision, score,
        derive_pulse_focus_label(technical, row.decision, score)), 1)
    cached = _pulse("Cached").model_copy(update={"focus_stocks": [focus],
        "market_sync_id": snapshot.generation.sync_id, "last_synced_at": snapshot.generation.source_last_synced_at,
        "coverage": _pulse("Cached").coverage.model_copy(update={"decision_session_date": snapshot.generation.trade_date})})
    pulse_redis = _MemoryRedis()
    pulse_redis.storage[pulse_cache_key("response", stock.exchange, snapshot.generation.trade_date, snapshot.generation.sync_id)] = cached.model_dump(mode="json")
    pulse_service = MarketPulseService(market_data_service=SimpleNamespace(get_market_freshness=AsyncMock(
        return_value=SimpleNamespace(market_status=SimpleNamespace(value="OPEN")))),
        universe_service=universe, redis=pulse_redis, settings=Settings())
    pulse = await pulse_service.get_market_pulse(exchange=stock.exchange, previous=None)
    projections = [rows.rows[0].entry_applicability, signals[0].decision.entry_applicability,
        support.entry_applicability, workspace.decision_support.entry_applicability, pulse.focus_stocks[0].entry_applicability]
    assert all(item.reason_code == "PUBLICATION_INVALIDATED" for item in projections)
    assert not pulse.focus_stocks[0].actionable_trigger
    assert rows.meta.decision_generation_id == support.decision_generation_id == snapshot.generation.sync_id
    assert await universe.is_generation_current(snapshot.generation, exchange=stock.exchange)
    assert all(call.kwargs["generation_id"] == snapshot.generation.sync_id for call in durable.get_publication.await_args_list)


@pytest.mark.asyncio
async def test_cached_normal_read_uses_narrow_metadata_and_binds_quote_generation():
    stock, snapshot, universe, _, durable = normal_reader()
    durable.get_publication.side_effect = AssertionError("Cached read must not fetch the full durable result")
    first = snapshot.generation
    second = replace(first, sync_id="quote-B")
    universe.resolve_quote_context.side_effect = [first, first, second, second]
    with pytest.raises(UniverseCacheUnavailableError, match="Quote generation changed"):
        await universe.get_universe_rows(exchange=stock.exchange)
    assert all(call.kwargs["metadata_only"] for call in durable.latest_publication.await_args_list)


@pytest.mark.asyncio
async def test_workspace_cache_hit_refreshes_same_id_observation_and_status_together():
    stock, snapshot, universe, details, _ = normal_reader()
    workspace = StockDetailsWorkspaceService(details.repository, details, _MemoryRedis(), Settings())
    first = await workspace.get_workspace(exchange=stock.exchange, symbol=stock.symbol)
    quote = DisplayQuoteRead(current_price=110, previous_close=100, price_change=10, price_change_percent=10,
        as_of_trade_date=snapshot.generation.trade_date.isoformat(), observation_status="FINALIZED", data_quality="OK")
    universe.get_display_quotes = AsyncMock(return_value={stock.id: quote})
    second = await workspace.get_workspace(exchange=stock.exchange, symbol=stock.symbol)
    assert first.quote_generation_id == second.quote_generation_id
    assert second.display_metrics.current_price == 110
    assert second.display_metrics.price_change == 10
    assert second.decision_support.entry_applicability.quote_session_date == snapshot.generation.trade_date


@pytest.mark.asyncio
@pytest.mark.parametrize("breach,expected", [(True, "STOP_BREACHED"), (False, "PLAN_EXPIRED")])
async def test_public_read_retains_observed_session_after_same_manifest_stales_and_close_passes(monkeypatch, breach, expected):
    from app.core.enums import DecisionDisplayAction, EligibilityStatus
    from app.modules.market_universe.market_universe_cache import universe_cache_key
    from app.modules.market_universe.market_universe_lineage import compute_universe_payload_revision
    stock, snapshot, universe, _, durable = normal_reader()
    day = snapshot.generation.trade_date + timedelta(days=1)
    clock = [datetime.combine(day, datetime.min.time(), tzinfo=UTC).replace(hour=4)]
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return clock[0].astimezone(tz) if tz else clock[0].replace(tzinfo=None)
    monkeypatch.setattr("app.modules.market_universe.market_universe_service.datetime", Clock)
    original = snapshot.rows[0]
    plan = original.analysis.trade_plan.model_copy(update=vars(terms(expiry_sessions=1)))
    row = original.model_copy(update={"analysis": original.analysis.model_copy(update={"trade_plan": plan}),
        "eligibility": original.eligibility.model_copy(update={"status": EligibilityStatus.ELIGIBLE}),
        "decision": original.decision.model_copy(update={"display_action": DecisionDisplayAction.POTENTIAL_BUY})})
    payload = snapshot.payload.model_copy(update={"rows": [row], "payload_revision": compute_universe_payload_revision([row])})
    universe.redis.storage[universe_cache_key("scored", stock.exchange, snapshot.generation.sync_id)] = payload.model_dump(mode="json")
    quote_context = replace(snapshot.generation, sync_id="same-live-manifest", trade_date=day, data_state=MarketDataState.LIVE)
    universe.resolve_quote_context.return_value = quote_context
    universe.get_display_quotes = AsyncMock(return_value={stock.id: DisplayQuoteRead(current_price=100,
        as_of_trade_date=day.isoformat(), observation_status="PROVISIONAL", source_observed_at=clock[0], data_quality="OK")})
    bar = SimpleNamespace(stock_id=stock.id, trade_date=day, open_price=100, high_price=102, low_price=99,
        close_price=100, volume=1000, data_quality_flag="OK")
    prior = {"stock_id": str(stock.id), "trade_date": day.isoformat(), "open_price": "100", "high_price": "102",
        "low_price": "95" if breach else "99", "close_price": "100", "volume": 1000, "data_quality_flag": "OK"}
    revision = SimpleNamespace(session_date=day, observed_at=clock[0], payload={**prior, "low_price": "99"}, previous_payload=prior)
    universe.market_repository.list_entry_path_observations.return_value = ([bar], [revision], snapshot.generation.published_at-timedelta(days=1))
    first = await universe.get_universe_rows(exchange=stock.exchange)
    assert first.rows[0].entry_applicability.reason_code == ("STOP_BREACHED" if breach else "ENTRY_TERMS_MET")
    clock[0] += timedelta(hours=2)
    universe.resolve_quote_context.return_value = replace(quote_context, data_state=MarketDataState.STALE)
    stale = await universe.get_universe_rows(exchange=stock.exchange)
    assert stale.rows[0].entry_applicability.reason_code == ("STOP_BREACHED" if breach else "QUOTE_UNUSABLE")
    clock[0] = clock[0].replace(hour=10)  # 16:00 Dhaka: final session ended, DSEX still unfinalized.
    closed = await universe.get_universe_rows(exchange=stock.exchange)
    assert closed.rows[0].entry_applicability.reason_code == expected


@pytest.mark.parametrize("kind,low,expected", [("AGM", 99, "ENTRY_TERMS_MET"),
    ("SPLIT", 50, "PRICE_BASIS_CHANGED")])
def test_only_typed_basis_changes_invalidate_and_split_lows_are_not_old_unit_stops(kind, low, expected):
    day = date(2026, 11, 11)
    publication = datetime(2026, 11, 10, 10, tzinfo=UTC)
    row = SimpleNamespace(trade_date=day, open_price=max(low, 99), high_price=102, low_price=low,
        close_price=100, volume=1000, data_quality_flag="OK")
    path = build_entry_path_facts(prices=[row], revisions=[], sessions=[day], completed_sessions=[],
        reference_date=date(2026, 11, 10), published_at=publication, journal_started_at=publication-timedelta(days=1),
        basis_events=[PriceBasisEvent(day, kind)], plan=terms())
    assert assess(path=path).reason_code == expected


def test_genuine_comparable_stop_before_split_retains_stop_precedence():
    day, split = date(2026, 11, 11), date(2026, 11, 12)
    publication = datetime(2026, 11, 10, 10, tzinfo=UTC)
    rows = [SimpleNamespace(trade_date=when, open_price=100, high_price=102, low_price=low,
        close_price=100, volume=1000, data_quality_flag="OK") for when, low in ((day, 95), (split, 50))]
    path = build_entry_path_facts(prices=rows, revisions=[], sessions=[day, split], completed_sessions=[day],
        reference_date=date(2026, 11, 10), published_at=publication, journal_started_at=publication-timedelta(days=1),
        basis_events=[PriceBasisEvent(split, "SPLIT")], plan=terms())
    assert path.reliable_lows == ((day, 95),)
    assert assess(path=path).reason_code == "STOP_BREACHED"


@pytest.mark.asyncio
@pytest.mark.parametrize("available,fallback", [(True, False), (False, True), (False, False)])
async def test_public_portfolio_workspace_uses_quote_boundary_and_usable_fallback(available, fallback):
    from app.modules.market_universe.market_universe_schemas import UniverseRowsMetaRead, UniverseRowsRead
    item = _item(quantity=Decimal("10"), buy_price=Decimal("100"))
    _, _, row, snapshot = _canonical_fixture()
    row = row.model_copy(update={"stock": row.stock.model_copy(update={"id": item.stock.id}),
        "display_quote": DisplayQuoteRead(current_price=110 if available else None,
            previous_close=100, price_change=10, price_change_percent=10, as_of_trade_date="2026-07-21",
            observation_status="PROVISIONAL", data_quality="OK")})
    row.session.close_price = Decimal("100")
    universe = SimpleNamespace(get_universe_rows=AsyncMock(return_value=UniverseRowsRead(rows=[row],
        meta=UniverseRowsMetaRead(exchange=ExchangeCode.DSE, listed_stock_count=1,
            session_trade_date=date(2026, 7, 20), data_state=MarketDataState.FINALIZED,
            quote_session_date=date(2026, 7, 21), quote_data_state=MarketDataState.LIVE,
            quote_is_live_session=True, decision_generation_id="decision-A", quote_generation_id="quote-B"))))
    prices = {item.stock.id: _price(item.stock.id, close="110", previous="100", change="10", trade_date=date(2026, 7, 21))} if fallback else {}
    service, repository, _ = _service([item], prices, universe=universe)
    result = await service.get_workspace(exchange=ExchangeCode.DSE)
    holding = result.holdings[0]
    assert result.meta.published_market_date == date(2026, 7, 21)
    if available or fallback:
        assert holding.current_value == 1100 and holding.unrealized_gain_amount == 100
        assert holding.price_status == "PROVISIONAL" and holding.estimated_daily_change_amount == 100
        assert result.pulse.current_value_is_complete
    else:
        assert holding.current_value is None and not result.pulse.current_value_is_complete
    assert bool(repository.calls[1][1]) is (not available)


def test_capture_coverage_requires_external_population_explicit_exclusions_and_nonempty_window():
    facts = coverage(["one", "two"])
    facts["input_keys"] = ["one"]
    assert not verify_capture_coverage(facts, ["one"])["verified"]
    facts["excluded_members"] = [{"stock_id": "two", "reason_code": "NO_PRICE_WINDOW"}]
    assert verify_capture_coverage(facts, ["one"])["verified"]
    facts["membership_provenance"]["market_coverage_verified"] = False
    assert not verify_capture_coverage(facts, ["one"])["verified"]
    empty = SimpleNamespace(input_payload={"universe_membership": [], "inputs": {}}, result_payload={"rows": []},
        generation_id="empty", session_date=date(2026, 11, 10), observed_at=datetime.now(UTC), invalidated_at=None)
    report = capture_inventory([empty], expected_sessions=[date(2026, 11, 10), date(2026, 11, 11)])
    assert not report["healthy"] and report["missing_session_dates"] == ["2026-11-11"]


@pytest.mark.asyncio
async def test_publication_captures_listed_population_before_price_join_and_explicit_omission():
    stock, prices, _, snapshot = _canonical_fixture()
    omitted = uuid4()
    market = SimpleNamespace(list_decision_universe_membership=AsyncMock(return_value=[stock.id, omitted]),
        session_symbol_coverage=AsyncMock(return_value=(2, 2, 0)),
        list_market_price_windows=AsyncMock(return_value=[(stock, price) for price in prices]),
        list_daily_market_summaries=AsyncMock(return_value=[]),
        list_recent_exchange_session_dates=AsyncMock(return_value=[price.trade_date for price in prices]),
        list_corporate_action_dates_by_stock=AsyncMock(return_value={}),
        list_decision_event_observations=AsyncMock(return_value={}))
    async def publish(**kwargs):
        return SimpleNamespace(result_payload=kwargs["payload"])
    durable = SimpleNamespace(persist_missing=AsyncMock(return_value=1),
        latest_publication=AsyncMock(return_value=None), publish_generation=AsyncMock(side_effect=publish))
    universe = MarketUniverseService(market, object(), _MemoryRedis(), Settings(market_snapshot_min_source_symbols=1), durable)
    universe.resolve_generation_context = AsyncMock(return_value=snapshot.generation)
    universe.resolve_quote_context = AsyncMock(return_value=snapshot.generation)
    rows = await universe.recompute_scored_universe(stock.exchange)
    await universe.cache_scored_universe(stock.exchange, rows, generation=snapshot.generation)
    captured = durable.publish_generation.call_args.kwargs["inputs"]
    assert set(captured["universe_membership"]) == {str(stock.id), str(omitted)}
    assert captured["excluded_members"] == [{"stock_id": str(omitted), "reason_code": "NO_CAPTURED_INPUT"}]
    assert captured["membership_provenance"]["status"] == "OBSERVED_INDEPENDENT_LISTED_SET"


@pytest.mark.asyncio
async def test_existing_zero_manifest_is_not_certified_on_retry():
    repository = SimpleNamespace(lock_session_publication=AsyncMock(),
        get_latest_market_data_generation=AsyncMock(return_value=SimpleNamespace(sync_id="bad", accepted_count=0)),
        session=SimpleNamespace(rollback=AsyncMock()))
    with pytest.raises(MarketSnapshotCoverageError, match="no verified accepted coverage"):
        await MarketDataService(repository, ANONYMOUS_USER_CONTEXT).publish_finalized_market_generation(exchange=ExchangeCode.DSE, trade_date=date(2026, 11, 10))


@pytest.mark.asyncio
@pytest.mark.parametrize("warm", [True, False])
async def test_missing_required_winner_keeps_old_plan_visible_but_never_current_entry(monkeypatch, warm):
    from app.core.enums import DecisionDisplayAction, EligibilityStatus
    from app.modules.market_universe.market_universe_cache import universe_cache_key
    from app.modules.market_universe.market_universe_lineage import compute_universe_payload_revision
    monkeypatch.setattr("app.jobs.market_cache_spawn.spawn_rebuild_universe_read_cache", lambda *args, **kwargs: None)
    stock, snapshot, universe, _, durable = normal_reader(warm=warm)
    day = snapshot.generation.trade_date + timedelta(days=1)
    now = datetime.combine(day, datetime.min.time(), tzinfo=UTC).replace(hour=5)
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now.astimezone(tz) if tz else now.replace(tzinfo=None)
    monkeypatch.setattr("app.modules.market_universe.market_universe_service.datetime", Clock)
    original = snapshot.rows[0]
    row = original.model_copy(update={"analysis": original.analysis.model_copy(update={"trade_plan": original.analysis.trade_plan.model_copy(update=vars(terms()))}),
        "eligibility": original.eligibility.model_copy(update={"status": EligibilityStatus.ELIGIBLE}),
        "decision": original.decision.model_copy(update={"display_action": DecisionDisplayAction.POTENTIAL_BUY})})
    payload = snapshot.payload.model_copy(update={"rows": [row], "payload_revision": compute_universe_payload_revision([row])})
    durable.get_publication.return_value.result_payload = payload.model_dump(mode="json")
    universe.redis.storage[universe_cache_key("scored", stock.exchange, snapshot.generation.sync_id)] = payload.model_dump(mode="json")
    universe.resolve_quote_context.return_value = replace(snapshot.generation, trade_date=day, sync_id="quote", data_state=MarketDataState.LIVE)
    universe.get_display_quotes = AsyncMock(return_value={stock.id: DisplayQuoteRead(current_price=100,
        as_of_trade_date=day.isoformat(), source_observed_at=now, observation_status="PROVISIONAL", data_quality="OK")})
    bar = SimpleNamespace(stock_id=stock.id, trade_date=day, open_price=100, high_price=101, low_price=99,
        close_price=100, volume=1000, data_quality_flag="OK")
    universe.market_repository.list_entry_path_observations.return_value = ([bar], [], snapshot.generation.published_at-timedelta(days=1))
    control = await universe.get_universe_rows(exchange=stock.exchange)
    assert control.rows[0].entry_applicability.reason_code == "ENTRY_TERMS_MET"
    universe.resolve_generation_context.return_value = replace(snapshot.generation, sync_id="required-winner-missing")
    durable.publication_coverage.reset_mock()
    pending = await universe.get_universe_rows(exchange=stock.exchange)
    assert pending.meta.decision_status == "UPDATING"
    assert pending.meta.decision_generation_id == snapshot.generation.sync_id
    assert pending.rows[0].entry_applicability.reason_code == "COVERAGE_UNKNOWN"
    assert pending.rows[0].decision.canonical.shared_decision_id == row.decision.canonical.shared_decision_id
    durable.publication_coverage.assert_not_awaited()
    technical = technical_snapshot_from_read(row.technical_snapshot)
    score = compute_pulse_score(technical, row.decision)
    focus = _to_focus_stock_read(PulsePresentationRow(stock, technical, row.decision, score,
        derive_pulse_focus_label(technical, row.decision, score)), 1)
    pulse = _pulse("Cached").model_copy(update={"focus_stocks": [focus],
        "market_sync_id": snapshot.generation.sync_id, "last_synced_at": snapshot.generation.source_last_synced_at,
        "coverage": _pulse("Cached").coverage.model_copy(update={"decision_session_date": snapshot.generation.trade_date})})
    redis = _MemoryRedis()
    redis.storage[pulse_cache_key("response", stock.exchange, snapshot.generation.trade_date, snapshot.generation.sync_id)] = pulse.model_dump(mode="json")
    service = MarketPulseService(market_data_service=SimpleNamespace(get_market_freshness=AsyncMock(
        return_value=SimpleNamespace(market_status=SimpleNamespace(value="OPEN")))),
        universe_service=universe, redis=redis, settings=Settings())
    result = await service.get_market_pulse(exchange=stock.exchange, previous=None)
    assert result.decision_status == "UPDATING"
    assert result.focus_stocks[0].entry_applicability.reason_code == "COVERAGE_UNKNOWN"
    assert not result.focus_stocks[0].actionable_trigger


@pytest.mark.parametrize("verified,reason", [(True, "PRICE_BASIS_CHANGED"), (False, "PATH_INCOMPLETE")])
def test_weekend_basis_event_cuts_off_first_changed_unit_bar(verified, reason):
    reference, effective, first_bar = date(2026, 11, 12), date(2026, 11, 14), date(2026, 11, 15)
    publication = datetime(2026, 11, 12, 10, tzinfo=UTC)
    now = datetime(2026, 11, 15, 5, tzinfo=UTC)
    bar = SimpleNamespace(trade_date=first_bar, open_price=50, high_price=52, low_price=48,
        close_price=51, volume=1000, data_quality_flag="OK")
    path = build_entry_path_facts(prices=[bar], revisions=[], sessions=[first_bar], completed_sessions=[],
        reference_date=reference, published_at=publication, journal_started_at=publication-timedelta(days=1),
        basis_events=[PriceBasisEvent(effective, "SPLIT", verified)], plan=terms())
    assert not path.reliable_lows
    quote = DisplayQuoteRead(current_price=51, as_of_trade_date=first_bar.isoformat(), source_observed_at=now,
        observation_status="PROVISIONAL", data_quality="OK")
    assert assess(path=path, reference_date=reference, now=now, quote=quote).reason_code == reason


def test_holiday_basis_gap_preserves_prior_stop_and_ignores_post_expiry_action():
    reference, first, holiday, next_bar = date(2026, 11, 12), date(2026, 11, 15), date(2026, 11, 16), date(2026, 11, 18)
    publication = datetime(2026, 11, 12, 10, tzinfo=UTC)
    bars = [SimpleNamespace(trade_date=day, open_price=100, high_price=102, low_price=low,
        close_price=100, volume=1000, data_quality_flag="OK") for day, low in ((first, 95), (next_bar, 48))]
    common = dict(prices=bars, revisions=[], sessions=[first, next_bar], completed_sessions=[first],
        reference_date=reference, published_at=publication, journal_started_at=publication-timedelta(days=1),
        basis_events=[PriceBasisEvent(holiday, "SPLIT")])
    path = build_entry_path_facts(**common, plan=terms(expiry_sessions=2))
    assert path.basis_changed and path.reliable_lows == ((first, 95),)
    assert assess(path=path, plan=terms(expiry_sessions=2), reference_date=reference).reason_code == "STOP_BREACHED"
    bars[0].low_price = 99
    expired = build_entry_path_facts(**common, plan=terms(expiry_sessions=1))
    assert not expired.basis_changed and expired.reliable_lows == ((first, 99),)
    assert assess(path=expired, plan=terms(expiry_sessions=1), reference_date=reference).reason_code == "PLAN_EXPIRED"
