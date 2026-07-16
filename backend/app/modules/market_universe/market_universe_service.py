from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Annotated

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
from app.core.enums import ExchangeCode
from app.core.perf_timing import PerfReport, async_perf_stage
from app.core.redis_client import OptionalRedisClient, get_redis_client
from app.jobs.market_session_schedule import current_cache_ttl_seconds
from app.modules.market_data.market_data_repository import (
    MarketDataRepository,
    get_market_data_repository,
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

UNIVERSE_PREVIOUS_CACHE_TTL_MULTIPLIER = 2


class UniverseCacheUnavailableError(RuntimeError):
    """Raised when scored universe is not cached and no stale fallback exists."""


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

    async def get_scored_universe(self, *, exchange: ExchangeCode) -> list[ScoredUniverseRow]:
        session_trade_date, source_last_synced_at = (
            await self.market_repository.get_decision_session_freshness(exchange=exchange)
        )

        if self.redis.is_available:
            cache_key = universe_cache_key("scored", exchange)
            cached = await self._cache_get(cache_key)
            if cached is not None:
                cached_payload = self._parse_cache_payload(cached)
                if cached_payload is not None and self._cache_matches_identity(
                    cached_payload,
                    session_trade_date,
                    source_last_synced_at,
                ):
                    return cached_payload.rows
                logger.info(
                    "Ignoring stale universe:scored for %s (session %s)",
                    exchange.value,
                    session_trade_date,
                )

            prev_key = universe_prev_cache_key(exchange)
            stale = await self._cache_get(prev_key)
            if stale is not None:
                stale_payload = self._parse_cache_payload(stale)
                if stale_payload is not None and self._previous_cache_can_bridge_rebuild(
                    stale_payload, session_trade_date
                ):
                    logger.info(
                        "Serving compatible universe:scored:prev for %s while rebuild runs",
                        exchange.value,
                    )
                    from app.jobs.market_cache_spawn import spawn_rebuild_universe_read_cache

                    spawn_rebuild_universe_read_cache(exchange, settings=self.settings)
                    return stale_payload.rows
                logger.info(
                    "Ignoring stale universe:scored:prev for %s (session %s)",
                    exchange.value,
                    session_trade_date,
                )

        raise UniverseCacheUnavailableError(
            f"Scored universe cache is unavailable for {exchange.value}; "
            "background rebuild required"
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

    @staticmethod
    def _previous_cache_can_bridge_rebuild(
        payload: ScoredUniverseCacheRead,
        current_session_date: date | None,
    ) -> bool:
        """Allow a prior complete universe only while the canonical rebuild catches up.

        The primary cache must match the current source revision exactly.  The
        ``:prev`` key exists specifically to bridge that transition, so applying
        the same revision check here turns normal rebuild windows into 503s.
        """
        previous_session_date = payload.decision_session_date
        return (
            current_session_date is not None
            and previous_session_date is not None
            and previous_session_date <= current_session_date
            and bool(payload.rows)
            and payload.session_trade_date == previous_session_date
            and payload.strategy_version == TRADING_STRATEGY_VERSION
            and payload.threshold_version == TRADING_THRESHOLD_VERSION
            and payload.input_schema_version == TRADING_INPUT_SCHEMA_VERSION
            and payload.decision_taxonomy_version == DECISION_TAXONOMY_VERSION
            and payload.scanner_version == SCANNER_CONDITION_VERSION
            and all(
                row.eligibility is not None
                and row.eligibility.exchange_session_date == previous_session_date
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

    async def recompute_scored_universe(self, exchange: ExchangeCode) -> list[ScoredUniverseRow]:
        perf = PerfReport("universe.rebuild")
        decision_session_date = await self.market_repository.get_latest_finalized_session_date(
            exchange=exchange
        )
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
        if self.decision_snapshot_repository is not None:
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
    ) -> None:
        cache_key = universe_cache_key("scored", exchange)
        freshness_date, source_last_synced_at = (
            await self.market_repository.get_decision_session_freshness(exchange=exchange)
        )
        live_trade_date, live_last_synced_at = (
            await self.market_repository.get_market_price_freshness(exchange=exchange)
        )
        is_live_session = live_trade_date is not None and (
            freshness_date is None or live_trade_date > freshness_date
        )
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
            live_data_as_of=live_last_synced_at if is_live_session else None,
            is_live_session=is_live_session,
            source_last_synced_at=source_last_synced_at,
            payload_revision=compute_universe_payload_revision(rows),
            rows=rows,
        )

        current = await self._cache_get(cache_key)
        previous_payload = self._parse_cache_payload(current) if current is not None else None
        monitoring_report = monitor_universe_payload(
            payload,
            expected_session_date=payload.session_trade_date,
            expected_source_last_synced_at=source_last_synced_at,
            previous_payload=previous_payload,
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
        ttl_seconds = current_cache_ttl_seconds(self.settings)
        previous_payload = current or serialized_payload
        await self._cache_set(
            universe_prev_cache_key(exchange),
            previous_payload,
            ttl_seconds=ttl_seconds * UNIVERSE_PREVIOUS_CACHE_TTL_MULTIPLIER,
        )
        await self._cache_set(cache_key, serialized_payload, ttl_seconds=ttl_seconds)

    async def get_universe_rows(self, *, exchange: ExchangeCode) -> UniverseRowsRead:
        session_trade_date, source_last_synced_at = (
            await self.market_repository.get_decision_session_freshness(exchange=exchange)
        )
        live_trade_date, live_last_synced_at = (
            await self.market_repository.get_market_price_freshness(exchange=exchange)
        )
        is_live_session = live_trade_date is not None and (
            session_trade_date is None or live_trade_date > session_trade_date
        )
        rows = await self.get_scored_universe(exchange=exchange)
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
                live_data_as_of=live_last_synced_at if is_live_session else None,
                is_live_session=is_live_session,
                source_last_synced_at=source_last_synced_at,
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
