from __future__ import annotations

import logging
from copy import deepcopy
from dataclasses import dataclass, replace
from datetime import UTC, date, datetime
from typing import Annotated
from uuid import UUID
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
    DisplayQuoteRead,
    ScoredUniverseCacheRead,
    ScoredUniverseRow,
    UniverseRowsMetaRead,
    UniverseRowsRead,
)
from app.modules.stock_details.decision.display_metrics import build_quote_projection
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


class UniverseCachePublicationError(RuntimeError):
    """Raised when a canonical universe result cannot be published to Redis."""


@dataclass(frozen=True, slots=True)
class CanonicalUniverseSnapshot:
    generation: PublishedMarketGeneration
    payload: ScoredUniverseCacheRead
    updating: bool = False
    withdrawn: bool = False
    entries_projected: bool = False
    quote_generation: PublishedMarketGeneration | None = None

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
        self._input_captures: dict = {}
        self._membership_capture: dict | None = None

    @property
    def last_compute_ms(self) -> float | None:
        return self._last_compute_ms

    async def _cache_get(self, cache_key: str) -> dict | None:
        return await self.redis.get_json(cache_key)

    async def _cache_set(self, cache_key: str, payload: dict, *, ttl_seconds: int | None = None) -> bool:
        ttl_seconds = ttl_seconds or current_cache_ttl_seconds(self.settings)
        result = await self.redis.set_json(cache_key, payload, ttl_seconds=ttl_seconds)
        # Existing lightweight test doubles predate the Redis success return.
        return result is not False

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
        allow_rebuild: bool = True,
    ) -> CanonicalUniverseSnapshot:
        context = generation or await self.resolve_generation_context(exchange=exchange)
        if context is None or context.data_state != MarketDataState.FINALIZED:
            raise UniverseCacheUnavailableError(
                f"No published market generation is available for {exchange.value}"
            )

        publication = None
        if self.decision_snapshot_repository is not None:
            publication = await self.decision_snapshot_repository.latest_publication(
                exchange=exchange, generation_id=context.sync_id, metadata_only=True
            )

        if self.redis.is_available and not (publication and publication.invalidated_at):
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

            if allow_rebuild:
                spawn_rebuild_universe_read_cache(exchange, settings=self.settings)

        if publication is not None:
            # Load the selected exact durable row, including a withdrawn head.
            # Never substitute a previous generation for a missing winner.
            publication = await self.decision_snapshot_repository.get_publication(
                exchange=exchange, generation_id=publication.generation_id,
            )
            payload = self._parse_cache_payload(publication.result_payload) if publication else None
            if payload is not None and self._cache_matches_identity(
                payload,
                publication.session_date,
                payload.source_last_synced_at,
                publication.generation_id,
            ):
                prior = PublishedMarketGeneration(
                    trade_date=publication.session_date, sync_id=publication.generation_id,
                    source_last_synced_at=payload.source_last_synced_at,
                    published_at=publication.observed_at, data_state=MarketDataState.FINALIZED,
                )
                return CanonicalUniverseSnapshot(
                    generation=prior, payload=payload, updating=prior.sync_id != context.sync_id,
                    withdrawn=publication.invalidated_at is not None,
                )

        raise UniverseCacheUnavailableError(
            f"Canonical universe for {exchange.value} generation {context.sync_id} "
            "is updating"
        )

    async def get_scored_universe(self, *, exchange: ExchangeCode) -> list[ScoredUniverseRow]:
        snapshot = await self.get_canonical_universe(exchange=exchange)
        return (await self.project_current_entries(snapshot, exchange=exchange)).rows

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

    async def promote_cached_generation(
        self,
        *,
        exchange: ExchangeCode,
        generation: PublishedMarketGeneration,
    ) -> bool:
        """Extend a finalized generation's existing canonical cache without recomputing it."""

        if generation.data_state != MarketDataState.FINALIZED or not self.redis.is_available:
            return True
        cache_key = universe_cache_key("scored", exchange, generation.sync_id)
        cached = await self._cache_get(cache_key)
        payload = self._parse_cache_payload(cached) if cached is not None else None
        if payload is None or not self._cache_matches_identity(
            payload,
            generation.trade_date,
            generation.source_last_synced_at,
            generation.sync_id,
        ):
            return False
        if not await self.is_generation_current(generation, exchange=exchange):
            return False

        promoted = payload.model_copy(
            update={
                "data_state": MarketDataState.FINALIZED,
                "is_live_session": False,
                "live_data_as_of": None,
            }
        )
        if not await self._cache_set(
            cache_key,
            promoted.model_dump(mode="json"),
            ttl_seconds=FINALIZED_UNIVERSE_CACHE_TTL_SECONDS,
        ):
            raise UniverseCachePublicationError(
                f"Failed to promote canonical universe cache for {exchange.value} "
                f"generation {generation.sync_id}"
            )
        return await self.is_generation_current(generation, exchange=exchange)

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
            payload.data_state == MarketDataState.FINALIZED
            and not payload.is_live_session
            and session_trade_date is not None
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

    async def resolve_quote_context(
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

    async def resolve_generation_context(
        self, *, exchange: ExchangeCode
    ) -> PublishedMarketGeneration | None:
        """Decisions exclusively consume a finalized exchange session, never quote state."""
        from app.modules.market_data.published_generation import (
            resolve_finalized_decision_generation,
        )

        return await resolve_finalized_decision_generation(
            self.market_repository, exchange=exchange
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

    async def is_input_generation_current(
        self,
        generation: PublishedMarketGeneration,
        *,
        exchange: ExchangeCode,
    ) -> bool:
        current = await self.resolve_generation_context(exchange=exchange)
        return current is not None and current.sync_id == generation.sync_id

    async def is_generation_current(self, generation, *, exchange: ExchangeCode) -> bool:
        try:
            selected = await self.get_canonical_universe(exchange=exchange, allow_rebuild=False)
        except UniverseCacheUnavailableError:
            return False
        return selected.generation.sync_id == generation.sync_id

    async def previous_finalized_publication(self, *, exchange: ExchangeCode, before_date: date):
        if self.decision_snapshot_repository is None:
            return None
        publication = await self.decision_snapshot_repository.latest_publication(
            exchange=exchange, before_date=before_date
        )
        if publication is None or publication.invalidated_at is not None:
            return None
        return self._parse_cache_payload(publication.result_payload)

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
        if context is None or context.data_state != MarketDataState.FINALIZED:
            return []
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
        self._membership_capture = None
        membership_reader = getattr(self.market_repository, "list_decision_universe_membership", None)
        if membership_reader is not None:
            listed_ids = await membership_reader(exchange=exchange)
            active, accepted, _ = await self.market_repository.session_symbol_coverage(exchange=exchange, trade_date=decision_session_date)
            self._membership_capture = {
                "universe_membership": [str(value) for value in listed_ids],
                "membership_provenance": {
                    "status": "OBSERVED_INDEPENDENT_LISTED_SET", "observed_at": datetime.now(UTC).isoformat(),
                    "decision_session_date": decision_session_date.isoformat(), "listed_count": len(listed_ids),
                    "accepted_count": accepted,
                    "market_coverage_verified": bool(active == len(listed_ids) and active and accepted >= self.settings.market_snapshot_min_source_symbols
                        and accepted / active * 100 >= self.settings.market_snapshot_min_active_coverage_percent),
                },
            }
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
        event_reader = getattr(self.market_repository, "list_decision_event_observations", None)
        event_observations = await event_reader(stock_ids=stock_ids) if event_reader else {}
        self._input_captures = {}
        async with async_perf_stage(perf, "compute.scored_rows"):
            rows = build_scored_universe_rows(
                grouped,
                market_regime=market_regime,
                exchange_session_dates=exchange_session_dates,
                corporate_action_dates_by_stock=corporate_action_dates,
                input_captures=self._input_captures,
                event_observations_by_stock=event_observations,
                decision_session_date=decision_session_date,
            )
        if self.decision_snapshot_repository is not None and hasattr(
            self.decision_snapshot_repository, "latest_publication"
        ):
            prior = await self.previous_finalized_publication(
                exchange=exchange, before_date=decision_session_date
            )
            prior_rows = {str(row.stock.id): row for row in prior.rows} if prior else {}
            rows = [
                row.model_copy(
                    update={
                        "previous_finalized_decision": (
                            prior_rows[str(row.stock.id)].decision.canonical
                            if str(row.stock.id) in prior_rows
                            and prior_rows[str(row.stock.id)].decision
                            else None
                        ),
                        "previous_publication_generation_id": prior.market_sync_id if prior else None
                    }
                )
                for row in rows
            ]
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
        if context is None or context.data_state != MarketDataState.FINALIZED or not rows:
            return False
        if not await self.is_input_generation_current(context, exchange=exchange):
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
        if monitoring_report.has_errors:
            raise UniverseCachePublicationError("Canonical generation failed validation")
        serialized_payload = payload.model_dump(mode="json")
        if self.decision_snapshot_repository is not None:
            if not self._input_captures or len(self._input_captures) != len(rows):
                raise UniverseCachePublicationError("Complete immutable input capture is required")
            winner = await self.decision_snapshot_repository.publish_generation(
                exchange=exchange,
                generation_id=context.sync_id,
                session_date=context.trade_date,
                inputs={
                    **(self._membership_capture or {
                        "universe_membership": [str(row.stock.id) for row in rows],
                        "membership_provenance": {"status": "UNKNOWN"},
                    }),
                    "excluded_members": [
                        {"stock_id": stock_id, "reason_code": "NO_CAPTURED_INPUT" if stock_id not in self._input_captures else "NO_PUBLISHED_RESULT"}
                        for stock_id in (self._membership_capture or {}).get("universe_membership", [])
                        if stock_id not in {str(row.stock.id) for row in rows}
                    ],
                    "stocks": {
                        str(row.stock.id): row.stock.model_dump(mode="json") for row in rows
                    },
                    "inputs": self._input_captures,
                    "quote_generation": (
                        await self.resolve_quote_context(exchange=exchange)
                    ).sync_id,
                    "capture_started_at": datetime.now(UTC).isoformat(),
                },
                payload=serialized_payload,
            )
            # Rollback of optional work expires ORM attributes even after the
            # winner's commit. Retain the exact durable bytes before that work.
            serialized_payload = deepcopy(winner.result_payload)
            from app.modules.backtesting.backtesting_shadow import publish_shadow_receipts
            try:
                if hasattr(winner, "input_payload"):
                    await publish_shadow_receipts(self.decision_snapshot_repository.session, winner, self.settings)
            except Exception:
                logger.exception("Shadow selection receipt failed; durable canonical publication remains available")
                await self.decision_snapshot_repository.session.rollback()
            durable_payload = self._parse_cache_payload(serialized_payload)
            if durable_payload is None or not self._cache_matches_identity(
                durable_payload, context.trade_date, context.source_last_synced_at, context.sync_id,
            ):
                raise UniverseCachePublicationError("Durable publication winner has invalid identity")
        primary_ttl_seconds = universe_cache_ttl_seconds(
            self.settings,
            data_state=data_state,
        )
        if not await self._cache_set(
            cache_key,
            serialized_payload,
            ttl_seconds=primary_ttl_seconds,
        ):
            if self.decision_snapshot_repository is not None:
                logger.warning(
                    "Redis unavailable; serving the atomically published durable generation"
                )
                return await self.is_input_generation_current(context, exchange=exchange)
            raise UniverseCachePublicationError(
                f"Failed to publish canonical universe cache for {exchange.value} "
                f"generation {context.sync_id}"
            )
        if not await self.is_input_generation_current(context, exchange=exchange):
            await self.redis.delete(cache_key)
            logger.info(
                "Discarded universe cached during a generation change: exchange=%s generation=%s",
                exchange.value,
                context.sync_id,
            )
            return False
        return True

    async def ensure_cached_shadow_receipt(self, *, exchange, generation):
        """Background retry only: repair a missing receipt from the exact durable winner."""
        if self.decision_snapshot_repository is None or not await self.is_input_generation_current(generation, exchange=exchange):
            return
        from app.modules.backtesting.backtesting_shadow_repository import TradingShadowRepository
        from app.modules.backtesting.backtesting_shadow import publish_shadow_receipts
        from app.modules.backtesting.backtesting_challengers import EXPERIMENT_ID
        session = self.decision_snapshot_repository.session
        try:
            repository = TradingShadowRepository(session)
            if not await repository.available() or await repository.selection_for_session(
                exchange=exchange, session_date=generation.trade_date, experiment_id=EXPERIMENT_ID):
                return
            winner = await self.decision_snapshot_repository.get_replay_publication(exchange=exchange, generation_id=generation.sync_id)
            if winner is not None and winner.invalidated_at is None:
                await publish_shadow_receipts(session, winner, self.settings)
        except Exception:
            logger.exception("Missing shadow receipt retry failed; canonical cache remains available")
            await session.rollback()

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
        snapshot = await self.project_current_entries(snapshot, exchange=exchange)
        rows = snapshot.rows
        quote_context = snapshot.quote_generation
        listed_stock_count = await self.stocks_repository.count_stocks(
            exchange=exchange,
            is_active=True,
        )
        if not await self.is_generation_current(context, exchange=exchange):
            raise UniverseCacheUnavailableError(
                "Decision generation changed while universe rows were loading"
            )
        current_quote = await self.resolve_quote_context(exchange=exchange)
        if (quote_context.sync_id if quote_context else None) != (current_quote.sync_id if current_quote else None):
            raise UniverseCacheUnavailableError(
                "Quote generation changed while universe rows were loading"
            )
        return UniverseRowsRead(
            meta=UniverseRowsMetaRead(
                exchange=exchange,
                quote_session_date=quote_context.trade_date if quote_context else None,
                quote_data_state=quote_context.data_state if quote_context else None,
                quote_is_live_session=bool(quote_context and quote_context.data_state in {MarketDataState.LIVE, MarketDataState.FINALIZATION_PENDING, MarketDataState.STALE}),
                listed_stock_count=listed_stock_count,
                session_trade_date=session_trade_date,
                decision_session_date=session_trade_date,
                live_data_as_of=source_last_synced_at if is_live_session else None,
                is_live_session=is_live_session,
                source_last_synced_at=source_last_synced_at,
                market_sync_id=market_sync_id,
                data_state=data_state,
                decision_status="UPDATING" if snapshot.updating else "CURRENT",
                decision_generation_id=market_sync_id,
                quote_generation_id=quote_context.sync_id if quote_context else None,
                payload_revision=compute_universe_payload_revision(rows),
            ),
            rows=rows,
        )

    async def project_current_entries(self, snapshot, *, exchange, stock_ids=None):
        """Lightweight current overlay; never cached with the immutable generation."""
        from app.modules.stock_details.decision.entry_applicability import (
            build_entry_path_facts, evaluate_entry_applicability,
        )
        from app.core.enums import MarketSessionStatus
        now = datetime.now(ZoneInfo("Asia/Dhaka"))
        status = resolve_market_status(now, self.settings)
        context = await self.resolve_quote_context(exchange=exchange)
        selected = [row for row in snapshot.rows if stock_ids is None or row.stock.id in stock_ids]
        ids = {row.stock.id for row in selected}
        quotes = await self.get_display_quotes(ids, context=context) if context else {}
        publication = None
        coverage = False
        required = await self.resolve_generation_context(exchange=exchange)
        selected_is_required = (
            not snapshot.updating and required is not None
            and required.sync_id == snapshot.generation.sync_id
        )
        repository = self.decision_snapshot_repository
        if repository is not None:
            publication = await repository.latest_publication(exchange=exchange, generation_id=snapshot.generation.sync_id, metadata_only=True)
            if selected_is_required and publication is not None and publication.generation_id == snapshot.generation.sync_id:
                from app.modules.trading_intelligence.capture_inventory import verify_capture_coverage
                facts = await repository.publication_coverage(exchange=exchange, generation_id=publication.generation_id)
                coverage = verify_capture_coverage(facts, [str(row.stock.id) for row in snapshot.rows])["verified"]
        candidates = {row.stock.id for row in selected if row.decision and row.decision.display_action == "POTENTIAL_BUY"}
        reference = snapshot.generation.trade_date
        sessions = await self.market_repository.list_recent_exchange_session_dates(exchange=exchange, limit=5000, end_date=now.date()) if selected else []
        previous_session = max((day for day in sessions if day < reference), default=None)
        prior = await repository.latest_publication(exchange=exchange, before_date=reference, metadata_only=True) if repository and hasattr(repository, "latest_publication") else None
        previous_valid = bool(prior and publication and not prior.invalidated_at and prior.session_date == previous_session
            and prior.observed_at <= publication.observed_at)
        from app.modules.stock_details.decision.comparison import compare_holder_decisions, compare_public_decisions
        observed_reader = getattr(self.market_repository, "list_observed_exchange_session_dates", None)
        observed = await observed_reader(exchange=exchange, start_date=reference, end_date=now.date()) if candidates and observed_reader else []
        finalized = frozenset(sessions)
        sessions = sorted(set(sessions) | set(observed) | ({context.trade_date} if context else set()))
        from datetime import time
        close = time.fromisoformat(self.settings.market_close_time)
        ended = frozenset(day for day in sessions if day < now.date() or (
            day == now.date() and now.time().replace(tzinfo=None) > close
        ))
        completed = ended & finalized
        prices, revisions, journal_start = await self.market_repository.list_entry_path_observations(
            stock_ids=candidates, start_date=reference, end_date=now.date(),
        ) if candidates else ([], [], None)
        actions = await self.market_repository.list_entry_basis_events(stock_ids=candidates, end_date=now.date()) if candidates else {}
        prices_by_stock = {}
        revisions_by_stock = {}
        for price in prices:
            prices_by_stock.setdefault(price.stock_id, []).append(price)
        for revision in revisions:
            revisions_by_stock.setdefault(revision.payload.get("stock_id"), []).append(revision)
        projected = {}
        for row in selected:
            plan = row.analysis.trade_plan if row.analysis else None
            path = build_entry_path_facts(
                prices=prices_by_stock.get(row.stock.id, []),
                revisions=revisions_by_stock.get(str(row.stock.id), []),
                sessions=sessions, completed_sessions=completed, ended_sessions=ended, reference_date=reference,
                published_at=publication.observed_at if publication else None, journal_started_at=journal_start,
                basis_events=actions.get(row.stock.id, ()), plan=plan, average_volume=row.technical_snapshot.average_volume,
            )
            applicability = evaluate_entry_applicability(
                decision=row.decision, plan=plan, eligibility=row.eligibility, quote=quotes.get(row.stock.id),
                reference_date=reference, now=now, market_open=status == MarketSessionStatus.OPEN,
                coverage_verified=coverage, path=path,
                withdrawn=bool(publication and publication.invalidated_at),
                publication_observed_at=publication.observed_at if publication else None,
            )
            decision = row.decision.model_copy(update={"entry_applicability": applicability}) if row.decision else None
            if decision and row.analysis and decision.measured_support_component is None:
                from app.modules.stock_details.decision.summary import selected_explanation_fields
                decision = decision.model_copy(update=selected_explanation_fields(decision, row.analysis.opportunity))
            projected[row.stock.id] = row.model_copy(update={
                "display_quote": quotes.get(row.stock.id), "entry_applicability": applicability, "decision": decision,
                "holder_comparison": compare_holder_decisions(
                    row.decision.canonical if row.decision else None,
                    row.previous_finalized_decision,
                    previous_session=previous_session,
                    current_valid=bool(publication and publication.generation_id == snapshot.generation.sync_id and not publication.invalidated_at),
                    previous_valid=previous_valid and row.previous_publication_generation_id == prior.generation_id,
                ),
                "public_comparison": compare_public_decisions(
                    row.decision.canonical if row.decision else None,
                    row.previous_finalized_decision,
                    previous_session=previous_session,
                    current_valid=bool(publication and publication.generation_id == snapshot.generation.sync_id and not publication.invalidated_at),
                    previous_valid=previous_valid and row.previous_publication_generation_id == prior.generation_id,
                ),
            })
        after = await self.resolve_quote_context(exchange=exchange)
        if (context.sync_id if context else None) != (after.sync_id if after else None):
            raise UniverseCacheUnavailableError("Quote generation changed while entry applicability was assessed")
        required_after = await self.resolve_generation_context(exchange=exchange)
        if (required.sync_id if required else None) != (required_after.sync_id if required_after else None):
            raise UniverseCacheUnavailableError("Required decision generation changed while entry applicability was assessed")
        return replace(snapshot, entries_projected=True, quote_generation=context,
            updating=snapshot.updating or bool(required and required.sync_id != snapshot.generation.sync_id),
            payload=snapshot.payload.model_copy(update={
                "rows": [projected.get(row.stock.id, row) for row in snapshot.rows],
            }))

    async def get_display_quotes(
        self, stock_ids: set[UUID], *, context: PublishedMarketGeneration,
    ) -> dict[UUID, DisplayQuoteRead]:
        prices = await self.market_repository.list_quote_price_observations(
            stock_ids=stock_ids, end_date=context.trade_date,
        )
        by_stock: dict[UUID, list] = {}
        for price in prices:
            by_stock.setdefault(price.stock_id, []).append(price)
        return {
            stock_id: DisplayQuoteRead(**build_quote_projection(
                by_stock.get(stock_id, []),
                finality=context.data_state.value,
                session_date=context.trade_date,
            ))
            for stock_id in stock_ids
        }

    async def get_decision_event_observations(self, stock_id: UUID) -> tuple[dict, ...]:
        events = await self.market_repository.list_decision_event_observations(stock_ids={stock_id})
        return tuple(events.get(stock_id, ()))


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
