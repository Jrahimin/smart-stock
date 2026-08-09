from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import Depends

from app.core.constants.trading_constants import (
    DECISION_TAXONOMY_VERSION,
    ELIGIBILITY_SESSION_LOOKBACK,
    PULSE_PRICE_WINDOW_LIMIT,
    PULSE_UNIVERSE_LIMIT,
    REGIME_SUMMARY_FETCH_LIMIT,
    SCANNER_CONDITION_VERSION,
    TRADING_INPUT_SCHEMA_VERSION,
    TRADING_STRATEGY_VERSION,
    TRADING_THRESHOLD_VERSION,
)
from app.core.core_config import Settings, get_settings
from app.core.enums import ExchangeCode, MarketDataState
from app.core.perf_timing import PerfReport, async_perf_stage
from app.core.redis_client import OptionalRedisClient, get_redis_client
from app.jobs.market_session_schedule import current_cache_ttl_seconds, resolve_market_status
from app.modules.market_data.market_data_repository import (
    MarketDataRepository,
    get_market_data_repository,
)
from app.modules.market_data.published_generation import (
    PublishedMarketGeneration,
    resolve_published_market_generation,
)
from app.modules.market_universe.market_universe_cache import (
    universe_cache_key,
)
from app.modules.market_universe.market_universe_compute import (
    build_scored_universe_rows,
    group_price_window_rows,
)
from app.modules.market_universe.market_universe_lineage import (
    compute_universe_payload_revision,
)
from app.modules.market_universe.market_universe_schemas import (
    ScoredUniverseCacheRead,
    ScoredUniverseRow,
    UniverseRowsMetaRead,
    UniverseRowsRead,
)
from app.modules.stock_details.decision.market_regime import (
    resolve_regime_result_from_summaries,
)
from app.modules.stocks.stocks_repository import StocksRepository, get_stocks_repository
from app.modules.trading_intelligence.decision_snapshot_repository import (
    DecisionSnapshotRepository,
    get_decision_snapshot_repository,
)
from app.modules.trading_intelligence.monitoring import (
    build_decision_funnel,
    log_monitoring_report,
    monitor_universe_payload,
)

logger = logging.getLogger(__name__)

LIVE_UNIVERSE_CACHE_TTL_SECONDS = 24 * 60 * 60
FINALIZED_UNIVERSE_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60


def universe_cache_ttl_seconds(
    settings: Settings,
    *,
    data_state: MarketDataState,
    now: datetime | None = None,
) -> int:
    if data_state == MarketDataState.FINALIZED:
        return FINALIZED_UNIVERSE_CACHE_TTL_SECONDS
    return LIVE_UNIVERSE_CACHE_TTL_SECONDS


class UniverseCacheUnavailableError(RuntimeError):
    """Raised when scored universe is not cached and no stale fallback exists."""


@dataclass(frozen=True, slots=True)
class CanonicalUniverseSnapshot:
    generation: PublishedMarketGeneration
    payload: ScoredUniverseCacheRead

    @property
    def rows(self) -> list[ScoredUniverseRow]:
        return self.payload.rows

    def row_for_symbol(self, symbol: str) -> ScoredUniverseRow | None:
        normalized = symbol.upper()
        return next((row for row in self.rows if row.stock.symbol.upper() == normalized), None)


