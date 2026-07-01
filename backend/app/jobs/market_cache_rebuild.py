"""Background rebuild of Redis read caches after market data changes."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from app.core.core_config import Settings, get_settings
from app.core.database_session import AsyncSessionLocal
from app.core.enums import ExchangeCode
from app.core.perf_timing import PerfReport, async_perf_stage
from app.core.redis_client import OptionalRedisClient, build_redis_client
from app.core.security_config import UserContext
from app.modules.market_dashboard.market_dashboard_service import MarketDashboardService
from app.modules.market_data.market_data_repository import MarketDataRepository
from app.modules.market_data.market_data_service import MarketDataService
from app.modules.market_universe.market_universe_service import MarketUniverseService
from app.modules.stocks.stocks_repository import StocksRepository

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
    )


async def _cache_dashboard_section(
    service: MarketDashboardService,
    *,
    section: str,
    exchange: ExchangeCode,
    payload,
) -> None:
    await service.cache_dashboard_payload(section, exchange, payload)


async def rebuild_market_read_cache(
    exchange: ExchangeCode,
    *,
    settings: Settings | None = None,
    redis: OptionalRedisClient | None = None,
    include_universe: bool = True,
) -> RebuildMarketReadCacheResult:
    """Rebuild read caches in priority order: overview → sectors → universe."""
    resolved_settings = settings or get_settings()
    resolved_redis = redis if redis is not None else build_redis_client(resolved_settings)
    result = RebuildMarketReadCacheResult(exchange=exchange)
    perf = PerfReport("rebuild_market_read_cache")

    async with AsyncSessionLocal() as session:
        dashboard_service = _build_dashboard_service(session, resolved_settings, resolved_redis)

        try:
            async with async_perf_stage(perf, "rebuild.overview"):
                overview = await dashboard_service.compute_overview(exchange)
            await _cache_dashboard_section(
                dashboard_service,
                section="overview",
                exchange=exchange,
                payload=overview,
            )
            result.steps.append(RebuildStepResult(step="overview", success=True))
        except Exception as exc:
            logger.exception("Rebuild overview failed for %s", exchange.value)
            result.steps.append(RebuildStepResult(step="overview", success=False, error=str(exc)))

        try:
            async with async_perf_stage(perf, "rebuild.sectors"):
                sectors = await dashboard_service.compute_sectors(exchange)
            await _cache_dashboard_section(
                dashboard_service,
                section="sectors",
                exchange=exchange,
                payload=sectors,
            )
            result.steps.append(RebuildStepResult(step="sectors", success=True))
        except Exception as exc:
            logger.exception("Rebuild sectors failed for %s", exchange.value)
            result.steps.append(RebuildStepResult(step="sectors", success=False, error=str(exc)))

        if include_universe:
            try:
                async with async_perf_stage(perf, "rebuild.universe"):
                    universe_service = _build_universe_service(session, resolved_settings, resolved_redis)
                    rows = await universe_service.recompute_scored_universe(exchange)
                    await universe_service.cache_scored_universe(exchange, rows)
                result.steps.append(RebuildStepResult(step="universe", success=True))
            except Exception as exc:
                logger.exception("Rebuild universe failed for %s", exchange.value)
                result.steps.append(RebuildStepResult(step="universe", success=False, error=str(exc)))

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
) -> RebuildStepResult:
    resolved_settings = settings or get_settings()
    resolved_redis = redis if redis is not None else build_redis_client(resolved_settings)
    try:
        async with AsyncSessionLocal() as session:
            universe_service = _build_universe_service(session, resolved_settings, resolved_redis)
            rows = await universe_service.recompute_scored_universe(exchange)
            await universe_service.cache_scored_universe(exchange, rows)
        return RebuildStepResult(step="universe", success=True)
    except Exception as exc:
        logger.exception("Universe-only rebuild failed for %s", exchange.value)
        return RebuildStepResult(step="universe", success=False, error=str(exc))

