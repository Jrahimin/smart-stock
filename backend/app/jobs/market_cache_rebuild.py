"""Background rebuild of Redis read caches after market data changes."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from uuid import uuid4

from app.core.core_config import Settings, get_settings
from app.core.database_session import AsyncSessionLocal
from app.core.enums import ExchangeCode
from app.core.market_cache import REBUILD_LOCK_TTL_SECONDS, market_rebuild_lock_key
from app.core.perf_timing import PerfReport, async_perf_stage
from app.core.redis_client import OptionalRedisClient, build_redis_client
from app.core.security_config import UserContext
from app.modules.market_dashboard.market_dashboard_service import MarketDashboardService
from app.modules.market_data.market_data_repository import MarketDataRepository
from app.modules.market_data.market_data_service import MarketDataService
from app.modules.market_universe.market_universe_service import MarketUniverseService
from app.modules.stocks.stocks_repository import StocksRepository
from app.modules.trading_intelligence.decision_snapshot_repository import (
    DecisionSnapshotRepository,
)

logger = logging.getLogger(__name__)


@dataclass
class RebuildStepResult:
    step: str
    success: bool
    error: str | None = None


@dataclass
class RebuildMarketReadCacheResult:
    exchange: ExchangeCode
    steps: list[RebuildStepResult] = field(default_factory=list)

    @property
    def success(self) -> bool:
        return all(step.success for step in self.steps)


@dataclass
class _RebuildLease:
    lost: asyncio.Event
    task: asyncio.Task[None] | None = None


def _system_user() -> UserContext:
    return UserContext(
        user_id="system",
        display_name="System Job",
        is_authenticated=True,
        roles=["system"],
    )


def _build_dashboard_service(session, settings: Settings, redis: OptionalRedisClient) -> MarketDashboardService:
    return MarketDashboardService(
        market_repository=MarketDataRepository(session),
        market_data_service=MarketDataService(MarketDataRepository(session), _system_user()),
        stocks_repository=StocksRepository(session),
        redis=redis,
        settings=settings,
    )


def _build_universe_service(session, settings: Settings, redis: OptionalRedisClient) -> MarketUniverseService:
    return MarketUniverseService(
        market_repository=MarketDataRepository(session),
        stocks_repository=StocksRepository(session),
        redis=redis,
        settings=settings,
        decision_snapshot_repository=DecisionSnapshotRepository(session),
    )


async def _cache_dashboard_section(
    service: MarketDashboardService,
    *,
    section: str,
    exchange: ExchangeCode,
    payload,
    market_sync_id: str | None = None,
) -> None:
    if market_sync_id is None:
        await service.cache_dashboard_payload(section, exchange, payload)
        return
    await service.cache_dashboard_payload(section, exchange, payload, market_sync_id=market_sync_id)


async def _compute_and_cache_dashboard_section(
    service: MarketDashboardService,
    *,
    section: str,
    exchange: ExchangeCode,
    compute,
):
    """Fence a dashboard section to one immutable publication identity."""

    if not hasattr(service, "market_data_service"):
        payload = await compute()
        await _cache_dashboard_section(
            service,
            section=section,
            exchange=exchange,
            payload=payload,
        )
        return payload

    for _ in range(2):
        before = await service.market_data_service.get_market_freshness(exchange=exchange)
        payload = await compute()
        after = await service.market_data_service.get_market_freshness(exchange=exchange)
        before_id = before.market_sync_id or before.last_synced_at
        after_id = after.market_sync_id or after.last_synced_at
        if before_id and before_id == after_id:
            await _cache_dashboard_section(
                service,
                section=section,
                exchange=exchange,
                payload=payload,
                market_sync_id=before.market_sync_id,
            )
            return payload
    raise RuntimeError(f"Published generation changed while rebuilding dashboard {section}")


async def _rebuild_current_universe(
    service: MarketUniverseService,
    *,
    exchange: ExchangeCode,
) -> str:
    """Build latest generation under one context; retain old doubles for rolling tests."""

    if not hasattr(service, "resolve_generation_context"):
        rows = await service.recompute_scored_universe(exchange)
        await service.cache_scored_universe(exchange, rows)
        return "universe"

    for _ in range(3):
        generation = await service.resolve_generation_context(exchange=exchange)
        if generation is None:
            raise RuntimeError("No published market generation is available")
        if await service.has_cached_generation(exchange=exchange, generation=generation):
            promoter = getattr(service, "promote_cached_generation", None)
            if promoter is not None and not await promoter(exchange=exchange, generation=generation):
                continue
            return "universe-current"
        rows = await service.recompute_scored_universe(exchange, generation=generation)
        if await service.cache_scored_universe(
            exchange,
            rows,
            generation=generation,
        ):
            return "universe"
    raise RuntimeError("Published generation kept changing during rebuild")


async def _acquire_rebuild_lock(
    redis: OptionalRedisClient,
    exchange: ExchangeCode,
    *,
    wait: bool,
) -> str | None:
    """Acquire one owned per-exchange lock; waiters coalesce behind active work."""
    token = uuid4().hex
    attempts = REBUILD_LOCK_TTL_SECONDS * 2 if wait and redis.is_available else 1
    for attempt in range(attempts):
        acquired = await redis.set_if_not_exists(
            market_rebuild_lock_key(exchange),
            token,
            ttl_seconds=REBUILD_LOCK_TTL_SECONDS,
        )
        if acquired:
            return token
        if getattr(redis, "coordination_failed", False):
            return None
        if attempt + 1 < attempts:
            await asyncio.sleep(0.5)
    return None


async def _release_rebuild_lock(
    redis: OptionalRedisClient,
    exchange: ExchangeCode,
    token: str,
) -> None:
    if not redis.is_available:
        return

    try:
        if isinstance(redis, OptionalRedisClient):
            await redis.delete_if_value(market_rebuild_lock_key(exchange), token)
        else:
            await redis.delete(market_rebuild_lock_key(exchange))
    except Exception:
        logger.warning("Failed to release rebuild lock for %s", exchange.value, exc_info=True)


async def _renew_rebuild_lock(
    redis: OptionalRedisClient,
    exchange: ExchangeCode,
    token: str,
) -> bool:
    renewer = getattr(redis, "extend_if_value", None)
    if renewer is None:
        return True
    return bool(
        await renewer(
            market_rebuild_lock_key(exchange),
            token,
            ttl_seconds=REBUILD_LOCK_TTL_SECONDS,
        )
    )


def _start_rebuild_lock_lease(
    redis: OptionalRedisClient,
    exchange: ExchangeCode,
    token: str,
) -> _RebuildLease:
    lease = _RebuildLease(lost=asyncio.Event())

    async def _heartbeat() -> None:
        interval_seconds = max(1, REBUILD_LOCK_TTL_SECONDS // 3)
        while True:
            await asyncio.sleep(interval_seconds)
            if not await _renew_rebuild_lock(redis, exchange, token):
                lease.lost.set()
                logger.error("Lost rebuild lock lease for %s", exchange.value)
                return

    lease.task = asyncio.create_task(
        _heartbeat(),
        name=f"market-rebuild-lease-{exchange.value}",
    )
    return lease


async def _stop_rebuild_lock_lease(lease: _RebuildLease) -> None:
    if lease.task is None:
        return
    lease.task.cancel()
    try:
        await lease.task
    except asyncio.CancelledError:
        pass


def _ensure_rebuild_lease(lease: _RebuildLease) -> None:
    if lease.lost.is_set():
        raise RuntimeError("Market rebuild lock lease was lost")


async def rebuild_market_read_cache(
    exchange: ExchangeCode,
    *,
    settings: Settings | None = None,
    redis: OptionalRedisClient | None = None,
    include_universe: bool = True,
    wait_for_lock: bool = False,
) -> RebuildMarketReadCacheResult:
    """Rebuild read caches in priority order: overview → sectors → movers → universe."""
    resolved_settings = settings or get_settings()
    resolved_redis = redis if redis is not None else build_redis_client(resolved_settings)
    result = RebuildMarketReadCacheResult(exchange=exchange)

    lock_token = await _acquire_rebuild_lock(
        resolved_redis,
        exchange,
        wait=wait_for_lock,
    )
    if lock_token is None:
        logger.info("Market read-cache rebuild already in progress for %s; skipping duplicate", exchange.value)
        result.steps.append(RebuildStepResult(step="skipped-duplicate", success=True))
        return result

    perf = PerfReport("rebuild_market_read_cache")
    lease = _start_rebuild_lock_lease(resolved_redis, exchange, lock_token)

    try:
        async with AsyncSessionLocal() as session:
            dashboard_service = _build_dashboard_service(session, resolved_settings, resolved_redis)

            try:
                async with async_perf_stage(perf, "rebuild.overview"):
                    await _compute_and_cache_dashboard_section(
                        dashboard_service,
                        section="overview",
                        exchange=exchange,
                        compute=lambda: dashboard_service.compute_overview(exchange),
                    )
                result.steps.append(RebuildStepResult(step="overview", success=True))
            except Exception as exc:
                logger.exception("Rebuild overview failed for %s", exchange.value)
                result.steps.append(RebuildStepResult(step="overview", success=False, error=str(exc)))

            try:
                async with async_perf_stage(perf, "rebuild.sectors"):
                    await _compute_and_cache_dashboard_section(
                        dashboard_service,
                        section="sectors",
                        exchange=exchange,
                        compute=lambda: dashboard_service.compute_sectors(exchange),
                    )
                result.steps.append(RebuildStepResult(step="sectors", success=True))
            except Exception as exc:
                logger.exception("Rebuild sectors failed for %s", exchange.value)
                result.steps.append(RebuildStepResult(step="sectors", success=False, error=str(exc)))

            try:
                async with async_perf_stage(perf, "rebuild.movers"):
                    await _compute_and_cache_dashboard_section(
                        dashboard_service,
                        section="movers",
                        exchange=exchange,
                        compute=lambda: dashboard_service.compute_movers(exchange),
                    )
                result.steps.append(RebuildStepResult(step="movers", success=True))
            except Exception as exc:
                logger.exception("Rebuild movers failed for %s", exchange.value)
                result.steps.append(RebuildStepResult(step="movers", success=False, error=str(exc)))

            if include_universe:
                try:
                    async with async_perf_stage(perf, "rebuild.universe"):
                        universe_service = _build_universe_service(session, resolved_settings, resolved_redis)
                        await _rebuild_current_universe(
                            universe_service,
                            exchange=exchange,
                        )
                    result.steps.append(RebuildStepResult(step="universe", success=True))
                except Exception as exc:
                    logger.exception("Rebuild universe failed for %s", exchange.value)
                    result.steps.append(RebuildStepResult(step="universe", success=False, error=str(exc)))
            try:
                _ensure_rebuild_lease(lease)
            except RuntimeError as exc:
                # A lost lease means this worker no longer owns publication.
                # Surface it in the ordinary rebuild result instead of reporting
                # the already-computed sections as a successful rebuild.
                result.steps.append(RebuildStepResult(step="lease", success=False, error=str(exc)))
    finally:
        await _stop_rebuild_lock_lease(lease)
        await _release_rebuild_lock(resolved_redis, exchange, lock_token)

    perf.log_summary()
    logger.info(
        "rebuild_market_read_cache %s: success=%s steps=%s",
        exchange.value,
        result.success,
        [(step.step, step.success) for step in result.steps],
    )
    return result


async def rebuild_universe_read_cache(
    exchange: ExchangeCode,
    *,
    settings: Settings | None = None,
    redis: OptionalRedisClient | None = None,
    wait_for_lock: bool = False,
) -> RebuildStepResult:
    resolved_settings = settings or get_settings()
    resolved_redis = redis if redis is not None else build_redis_client(resolved_settings)
    lock_token = await _acquire_rebuild_lock(
        resolved_redis,
        exchange,
        wait=wait_for_lock,
    )
    if lock_token is None:
        return RebuildStepResult(step="universe-coalesced", success=True)
    lease = _start_rebuild_lock_lease(resolved_redis, exchange, lock_token)
    try:
        async with AsyncSessionLocal() as session:
            universe_service = _build_universe_service(session, resolved_settings, resolved_redis)
            step = await _rebuild_current_universe(universe_service, exchange=exchange)
            _ensure_rebuild_lease(lease)
            return RebuildStepResult(step=step, success=True)
    except Exception as exc:
        logger.exception("Universe-only rebuild failed for %s", exchange.value)
        return RebuildStepResult(step="universe", success=False, error=str(exc))
    finally:
        await _stop_rebuild_lock_lease(lease)
        await _release_rebuild_lock(resolved_redis, exchange, lock_token)
