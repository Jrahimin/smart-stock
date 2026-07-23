from __future__ import annotations

from dataclasses import asdict
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import pytest

from app.core.constants.trading_constants import (
    DECISION_TAXONOMY_VERSION,
    SCANNER_CONDITION_VERSION,
    TRADING_INPUT_SCHEMA_VERSION,
    TRADING_STRATEGY_VERSION,
    TRADING_THRESHOLD_VERSION,
)
from app.core.core_config import Settings
from app.core.enums import (
    DataQualityFlag,
    ExchangeCode,
    MarketDataState,
    TraderRecommendation,
    TurnoverProvenance,
)
from app.models import CanonicalDecisionSnapshot, DailyPrice, Stock
from app.modules.backtesting.backtesting_manifest import (
    build_replay_manifest,
    replay_manifest_mismatches,
)
from app.modules.backtesting.backtesting_models import (
    BacktestConfig,
    BacktestDataset,
    StockReplayHistory,
)
from app.modules.market_universe.market_universe_cache import (
    universe_cache_key,
    universe_prev_cache_key,
)
from app.modules.market_universe.market_universe_compute import (
    build_scored_universe_rows,
    group_price_window_rows,
)
from app.modules.market_universe.market_universe_lineage import (
    compute_universe_payload_revision,
)
from app.modules.market_universe.market_universe_schemas import ScoredUniverseCacheRead
from app.modules.market_universe.market_universe_service import (
    FINALIZED_UNIVERSE_CACHE_TTL_SECONDS,
    MarketUniverseService,
    UniverseCacheUnavailableError,
    universe_cache_ttl_seconds,
)
from app.modules.stock_details.decision import scoring as decision_scoring
from app.modules.stock_details.decision.canonical import build_strategy_input
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.stock_details.decision.summary import build_trader_decision_summary
from app.modules.stock_details.stock_details_schemas import CanonicalDecisionResultRead
from app.modules.trading_intelligence.decision_snapshot_repository import (
    decision_snapshot_values,
)
from app.modules.trading_intelligence.monitoring import monitor_universe_payload

STOCK_ID = UUID("48a3cc2f-1d78-4ce5-82ef-33b99f720170")
CALCULATED_AT = datetime(2026, 7, 14, 18, tzinfo=UTC)


def _stock() -> Stock:
    return Stock(
        id=STOCK_ID,
        symbol="AUDIT",
        name="Audit Industries",
        exchange=ExchangeCode.DSE,
        sector="Engineering",
        category="A",
        is_active=True,
        should_fetch_details=False,
        created_at=CALCULATED_AT,
        updated_at=CALCULATED_AT,
    )


def _prices(*, close_adjustment: Decimal = Decimal("0")) -> list[DailyPrice]:
    prices: list[DailyPrice] = []
    for index in range(60):
        close = Decimal("100") + Decimal(index) * Decimal("0.35")
        if index == 59:
            close += close_adjustment
        prices.append(
            DailyPrice(
                stock_id=STOCK_ID,
                trade_date=date(2026, 5, 1) + timedelta(days=index),
                open_price=close - Decimal("0.20"),
                high_price=close + Decimal("0.80"),
                low_price=close - Decimal("0.80"),
                close_price=close,
                previous_close_price=(close - Decimal("0.35")) if index else close,
                volume=250_000 + index * 1_000,
                turnover=Decimal("25000000") + Decimal(index * 100_000),
                turnover_provenance=TurnoverProvenance.REPORTED,
                source="AUDIT_FIXTURE",
                data_quality_flag=DataQualityFlag.OK,
            )
        )
    return prices


def _strategy_input(
    *,
    prices: list[DailyPrice] | None = None,
    corporate_action_dates: set[date] | None = None,
    calculated_at: datetime = CALCULATED_AT,
):
    resolved_prices = prices or _prices()
    return build_strategy_input(
        _stock(),
        resolved_prices,
        reference_date=resolved_prices[-1].trade_date,
        known_corporate_action_dates=corporate_action_dates,
        exchange_session_dates=[price.trade_date for price in resolved_prices[-10:]],
        market_regime="NEUTRAL",
        calculated_at=calculated_at,
    )


def _universe_row():
    stock = _stock()
    prices = _prices()
    rows = build_scored_universe_rows(
        group_price_window_rows([(stock, price) for price in prices]),
        market_regime="NEUTRAL",
        exchange_session_dates=[price.trade_date for price in prices[-10:]],
    )
    assert len(rows) == 1
    return rows[0]


