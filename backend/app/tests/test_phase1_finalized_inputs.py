from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.enums import (
    DataQualityFlag,
    ExchangeCode,
    MarketDataState,
    PatternStatus,
    TurnoverProvenance,
)
from app.models import DailyPrice
from app.modules.market_data.published_generation import resolve_finalized_decision_generation
from app.modules.stock_details.decision.canonical import build_strategy_input_from_prices
from app.modules.stock_details.decision.data_eligibility import evaluate_data_eligibility
from app.modules.stock_details.decision.display_metrics import build_quote_projection
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.stock_details.decision.patterns import detect_patterns
from app.modules.stock_details.decision.technical import build_technical_snapshot
from app.modules.trading_intelligence.input_capture import (
    capture_strategy_input,
    restore_strategy_input,
)


def prices(count=90):
    stock_id = uuid4()
    return [
        DailyPrice(
            stock_id=stock_id,
            trade_date=date(2026, 1, 1) + timedelta(days=i),
            open_price=Decimal("100"),
            high_price=Decimal("101"),
            low_price=Decimal("99"),
            close_price=Decimal("100"),
            volume=100000,
            turnover=Decimal("10000000"),
            trade_count=200,
            source="FIXTURE",
            data_quality_flag=DataQualityFlag.OK,
            turnover_provenance=TurnoverProvenance.REPORTED,
            updated_at=datetime(2026, 4, 1, tzinfo=UTC),
        )
        for i in range(count)
    ]


def test_calendar_denominator_preserves_no_trade_and_missing_sessions():
    rows = prices()
    sessions = [p.trade_date for p in rows]
    for p in rows[:30]:
        p.open_price = p.high_price = p.low_price = p.close_price = Decimal("0")
        p.volume = 0
    snapshot = build_technical_snapshot(rows, exchange_session_dates=sessions)
    assert snapshot.traded_session_ratio == pytest.approx(2 / 3)
    assert (
        snapshot.expected_session_count,
        snapshot.observed_session_count,
        snapshot.ohlcv_row_count,
        snapshot.zero_volume_session_count,
        snapshot.missing_session_count,
    ) == (90, 90, 60, 30, 0)
    missing = build_technical_snapshot(rows[10:], exchange_session_dates=sessions)
    assert (missing.missing_session_count, missing.zero_volume_session_count) == (10, 20)
    assert missing.traded_session_ratio == pytest.approx(2 / 3)


def test_corporate_action_guard_survives_lookback_then_warms_up():
    rows = prices(180)
    event = rows[70].trade_date
    for subset, expected in ((rows[:90], "KNOWN_UNADJUSTED"), (rows[90:], "NONE")):
        snapshot = build_technical_snapshot(subset)
        eligibility = evaluate_data_eligibility(
            subset, snapshot, category="A", is_active=True, known_corporate_action_dates={event}
        )
        assert eligibility.corporate_action_status == expected
    for row in rows[:90]:
        row.adjusted_close_price = row.close_price
    snapshot = build_technical_snapshot(rows[:90], adjustment_coverage_verified=True)
    assert (
        evaluate_data_eligibility(
            rows[:90], snapshot, category="A", is_active=True, known_corporate_action_dates={event}
        ).corporate_action_status
        == "RESOLVED"
    )


def test_capture_reproduces_original_and_same_session_correction():
    rows = prices()
    strategy = build_strategy_input_from_prices(
        rows,
        category="A",
        symbol="SPCL",
        reference_date=rows[-1].trade_date,
        exchange_session_dates=[p.trade_date for p in rows],
    )
    original = compute_trader_decision(strategy).canonical_result
    archived = capture_strategy_input(strategy)
    rows[-1].trade_count = 201
    revised = compute_trader_decision(strategy).canonical_result
    assert original.shared_decision_id != revised.shared_decision_id
    assert original.data_revision != revised.data_revision
    assert compute_trader_decision(restore_strategy_input(archived)).canonical_result == original
    revised_archive = capture_strategy_input(strategy)
    assert (
        compute_trader_decision(restore_strategy_input(revised_archive)).canonical_result == revised
    )
    assert archived["gaps"] and archived["prices"][-1]["trade_count"] == 200