class MarketUniverseService:
    def __init__(
        self,
        market_repository: MarketDataRepository,
        stocks_repository: StocksRepository,
        redis: OptionalRedisClient,
        settings: Settings,
        decision_snapshot_repository: DecisionSnapshotRepository | None = None,
    ) -> None:
        self.market_repository = market_repository
        self.stocks_repository = stocks_repository
        self.redis = redis
        self.settings = settings
        self.decision_snapshot_repository = decision_snapshot_repository
        self._last_compute_ms: float | None = None

    @property
    def last_compute_ms(self) -> float | None:
        return self._last_compute_ms

    async def _cache_get(self, cache_key: str) -> dict | None:
        return await self.redis.get_json(cache_key)

    async def _cache_set(self, cache_key: str, payload: dict, *, ttl_seconds: int | None = None) -> None:
        ttl_seconds = ttl_seconds or current_cache_ttl_seconds(self.settings)
        await self.redis.set_json(cache_key, payload, ttl_seconds=ttl_seconds)

    async def _cache_ttl_seconds(self, cache_key: str) -> int | None:
        ttl_reader = getattr(self.redis, "get_ttl_seconds", None)
        if ttl_reader is None:
            return None
        return await ttl_reader(cache_key)

    async def _log_cache_rejection(
        self,
        *,
        exchange: ExchangeCode,
        cache_key: str,
        payload: ScoredUniverseCacheRead | None,
        expected_session_date: date | None,
        expected_source_last_synced_at: datetime | None,
        expected_market_sync_id: str | None,
        expected_data_state: MarketDataState,
    ) -> None:
        logger.info(
            "universe_cache_rejected exchange=%s key=%s ttl_seconds=%s "
            "cached_session=%s expected_session=%s cached_state=%s expected_state=%s "
            "cached_sync_id=%s expected_sync_id=%s "
            "cached_source_last_synced_at=%s expected_source_last_synced_at=%s",
            exchange.value,
            cache_key,
            await self._cache_ttl_seconds(cache_key),
            payload.decision_session_date if payload is not None else None,
            expected_session_date,
            payload.data_state if payload is not None else None,
            expected_data_state,
            payload.market_sync_id if payload is not None else None,
            expected_market_sync_id,
            payload.source_last_synced_at if payload is not None else None,
            expected_source_last_synced_at,
        )

    async def get_canonical_universe(
        self,
        *,
        exchange: ExchangeCode,
        generation: PublishedMarketGeneration | None = None,
    ) -> CanonicalUniverseSnapshot:
        context = generation or await self.resolve_generation_context(exchange=exchange)
        if context is None:
            raise UniverseCacheUnavailableError(
                f"No published market generation is available for {exchange.value}"
            )

        if self.redis.is_available:
            cache_key = universe_cache_key("scored", exchange, context.sync_id)
            cached = await self._cache_get(cache_key)
            cached_payload = self._parse_cache_payload(cached) if cached is not None else None
            if cached_payload is not None and self._cache_matches_identity(
                cached_payload,
                context.trade_date,
                context.source_last_synced_at,
                context.sync_id,
            ):
                return CanonicalUniverseSnapshot(generation=context, payload=cached_payload)
            await self._log_cache_rejection(
                exchange=exchange,
                cache_key=cache_key,
                payload=cached_payload,
                expected_session_date=context.trade_date,
                expected_source_last_synced_at=context.source_last_synced_at,
                expected_market_sync_id=context.sync_id,
                expected_data_state=context.data_state,
            )

            from app.jobs.market_cache_spawn import spawn_rebuild_universe_read_cache

            spawn_rebuild_universe_read_cache(exchange, settings=self.settings)

        raise UniverseCacheUnavailableError(
            f"Canonical universe for {exchange.value} generation {context.sync_id} "
            "is updating"
        )

    async def get_scored_universe(self, *, exchange: ExchangeCode) -> list[ScoredUniverseRow]:
        return (await self.get_canonical_universe(exchange=exchange)).rows

    async def has_cached_generation(
        self,
        *,
        exchange: ExchangeCode,
        generation: PublishedMarketGeneration,
    ) -> bool:
        if not self.redis.is_available:
            return False
        cached = await self._cache_get(
            universe_cache_key("scored", exchange, generation.sync_id)
        )
        payload = self._parse_cache_payload(cached) if cached is not None else None
        return payload is not None and self._cache_matches_identity(
            payload,
            generation.trade_date,
            generation.source_last_synced_at,
            generation.sync_id,
        )

    @staticmethod
    def _parse_cache_payload(payload: dict) -> ScoredUniverseCacheRead | None:
        try:
            return ScoredUniverseCacheRead.model_validate(payload)
        except ValueError:
            return None

    @staticmethod
    def _cache_matches_identity(
        payload: ScoredUniverseCacheRead,
        session_trade_date: date | None,
        source_last_synced_at: datetime | None,
        market_sync_id: str | None,
    ) -> bool:
        structural_match = (
            session_trade_date is not None
            and bool(payload.rows)
            and payload.session_trade_date == session_trade_date
            and payload.decision_session_date == session_trade_date
            and payload.strategy_version == TRADING_STRATEGY_VERSION
            and payload.threshold_version == TRADING_THRESHOLD_VERSION
            and payload.input_schema_version == TRADING_INPUT_SCHEMA_VERSION
            and payload.decision_taxonomy_version == DECISION_TAXONOMY_VERSION
            and payload.scanner_version == SCANNER_CONDITION_VERSION
            and payload.market_sync_id == market_sync_id
            and all(
            row.eligibility is not None
            and row.eligibility.exchange_session_date == session_trade_date
            and row.decision is not None
            and row.decision.canonical is not None
            and row.decision.canonical.strategy_version == TRADING_STRATEGY_VERSION
            and row.decision.canonical.threshold_version == TRADING_THRESHOLD_VERSION
            and row.decision.canonical.decision_taxonomy_version
            == DECISION_TAXONOMY_VERSION
            and row.scanner is not None
            and row.scanner.version == SCANNER_CONDITION_VERSION
            for row in payload.rows
            )
        )
        report = monitor_universe_payload(
            payload,
            expected_session_date=session_trade_date,
            expected_source_last_synced_at=source_last_synced_at,
        )
        if report.issues:
            log_monitoring_report(report, exchange="cache-read")
        return structural_match and not report.has_errors

    async def resolve_generation_context(
        self,
        *,
        exchange: ExchangeCode,
    ) -> PublishedMarketGeneration | None:
        """Choose live data only during the active/post-close publication window."""

        latest_finalized = await self.market_repository.get_latest_finalized_session_date(
            exchange=exchange
        )
        live_date, live_synced_at = await self.market_repository.get_market_price_freshness(
            exchange=exchange
        )
        now = datetime.now(ZoneInfo("Asia/Dhaka"))
        status = resolve_market_status(now, self.settings)
        published = await resolve_published_market_generation(
            self.market_repository,
            exchange=exchange,
            market_status=status,
            today=now.date(),
            now=now,
            stale_after_seconds=self.settings.market_sync_interval_seconds * 2,
        )
        if published is not None:
            return published

        # Preserve the durable-finalized fallback for rolling deployments and
        # repository doubles that predate market_data_generations.
        if latest_finalized is not None:
            final_synced_at = (
                await self.market_repository.get_decision_session_freshness(exchange=exchange)
            )[1]
            if final_synced_at is None:
                return None
            return PublishedMarketGeneration(
                trade_date=latest_finalized,
                source_last_synced_at=final_synced_at,
                sync_id=f"legacy-{exchange.value}-{latest_finalized.isoformat()}",
                data_state=MarketDataState.FINALIZED,
                published_at=final_synced_at,
            )
        if live_date is None or live_synced_at is None:
            return None
        return PublishedMarketGeneration(
            trade_date=live_date,
            source_last_synced_at=live_synced_at,
            sync_id=f"legacy-{exchange.value}-{live_date.isoformat()}",
            data_state=MarketDataState.STALE,
            published_at=live_synced_at,
        )

    async def _resolve_market_context(
        self,
        *,
        exchange: ExchangeCode,
    ) -> tuple[date | None, datetime | None, str | None, MarketDataState]:
        """Compatibility tuple for callers/tests; new code passes the immutable context."""

        context = await self.resolve_generation_context(exchange=exchange)
        if context is None:
            return None, None, None, MarketDataState.STALE
        return (
            context.trade_date,
            context.source_last_synced_at,
            context.sync_id,
            context.data_state,
        )

    async def is_generation_current(
        self,
        generation: PublishedMarketGeneration,
        *,
        exchange: ExchangeCode,
    ) -> bool:
        current = await self.resolve_generation_context(exchange=exchange)
        return current is not None and current.sync_id == generation.sync_id

    async def persist_finalized_decisions(self, rows: list[ScoredUniverseRow]) -> int:
        """Persist audit snapshots from the already-calculated canonical rows."""

        if self.decision_snapshot_repository is None:
            return 0
        return await self.decision_snapshot_repository.persist_missing(rows)

    async def recompute_scored_universe(
        self,
        exchange: ExchangeCode,
        *,
        generation: PublishedMarketGeneration | None = None,
        decision_session_date: date | None = None,
    ) -> list[ScoredUniverseRow]:
        perf = PerfReport("universe.rebuild")
        context = generation or await self.resolve_generation_context(exchange=exchange)
        active_session_date = context.trade_date if context is not None else None
        data_state = context.data_state if context is not None else MarketDataState.STALE
        if decision_session_date is None:
            decision_session_date = active_session_date
        elif context is not None and decision_session_date != context.trade_date:
            logger.warning(
                "Skipping universe rebuild for %s session %s: generation %s is session %s",
                exchange.value,
                decision_session_date,
                context.sync_id,
                context.trade_date,
            )
            return []
        if decision_session_date is None:
            logger.info(
                "Skipping canonical universe rebuild for %s: no finalized session",
                exchange.value,
            )
            return []
        async with async_perf_stage(perf, "db.price_windows"):
            window_rows = await self.market_repository.list_market_price_windows(
                exchange=exchange,
                limit=PULSE_UNIVERSE_LIMIT,
                offset=0,
                price_window_limit=PULSE_PRICE_WINDOW_LIMIT,
                end_date=decision_session_date,
            )
        async with async_perf_stage(perf, "db.market_regime"):
            summaries = await self.market_repository.list_daily_market_summaries(
                exchange=exchange,
                limit=REGIME_SUMMARY_FETCH_LIMIT,
                offset=0,
                end_date=decision_session_date,
            )
            market_regime = resolve_regime_result_from_summaries(
                summaries,
                decision_session_date=decision_session_date,
            )
        grouped = group_price_window_rows(window_rows)
        stock_ids = {
            entry["stock"].id
            for entry in grouped.values()
            if hasattr(entry.get("stock"), "id")
        }
        async with async_perf_stage(perf, "db.eligibility_context"):
            exchange_session_dates = (
                await self.market_repository.list_recent_exchange_session_dates(
                    exchange=exchange,
                    limit=ELIGIBILITY_SESSION_LOOKBACK,
                    end_date=decision_session_date,
                )
            )
            corporate_action_dates = (
                await self.market_repository.list_corporate_action_dates_by_stock(
                    stock_ids=stock_ids,
                )
            )
        async with async_perf_stage(perf, "compute.scored_rows"):
            rows = build_scored_universe_rows(
                grouped,
                market_regime=market_regime,
                exchange_session_dates=exchange_session_dates,
                corporate_action_dates_by_stock=corporate_action_dates,
                decision_session_date=decision_session_date,
            )
        if data_state == MarketDataState.FINALIZED and self.decision_snapshot_repository is not None:
            try:
                async with async_perf_stage(perf, "db.decision_snapshots"):
                    await self.decision_snapshot_repository.persist_missing(rows)
            except Exception:
                logger.exception(
                    "Failed to persist immutable decision snapshots for %s",
                    exchange.value,
                )
                await self.decision_snapshot_repository.session.rollback()
        perf.log_summary()
        self._last_compute_ms = perf.total_ms
        return rows

    async def cache_scored_universe(
        self,
        exchange: ExchangeCode,
        rows: list[ScoredUniverseRow],
        *,
        generation: PublishedMarketGeneration | None = None,
    ) -> bool:
        context = generation or await self.resolve_generation_context(exchange=exchange)
        if context is None or not rows:
            return False
        if not await self.is_generation_current(context, exchange=exchange):
            logger.info(
                "Discarding obsolete universe before cache publication: exchange=%s generation=%s",
                exchange.value,
                context.sync_id,
            )
            return False

        cache_key = universe_cache_key("scored", exchange, context.sync_id)
        freshness_date = context.trade_date
        source_last_synced_at = context.source_last_synced_at
        market_sync_id = context.sync_id
        data_state = context.data_state
        is_live_session = data_state in {
            MarketDataState.LIVE,
            MarketDataState.FINALIZATION_PENDING,
            MarketDataState.STALE,
        }
        session_dates = [
            row.eligibility.exchange_session_date
            for row in rows
            if row.eligibility is not None and row.eligibility.exchange_session_date is not None
        ]
        payload = ScoredUniverseCacheRead(
            strategy_version=TRADING_STRATEGY_VERSION,
            threshold_version=TRADING_THRESHOLD_VERSION,
            input_schema_version=TRADING_INPUT_SCHEMA_VERSION,
            decision_taxonomy_version=DECISION_TAXONOMY_VERSION,
            scanner_version=SCANNER_CONDITION_VERSION,
            session_trade_date=freshness_date or (max(session_dates) if session_dates else None),
            decision_session_date=freshness_date,
            live_data_as_of=source_last_synced_at if is_live_session else None,
            is_live_session=is_live_session,
            source_last_synced_at=source_last_synced_at,
            market_sync_id=market_sync_id,
            data_state=data_state,
            payload_revision=compute_universe_payload_revision(rows),
            rows=rows,
        )

        monitoring_report = monitor_universe_payload(
            payload,
            expected_session_date=payload.session_trade_date,
            expected_source_last_synced_at=source_last_synced_at,
        )
        if monitoring_report.issues:
            log_monitoring_report(monitoring_report, exchange=exchange.value)
        funnel = build_decision_funnel(rows)
        logger.info(
            "decision_funnel exchange=%s session=%s total=%s eligible=%s bullish=%s "
            "potential_buy=%s hold=%s wait=%s sell=%s unavailable=%s data=%s liquidity=%s "
            "extension=%s entry_plan=%s risk=%s other=%s reconciles=%s",
            exchange.value,
            payload.decision_session_date,
            funnel.total_universe,
            funnel.eligible,
            funnel.bullish_opportunity,
            funnel.potential_buy,
            funnel.hold,
            funnel.wait,
            funnel.sell,
            funnel.unavailable,
            funnel.blocked_by_data,
            funnel.blocked_by_liquidity,
            funnel.blocked_by_extension,
            funnel.blocked_by_entry_plan,
            funnel.blocked_by_risk,
            funnel.other_or_unblocked,
            funnel.reconciles,
        )
        serialized_payload = payload.model_dump(mode="json")
        primary_ttl_seconds = universe_cache_ttl_seconds(
            self.settings,
            data_state=data_state,
        )
        await self._cache_set(
            cache_key,
            serialized_payload,
            ttl_seconds=primary_ttl_seconds,
        )
        if not await self.is_generation_current(context, exchange=exchange):
            await self.redis.delete(cache_key)
            logger.info(
                "Discarded universe cached during a generation change: exchange=%s generation=%s",
                exchange.value,
                context.sync_id,
            )
            return False
        return True

    async def get_universe_rows(self, *, exchange: ExchangeCode) -> UniverseRowsRead:
        snapshot = await self.get_canonical_universe(exchange=exchange)
        context = snapshot.generation
        session_trade_date = context.trade_date
        source_last_synced_at = context.source_last_synced_at
        market_sync_id = context.sync_id
        data_state = context.data_state
        is_live_session = data_state in {
            MarketDataState.LIVE,
            MarketDataState.FINALIZATION_PENDING,
            MarketDataState.STALE,
        }
        rows = snapshot.rows
        listed_stock_count = await self.stocks_repository.count_stocks(
            exchange=exchange,
            is_active=True,
        )
        return UniverseRowsRead(
            meta=UniverseRowsMetaRead(
                exchange=exchange,
                listed_stock_count=listed_stock_count,
                session_trade_date=session_trade_date,
                decision_session_date=session_trade_date,
                live_data_as_of=source_last_synced_at if is_live_session else None,
                is_live_session=is_live_session,
                source_last_synced_at=source_last_synced_at,
                market_sync_id=market_sync_id,
                data_state=data_state,
                payload_revision=compute_universe_payload_revision(rows),
            ),
            rows=rows,
        )


def get_market_universe_service(
    market_repository: Annotated[MarketDataRepository, Depends(get_market_data_repository)],
    stocks_repository: Annotated[StocksRepository, Depends(get_stocks_repository)],
    redis: Annotated[OptionalRedisClient, Depends(get_redis_client)],
    settings: Annotated[Settings, Depends(get_settings)],
    decision_snapshot_repository: Annotated[
        DecisionSnapshotRepository,
        Depends(get_decision_snapshot_repository),
    ],
) -> MarketUniverseService:
    return MarketUniverseService(
        market_repository,
        stocks_repository,
        redis,
        settings,
        decision_snapshot_repository,
    )