def test_audit_metadata_round_trip_and_content_revision_identity() -> None:
    first_bundle = compute_trader_decision(_strategy_input())
    later_bundle = compute_trader_decision(
        _strategy_input(calculated_at=CALCULATED_AT + timedelta(hours=1))
    )
    changed_bundle = compute_trader_decision(
        _strategy_input(prices=_prices(close_adjustment=Decimal("0.10")))
    )
    event_bundle = compute_trader_decision(
        _strategy_input(corporate_action_dates={date(2026, 6, 29)})
    )
    assert first_bundle is not None
    assert later_bundle is not None
    assert changed_bundle is not None
    assert event_bundle is not None

    first = first_bundle.canonical_result
    assert first.shared_decision_id == later_bundle.canonical_result.shared_decision_id
    assert first.input_hash == later_bundle.canonical_result.input_hash
    assert first.data_revision != changed_bundle.canonical_result.data_revision
    assert first.shared_decision_id != changed_bundle.canonical_result.shared_decision_id
    assert first.event_revision != event_bundle.canonical_result.event_revision
    assert first.shared_decision_id != event_bundle.canonical_result.shared_decision_id

    read = CanonicalDecisionResultRead.model_validate(
        build_trader_decision_summary(first_bundle).canonical.model_dump(mode="json")
    )
    assert read.input_schema_version == TRADING_INPUT_SCHEMA_VERSION
    assert read.input_hash == first.input_hash
    assert read.replay_status == "IDENTIFIED_WITH_LIMITATIONS"


def test_immutable_snapshot_values_round_trip_canonical_audit_contract() -> None:
    row = _universe_row()
    values = decision_snapshot_values(row)
    assert values is not None
    snapshot = CanonicalDecisionSnapshot(**values)
    restored = CanonicalDecisionResultRead.model_validate(snapshot.result_payload)
    assert restored.shared_decision_id == snapshot.shared_decision_id
    assert restored.input_hash == snapshot.input_hash
    assert restored.data_revision == snapshot.data_revision
    assert restored.event_revision == snapshot.event_revision
    assert snapshot.replay_limitations == restored.replay_limitations


def test_approved_versions_separate_cache_and_snapshot_history() -> None:
    current = universe_cache_key("scored", ExchangeCode.DSE)
    changed_threshold = universe_cache_key(
        "scored",
        ExchangeCode.DSE,
        TRADING_STRATEGY_VERSION,
        "trading-thresholds-approved-v3",
        TRADING_INPUT_SCHEMA_VERSION,
    )
    changed_input_schema = universe_cache_key(
        "scored",
        ExchangeCode.DSE,
        TRADING_STRATEGY_VERSION,
        TRADING_THRESHOLD_VERSION,
        "trading-input-approved-v2",
    )
    assert len({current, changed_threshold, changed_input_schema}) == 3

    values = decision_snapshot_values(_universe_row())
    assert values is not None
    assert values["strategy_version"] == TRADING_STRATEGY_VERSION
    assert values["threshold_version"] == TRADING_THRESHOLD_VERSION
    assert values["input_schema_version"] == TRADING_INPUT_SCHEMA_VERSION


def test_replay_manifest_reproduces_and_detects_data_revision_change() -> None:
    prices = tuple(_prices())
    dataset = BacktestDataset(
        histories=(StockReplayHistory(stock=_stock(), prices=prices),),
        session_dates=tuple(price.trade_date for price in prices),
        limitations=("TEST_POINT_IN_TIME_LIMITATION",),
    )
    config = BacktestConfig(
        exchange=ExchangeCode.DSE,
        start_date=prices[30].trade_date,
        end_date=prices[-1].trade_date,
    )
    first = build_replay_manifest(config, dataset, (), ())
    repeated = build_replay_manifest(config, dataset, (), ())
    assert first == repeated
    assert replay_manifest_mismatches(asdict(first), repeated) == ()

    changed_prices = tuple(_prices(close_adjustment=Decimal("0.10")))
    changed_dataset = BacktestDataset(
        histories=(StockReplayHistory(stock=_stock(), prices=changed_prices),),
        session_dates=dataset.session_dates,
        limitations=dataset.limitations,
    )
    changed = build_replay_manifest(config, changed_dataset, (), ())
    assert replay_manifest_mismatches(asdict(first), changed) == (
        "dataset_revision",
        "manifest_id",
    )