def test_provisional_rows_and_finality_are_rejected():
    rows = prices()
    with pytest.raises(ValueError, match="FINALIZED"):
        build_strategy_input_from_prices(rows, category="A", finality=MarketDataState.LIVE)
    with pytest.raises(ValueError, match="boundary"):
        build_strategy_input_from_prices(rows, category="A", reference_date=rows[-2].trade_date)


def test_invalid_placeholder_cannot_supply_display_return():
    rows = prices(2)
    rows[0].price_change_percent = Decimal("2.5")
    rows[1].open_price = rows[1].high_price = rows[1].low_price = rows[1].close_price = Decimal("0")
    rows[1].price_change_percent = Decimal("-100")
    rows[1].volume = 0
    quote = build_quote_projection(rows)
    assert (
        quote["current_price"],
        quote["price_change_percent"],
        quote["as_of_trade_date"],
        quote["observation_status"],
    ) == (100.0, 2.5, "2026-01-01", "NO_TRADE")


@pytest.mark.asyncio
async def test_finalized_resolver_never_requests_live_generation():
    seen = []

    class Repository:
        async def get_latest_market_data_generation(self, **kwargs):
            seen.append(kwargs["state"])
            return SimpleNamespace(
                trade_date=date(2026, 1, 1),
                sync_id="final",
                source_last_synced_at=datetime(2026, 1, 1),
                published_at=datetime(2026, 1, 1),
            )

        async def finalized_input_revision(self, **kwargs):
            return "revision"

    result = await resolve_finalized_decision_generation(Repository(), exchange=ExchangeCode.DSE)
    assert seen == [MarketDataState.FINALIZED]
    assert result.sync_id.startswith("final:revision:")


def test_late_known_event_is_not_visible_before_knowledge_time():
    rows = prices()
    known_at = datetime(2026, 5, 1, tzinfo=UTC)
    event = {"effective_date": rows[40].trade_date.isoformat(), "known_at": known_at.isoformat()}
    strategy = build_strategy_input_from_prices(
        rows,
        category="A",
        known_corporate_action_dates={rows[40].trade_date},
        event_observations=(event,),
        calculated_at=datetime(2026, 4, 1, tzinfo=UTC),
    )
    assert strategy.known_corporate_action_dates == frozenset()
    assert strategy.event_observations == ()


def test_event_cutoff_uses_real_instants_and_exposes_missing_earlier_revision():
    rows = prices()
    original = {
        "event_id": "split",
        "effective_date": rows[40].trade_date.isoformat(),
        "known_at": "2026-03-01T00:00:00",
        "revision_observed_at": "2026-03-01T00:00:00Z",
        "values": {"ratio": "2:1"},
    }
    corrected = {
        **original,
        "effective_date": rows[41].trade_date.isoformat(),
        "revision_observed_at": "2026-04-01T05:00:00Z",
        "values": {"ratio": "3:1"},
    }
    unknown = {
        **original,
        "event_id": "later",
        "known_at": "2026-04-01T05:00:00Z",
        "revision_observed_at": "2026-04-01T05:00:00Z",
    }
    for cutoff in ("2026-04-01T04:00:00Z", "2026-04-01T10:00:00+06:00"):
        kwargs = {"category": "A", "calculated_at": datetime.fromisoformat(cutoff)}
        missing = build_strategy_input_from_prices(
            rows, event_observations=(corrected, unknown), **kwargs
        )
        assert missing.event_observations == ()
        assert missing.known_corporate_action_dates == frozenset()
        assert missing.event_coverage_status == "REVISION_UNAVAILABLE"
        assert (
            "event_revision_unavailable"
            in compute_trader_decision(missing).eligibility.reason_codes
        )
        earlier = build_strategy_input_from_prices(
            rows, event_observations=(corrected, original, unknown), **kwargs
        )
        assert earlier.event_observations == (original,)
        assert earlier.known_corporate_action_dates == {rows[40].trade_date}
    revised = build_strategy_input_from_prices(
        rows,
        category="A",
        calculated_at=datetime.fromisoformat("2026-04-01T11:00:00+06:00"),
        event_observations=(original, corrected),
    )
    assert revised.event_observations == (corrected,)
    assert revised.known_corporate_action_dates == {rows[41].trade_date}


