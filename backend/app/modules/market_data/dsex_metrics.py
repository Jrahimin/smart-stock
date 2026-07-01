"""DSEX performance metrics: local DB first, AmarStock fallback when history is shallow."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import Decimal

from app.core.core_config import Settings, get_settings
from app.core.enums import ExchangeCode
from app.core.redis_client import OptionalRedisClient, build_redis_client
from app.jobs.ingestion.amarstock_index_api_source import (
    AmarStockDsexPerformanceMetrics,
    AmarStockIndexApiSource,
)
from app.models import DailyMarketSummary

logger = logging.getLogger(__name__)

DSEX_SUMMARY_INDEX = "DSEX"
TRADING_DAYS_1M = 21
TRADING_DAYS_6M = 126
TRADING_DAYS_1Y = 252
AMARSTOCK_METRICS_CACHE_TTL_SECONDS = 86_400


@dataclass(frozen=True)
class DsexPerformanceSnapshot:
    return_1m_percent: Decimal | None
    return_6m_percent: Decimal | None
    return_1y_percent: Decimal | None
    range_52w_low: Decimal | None
    range_52w_high: Decimal | None


def _dsex_history(summaries: list[DailyMarketSummary]) -> list[DailyMarketSummary]:
    return sorted(
        (
            summary
            for summary in summaries
            if summary.index_name == DSEX_SUMMARY_INDEX and summary.index_close is not None
        ),
        key=lambda summary: summary.trade_date,
    )


def _compute_index_return_percent(
    current_close: Decimal,
    history: list[DailyMarketSummary],
    *,
    trading_days_back: int,
) -> Decimal | None:
    if not history:
        return None
    required_index = len(history) - 1 - trading_days_back
    if required_index < 0:
        return None
    past_close = history[required_index].index_close
    if past_close is None or past_close == 0:
        return None
    return (current_close - past_close) / past_close * Decimal("100")


def _local_range_from_history(
    historical_closes: list[Decimal],
    *,
    day_low: Decimal,
    day_high: Decimal,
) -> tuple[Decimal, Decimal]:
    if historical_closes:
        return min(historical_closes), max(historical_closes)
    return day_low, day_high


def _has_local_trading_depth(history: list[DailyMarketSummary], trading_days_back: int) -> bool:
    return len(history) > trading_days_back


def _amarstock_metrics_cache_key(exchange: ExchangeCode) -> str:
    return f"dsex:amarstock_metrics:{exchange.value}"


async def _load_cached_amarstock_metrics(
    redis: OptionalRedisClient,
    exchange: ExchangeCode,
) -> AmarStockDsexPerformanceMetrics | None:
    if not redis.is_available:
        return None
    payload = await redis.get_json(_amarstock_metrics_cache_key(exchange))
    if not isinstance(payload, dict):
        return None
    try:
        return AmarStockDsexPerformanceMetrics(
            return_1m_percent=_decimal_or_none(payload.get("return_1m_percent")),
            return_6m_percent=_decimal_or_none(payload.get("return_6m_percent")),
            return_1y_percent=_decimal_or_none(payload.get("return_1y_percent")),
            range_52w_low=_decimal_or_none(payload.get("range_52w_low")),
            range_52w_high=_decimal_or_none(payload.get("range_52w_high")),
        )
    except (TypeError, ValueError):
        return None


async def _store_cached_amarstock_metrics(
    redis: OptionalRedisClient,
    exchange: ExchangeCode,
    metrics: AmarStockDsexPerformanceMetrics,
) -> None:
    if not redis.is_available:
        return
    await redis.set_json(
        _amarstock_metrics_cache_key(exchange),
        {
            "return_1m_percent": str(metrics.return_1m_percent) if metrics.return_1m_percent is not None else None,
            "return_6m_percent": str(metrics.return_6m_percent) if metrics.return_6m_percent is not None else None,
            "return_1y_percent": str(metrics.return_1y_percent) if metrics.return_1y_percent is not None else None,
            "range_52w_low": str(metrics.range_52w_low) if metrics.range_52w_low is not None else None,
            "range_52w_high": str(metrics.range_52w_high) if metrics.range_52w_high is not None else None,
        },
        ttl_seconds=AMARSTOCK_METRICS_CACHE_TTL_SECONDS,
    )


def _decimal_or_none(value: object) -> Decimal | None:
    if value is None or value == "":
        return None
    return Decimal(str(value))


async def _fetch_amarstock_metrics(
    *,
    exchange: ExchangeCode,
    settings: Settings | None = None,
    redis: OptionalRedisClient | None = None,
) -> AmarStockDsexPerformanceMetrics | None:
    resolved_settings = settings or get_settings()
    resolved_redis = redis if redis is not None else build_redis_client(resolved_settings)
    cached = await _load_cached_amarstock_metrics(resolved_redis, exchange)
    if cached is not None:
        return cached
    try:
        metrics = await AmarStockIndexApiSource.from_settings(resolved_settings).fetch_dsex_performance_metrics()
    except Exception as exc:
        logger.warning("AmarStock DSEX metrics fallback unavailable: %s", exc)
        return None
    await _store_cached_amarstock_metrics(resolved_redis, exchange, metrics)
    return metrics


async def build_dsex_performance_snapshot(
    summaries: list[DailyMarketSummary],
    *,
    index_close: Decimal,
    day_low: Decimal,
    day_high: Decimal,
    exchange: ExchangeCode = ExchangeCode.DSE,
    settings: Settings | None = None,
    redis: OptionalRedisClient | None = None,
) -> DsexPerformanceSnapshot:
    """Compute DSEX horizon returns and 52w range without HTTP unless local depth is insufficient."""
    history = _dsex_history(summaries)
    historical_closes = [summary.index_close for summary in history if summary.index_close is not None]
    range_low, range_high = _local_range_from_history(historical_closes, day_low=day_low, day_high=day_high)

    return_1m: Decimal | None
    if _has_local_trading_depth(history, TRADING_DAYS_1M):
        return_1m = _compute_index_return_percent(index_close, history, trading_days_back=TRADING_DAYS_1M)
    else:
        fallback = await _fetch_amarstock_metrics(exchange=exchange, settings=settings, redis=redis)
        return_1m = fallback.return_1m_percent if fallback else None

    return_6m: Decimal | None
    if _has_local_trading_depth(history, TRADING_DAYS_6M):
        return_6m = _compute_index_return_percent(index_close, history, trading_days_back=TRADING_DAYS_6M)
    else:
        fallback = await _fetch_amarstock_metrics(exchange=exchange, settings=settings, redis=redis)
        return_6m = fallback.return_6m_percent if fallback else None

    return_1y: Decimal | None
    if _has_local_trading_depth(history, TRADING_DAYS_1Y):
        return_1y = _compute_index_return_percent(index_close, history, trading_days_back=TRADING_DAYS_1Y)
    else:
        fallback = await _fetch_amarstock_metrics(exchange=exchange, settings=settings, redis=redis)
        return_1y = fallback.return_1y_percent if fallback else None

    if len(historical_closes) <= TRADING_DAYS_1Y:
        fallback = await _fetch_amarstock_metrics(exchange=exchange, settings=settings, redis=redis)
        if fallback is not None:
            if fallback.range_52w_low is not None:
                range_low = fallback.range_52w_low
            if fallback.range_52w_high is not None:
                range_high = fallback.range_52w_high
            if return_1m is None:
                return_1m = fallback.return_1m_percent
            if return_6m is None:
                return_6m = fallback.return_6m_percent
            if return_1y is None:
                return_1y = fallback.return_1y_percent

    return DsexPerformanceSnapshot(
        return_1m_percent=return_1m,
        return_6m_percent=return_6m,
        return_1y_percent=return_1y,
        range_52w_low=range_low,
        range_52w_high=range_high,
    )