def test_monitoring_detects_seeded_stale_and_cross_surface_mismatch() -> None:
    row = _universe_row()
    source_synced_at = datetime(2026, 7, 14, 15, tzinfo=UTC)
    payload = ScoredUniverseCacheRead(
        strategy_version=TRADING_STRATEGY_VERSION,
        threshold_version=TRADING_THRESHOLD_VERSION,
        input_schema_version=TRADING_INPUT_SCHEMA_VERSION,
        session_trade_date=row.decision.canonical.as_of_date,
        source_last_synced_at=source_synced_at,
        payload_revision=compute_universe_payload_revision([row]),
        rows=[row],
    )
    canonical = row.decision.canonical
    mismatched = canonical.model_copy(
        update={
            "recommendation": TraderRecommendation.SELL,
            "shared_decision_id": "seeded-cross-surface-mismatch",
        }
    )
    report = monitor_universe_payload(
        payload,
        expected_session_date=payload.session_trade_date,
        expected_source_last_synced_at=source_synced_at + timedelta(minutes=1),
        cross_surface_results=(mismatched,),
    )
    assert {issue.code for issue in report.issues} == {
        "STALE_SOURCE_REVISION",
        "CROSS_SURFACE_RESULT_MISMATCH",
    }
    assert report.has_errors is True