@pytest.mark.asyncio
@pytest.mark.parametrize("clean_pattern", [False, True])
async def test_details_patterns_use_only_valid_post_split_warmup(clean_pattern):
    from app.modules.market_universe.market_universe_compute import (
        build_scored_universe_rows,
        group_price_window_rows,
        technical_snapshot_from_read,
    )
    from app.modules.stock_details.stock_details_decision_service import StockDetailsDecisionService
    from app.tests.test_canonical_generation_architecture import (
        _canonical_fixture,
        _CanonicalUniverseDouble,
        _DetailsRepository,
    )

    stock, _, _, fixture = _canonical_fixture()
    rows = prices(260)
    split = rows[130].trade_date
    for i, row in enumerate(rows):
        row.stock_id = stock.id
        if i < 130:
            close = 120 - min(abs(i - 50), abs(i - 80)) * 0.9
        elif clean_pattern:
            close = 65 - min(abs(i - 170), abs(i - 205)) * 0.45
        else:
            close = 50 + (i - 130) / 10
        row.open_price = row.close_price = Decimal(str(close))
        row.high_price, row.low_price = row.close_price + 1, row.close_price - 1
    scored = build_scored_universe_rows(
        group_price_window_rows([(stock, row) for row in rows[-90:]])
    )
    row = scored[0]
    assert row.eligibility.corporate_action_status == "NONE"
    if not clean_pattern:
        unguarded = detect_patterns(technical_snapshot_from_read(row.technical_snapshot), rows)
        assert any(
            pattern.name == "Double Top" and pattern.status == PatternStatus.CONFIRMED
            for pattern in unguarded
        )
    generation = replace(fixture.generation, trade_date=rows[-1].trade_date)
    snapshot = replace(
        fixture, generation=generation, payload=fixture.payload.model_copy(update={"rows": scored})
    )
    universe = _CanonicalUniverseDouble(snapshot)
    universe.get_decision_event_observations = AsyncMock(
        return_value=(
            {
                "event_id": "split",
                "effective_date": split.isoformat(),
                "known_at": "2026-01-01T00:00:00Z",
            },
        )
    )
    service = StockDetailsDecisionService(_DetailsRepository(stock, rows), universe)
    result = await service.get_decision_support(exchange=stock.exchange, symbol=stock.symbol)
    assert result.canonical_decision == row.decision.canonical
    if clean_pattern:
        assert any(pattern.name == "Double Top" for pattern in result.patterns)
        assert all(
            date.fromisoformat(point.date) >= split
            for pattern in result.patterns
            for point in pattern.swing_points
        )
    else:
        assert all(pattern.name != "Double Top" for pattern in result.patterns)


@pytest.mark.asyncio
@pytest.mark.parametrize("observed", [True, False])
async def test_universe_and_details_quote_projection_ignores_prior_decision_age(observed):
    from app.core.core_config import Settings
    from app.modules.market_universe.market_universe_service import MarketUniverseService
    from app.modules.stock_details.stock_details_decision_service import StockDetailsDecisionService
    from app.modules.stock_details.stock_details_workspace_service import (
        StockDetailsWorkspaceService,
    )
    from app.tests.test_canonical_generation_architecture import (
        _canonical_fixture,
        _DetailsRepository,
        _MemoryRedis,
    )

    stock, decision_rows, decision_row, fixture = _canonical_fixture()
    for row in decision_rows:
        row.id = uuid4()
        row.turnover_provenance = TurnoverProvenance.REPORTED
    d1 = decision_rows[-1].trade_date
    d2, d3 = d1 + timedelta(days=1), d1 + timedelta(days=2)
    valid, placeholder = prices(2)
    for row, day in ((valid, d2), (placeholder, d3)):
        row.stock_id, row.trade_date, row.id = stock.id, day, uuid4()
        row.created_at = row.updated_at
    valid.open_price, valid.high_price, valid.close_price = (
        Decimal("109"),
        Decimal("111"),
        Decimal("110"),
    )
    valid.price_change_percent = Decimal("10")
    placeholder.open_price = placeholder.high_price = placeholder.low_price = (
        placeholder.close_price
    ) = Decimal("0")
    placeholder.volume, placeholder.price_change_percent = 0, Decimal("-100")
    observations = [valid, placeholder] if observed else [valid]
    quote_context = replace(
        fixture.generation, sync_id="live", trade_date=d3, data_state=MarketDataState.LIVE
    )
    fixture = replace(fixture, updating=True)
    repository = SimpleNamespace(list_quote_price_observations=AsyncMock(return_value=observations),
        list_recent_exchange_session_dates=AsyncMock(return_value=[d1,d2,d3]),
        list_observed_exchange_session_dates=AsyncMock(return_value=[d1,d2,d3]))
    stocks = SimpleNamespace(count_stocks=AsyncMock(return_value=1))
    universe = MarketUniverseService(repository, stocks, _MemoryRedis(), Settings())
    universe.get_canonical_universe = AsyncMock(return_value=fixture)
    universe.resolve_generation_context = AsyncMock(return_value=fixture.generation)
    universe.resolve_quote_context = AsyncMock(return_value=quote_context)
    universe.is_generation_current = AsyncMock(return_value=True)
    details_repository = _DetailsRepository(stock, decision_rows + observations)
    details_repository.list_latest_metric_values = AsyncMock(return_value=[])
    details_repository.list_metric_histories = AsyncMock(return_value={})
    details = StockDetailsDecisionService(details_repository, universe)
    workspace = StockDetailsWorkspaceService(
        details_repository, details, _MemoryRedis(), Settings()
    )
    rows = await universe.get_universe_rows(exchange=stock.exchange)
    result = await workspace.get_workspace(exchange=stock.exchange, symbol=stock.symbol)

    expected_status = "NO_TRADE" if observed else "UNAVAILABLE"
    quote = rows.rows[0].display_quote
    assert quote.model_dump() == {
        "previous_close": None,
        "source": valid.source,
        "data_quality": "OK",
        "ingested_at": valid.updated_at,
        "source_observed_at": None,
        "max_age_seconds": 1800,
        "current_price": 110.0,
        "price_change": None,
        "price_change_percent": 10.0,
        "as_of_trade_date": d2.isoformat(),
        "observation_session_date": (d3 if observed else d2).isoformat(),
        "observation_status": expected_status,
    }
    assert (
        result.display_metrics.model_dump(include=set(type(quote).model_fields))
        == quote.model_dump()
    )
    assert result.decision_support.canonical_decision == decision_row.decision.canonical
    assert all(
        call.kwargs == {"stock_ids": {stock.id}, "end_date": d3}
        for call in repository.list_quote_price_observations.await_args_list
    )