def test_selected_canonical_golden_regression() -> None:
    bundle = compute_trader_decision(_strategy_input())
    assert bundle is not None
    result = bundle.canonical_result
    actual = {
        "strategy_version": result.strategy_version,
        "threshold_version": result.threshold_version,
        "input_schema_version": result.input_schema_version,
        "data_revision": result.data_revision,
        "event_revision": result.event_revision,
        "input_hash": result.input_hash,
        "shared_decision_id": result.shared_decision_id,
        "recommendation": result.recommendation.value,
        "internal_action": result.internal_action.value,
        "display_action": result.display_action.value,
        "decision_taxonomy_version": result.decision_taxonomy_version,
        "eligibility_status": result.eligibility_status.value,
        "evidence_strength": result.evidence_strength,
        "opportunity_score": result.opportunity_score,
        "opportunity_quality": result.opportunity_quality.value,
        "entry_readiness": result.entry_readiness.value,
        "entry_timing": result.entry_timing.value if result.entry_timing is not None else None,
        "blocker_codes": result.blocker_codes,
        "primary_reason_code": result.primary_reason_code,
    }
    assert actual == {
        "strategy_version": "trading-intelligence-v2",
        "threshold_version": "trading-thresholds-v3",
        "input_schema_version": "trading-input-v2",
        "data_revision": "db363fc0f5760b4b20a52d8142b635a87ad4b1d30747f9c3bd4ed49f5ff9b187",
        "event_revision": "3ad061b2af20f48de19f53c1e1084967a7c2340aa1b798e2272e2ea75493d99e",
        "input_hash": "b35c17a83fcc7e6e8c79653794daf1d818afd509f1740d9244dfdc15fc77ad85",
        "shared_decision_id": "8ec230e1-a8f2-5499-b4c0-5726e23fdfd8",
        "recommendation": "WAIT",
        "internal_action": "WAIT",
        "display_action": "WAIT",
        "decision_taxonomy_version": "v2",
        "eligibility_status": "ELIGIBLE",
        "evidence_strength": 54,
        "opportunity_score": 59,
        "opportunity_quality": "STRONG",
        "entry_readiness": "NOT_READY",
        "entry_timing": None,
        "blocker_codes": ("extended_momentum",),
        "primary_reason_code": "fresh_entry_risk_block",
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "previous_cache",
    [None, {"invalid": True}],
    ids=["cold-cache", "incompatible-previous-cache"],
)
async def test_unavailable_universe_cache_triggers_one_rebuild_before_503(
    monkeypatch: pytest.MonkeyPatch,
    previous_cache: dict | None,
) -> None:
    class MarketRepository:
        async def get_market_price_freshness(self, **kwargs):
            return date(2026, 7, 14), CALCULATED_AT

        async def get_decision_session_freshness(self, **kwargs):
            return date(2026, 7, 14), CALCULATED_AT

        async def get_latest_finalized_session_date(self, **kwargs):
            return date(2026, 7, 14)

    class StocksRepository:
        pass

    class EmptyRedis:
        is_available = True

        async def get_json(self, key):
            if key == universe_prev_cache_key(ExchangeCode.DSE):
                return previous_cache
            return None

    service = MarketUniverseService(
        MarketRepository(),
        StocksRepository(),
        EmptyRedis(),
        Settings(),
    )
    rebuild_calls: list[ExchangeCode] = []
    monkeypatch.setattr(
        "app.jobs.market_cache_spawn.spawn_rebuild_universe_read_cache",
        lambda exchange, **kwargs: rebuild_calls.append(exchange),
    )
    with pytest.raises(UniverseCacheUnavailableError, match="background rebuild required"):
        await service.get_scored_universe(exchange=ExchangeCode.DSE)
    assert rebuild_calls == [ExchangeCode.DSE]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "previous_state",
    [MarketDataState.LIVE, MarketDataState.FINALIZATION_PENDING],
)
async def test_same_session_intraday_previous_cache_bridges_finalized_generation(
    monkeypatch: pytest.MonkeyPatch,
    previous_state: MarketDataState,
) -> None:
    from types import SimpleNamespace

    session_date = date(2026, 7, 23)
    source_synced_at = datetime(2026, 7, 23, 14, 30, tzinfo=UTC)

    class MarketRepository:
        async def get_market_price_freshness(self, **kwargs):
            return session_date, source_synced_at

        async def get_decision_session_freshness(self, **kwargs):
            return session_date, source_synced_at

        async def get_latest_finalized_session_date(self, **kwargs):
            return session_date

        async def get_latest_market_data_generation(self, *, state, trade_date=None, **kwargs):
            if state == MarketDataState.FINALIZED:
                return SimpleNamespace(
                    trade_date=session_date,
                    sync_id="finalized-sync",
                    source_last_synced_at=source_synced_at,
                    published_at=source_synced_at,
                )
            return None

    row = SimpleNamespace(
        eligibility=SimpleNamespace(exchange_session_date=session_date),
        decision=SimpleNamespace(
            canonical=SimpleNamespace(
                strategy_version=TRADING_STRATEGY_VERSION,
                threshold_version=TRADING_THRESHOLD_VERSION,
                decision_taxonomy_version=DECISION_TAXONOMY_VERSION,
            )
        ),
        scanner=SimpleNamespace(version=SCANNER_CONDITION_VERSION),
    )
    previous_payload = SimpleNamespace(
        decision_session_date=session_date,
        session_trade_date=session_date,
        source_last_synced_at=source_synced_at,
        market_sync_id="older-live-sync",
        data_state=previous_state,
        strategy_version=TRADING_STRATEGY_VERSION,
        threshold_version=TRADING_THRESHOLD_VERSION,
        input_schema_version=TRADING_INPUT_SCHEMA_VERSION,
        decision_taxonomy_version=DECISION_TAXONOMY_VERSION,
        scanner_version=SCANNER_CONDITION_VERSION,
        rows=[row],
    )

    class PreviousOnlyRedis:
        is_available = True

        async def get_json(self, key):
            if key == universe_prev_cache_key(ExchangeCode.DSE):
                return {"previous": True}
            return None

        async def get_ttl_seconds(self, key):
            return 42

    service = MarketUniverseService(
        MarketRepository(),
        object(),
        PreviousOnlyRedis(),
        Settings(),
    )
    monkeypatch.setattr(service, "_parse_cache_payload", lambda payload: previous_payload)
    rebuild_calls: list[ExchangeCode] = []
    monkeypatch.setattr(
        "app.jobs.market_cache_spawn.spawn_rebuild_universe_read_cache",
        lambda exchange, **kwargs: rebuild_calls.append(exchange),
    )

    assert await service.get_scored_universe(exchange=ExchangeCode.DSE) == [row]
    assert rebuild_calls == [ExchangeCode.DSE]

    previous_payload.source_last_synced_at = source_synced_at + timedelta(seconds=1)
    assert not service._previous_cache_can_bridge_rebuild(
        previous_payload,
        session_date,
        source_synced_at,
        MarketDataState.FINALIZED,
    )


def test_finalized_universe_ttl_survives_overnight_and_closed_days() -> None:
    ttl_seconds = universe_cache_ttl_seconds(
        Settings(),
        data_state=MarketDataState.FINALIZED,
        now=datetime(2026, 7, 23, 15, 15, tzinfo=UTC),
    )

    assert ttl_seconds == FINALIZED_UNIVERSE_CACHE_TTL_SECONDS
    assert ttl_seconds > 8 * 60 * 60


def test_retired_legacy_recommendation_path_is_not_importable() -> None:
    assert not hasattr(decision_scoring, "_legacy_compute_recommendation")
    assert not hasattr(decision_scoring, "compute_decision_confidence")