@pytest.mark.asyncio
async def test_cold_failed_rebuild_prior_and_invalidated_publication(monkeypatch):
    from unittest.mock import AsyncMock

    from app.core.core_config import Settings
    from app.modules.market_universe.market_universe_service import (
        MarketUniverseService,
        UniverseCacheUnavailableError,
    )
    from app.tests.test_canonical_generation_architecture import _canonical_fixture, _MemoryRedis

    _, _, _, fixture = _canonical_fixture()
    old = replace(fixture.generation, data_state=MarketDataState.FINALIZED)
    payload = fixture.payload.model_copy(
        update={
            "data_state": MarketDataState.FINALIZED,
            "is_live_session": False,
            "live_data_as_of": None,
        }
    )
    publication = SimpleNamespace(
        generation_id=old.sync_id,
        session_date=old.trade_date,
        observed_at=old.published_at,
        invalidated_at=None,
        result_payload=payload.model_dump(mode="json"),
    )
    repo = SimpleNamespace(latest_publication=AsyncMock(return_value=None), get_publication=AsyncMock(return_value=publication))
    service = MarketUniverseService(object(), object(), _MemoryRedis(), Settings(), repo)
    service.resolve_generation_context = AsyncMock(return_value=replace(old, sync_id="new"))
    rebuild = AsyncMock()
    monkeypatch.setattr("app.jobs.market_cache_spawn.spawn_rebuild_universe_read_cache", rebuild)
    with pytest.raises(UniverseCacheUnavailableError):
        await service.get_canonical_universe(exchange=ExchangeCode.DSE, allow_rebuild=False)
    rebuild.assert_not_called()
    repo.latest_publication.return_value = publication
    result = await service.get_canonical_universe(exchange=ExchangeCode.DSE, allow_rebuild=False)
    assert result.updating and result.generation.sync_id == old.sync_id
    assert result.payload.decision_session_date == old.trade_date
    publication.invalidated_at = datetime.now(UTC)
    withdrawn = await service.get_canonical_universe(exchange=ExchangeCode.DSE, allow_rebuild=False)
    assert withdrawn.withdrawn and withdrawn.generation.sync_id == old.sync_id
    rebuild.assert_not_called()


def test_all_invalid_rows_produce_unavailable_decision_not_disappearing_instrument():
    rows = prices(90)
    for row in rows:
        row.open_price = row.high_price = row.low_price = row.close_price = Decimal("0")
        row.volume = 0
    bundle = compute_trader_decision(build_strategy_input_from_prices(rows, category="A"))
    assert bundle is not None
    assert bundle.canonical_result.evidence_status == "UNAVAILABLE"
    assert bundle.canonical_result.entry_condition is None
    assert bundle.snapshot.traded_session_ratio == 0


@pytest.mark.asyncio
async def test_freshness_preserves_prior_date_and_marks_update_then_invalidated():
    from unittest.mock import AsyncMock

    from app.core.security_config import ANONYMOUS_USER_CONTEXT
    from app.modules.market_data.market_data_service import MarketDataService

    publication = SimpleNamespace(
        generation_id="prior", session_date=date(2026, 1, 1), invalidated_at=None
    )
    repository = SimpleNamespace(
        get_decision_publication_context=AsyncMock(
            return_value=(publication, SimpleNamespace(sync_id="target"))
        ),
        get_market_price_freshness=AsyncMock(
            return_value=(date(2026, 1, 3), datetime(2026, 1, 3, tzinfo=UTC))
        ),
        get_decision_session_freshness=AsyncMock(
            return_value=(date(2026, 1, 2), datetime(2026, 1, 2, tzinfo=UTC))
        ),
    )
    service = MarketDataService(repository, ANONYMOUS_USER_CONTEXT)
    service._resolve_published_market_generation = AsyncMock(return_value=None)
    result = await service.get_market_freshness(exchange=ExchangeCode.DSE)
    assert (
        result.decision_generation_id,
        result.decision_session_date,
        result.decision_status,
    ) == ("prior", date(2026, 1, 1), "UPDATING")
    publication.invalidated_at = datetime.now(UTC)
    result = await service.get_market_freshness(exchange=ExchangeCode.DSE)
    assert (
        result.decision_generation_id,
        result.decision_session_date,
        result.decision_status,
    ) == (None, None, "UNAVAILABLE")
