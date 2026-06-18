from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends

from app.core.core_config import Settings, get_settings
from app.core.enums import ExchangeCode
from app.core.exception_handlers import NotFoundError
from app.core.redis_client import OptionalRedisClient, get_redis_client
from app.models import DailyPrice, Stock
from app.modules.stock_details.decision.sector_intelligence import (
    SectorContextResult,
    average_change,
    build_comparative_snapshot,
    build_sector_performers,
    build_sector_ranks,
    resolve_sector_trend_window,
)
from app.modules.stock_details.stock_details_cache import stock_sector_context_cache_key
from app.modules.stock_details.stock_details_repository import (
    StockDetailsRepository,
    get_stock_details_repository,
)
from app.modules.stock_details.stock_details_workspace_schemas import (
    ComparativeMetricRead,
    SectorContextRead,
    SectorPerformerRead,
    SectorRankRead,
)


def _price_change_percent(prices: list[DailyPrice], trading_day_window: int) -> float | None:
    if len(prices) <= trading_day_window:
        return None
    latest = float(prices[0].close_price)
    prior = float(prices[trading_day_window].close_price)
    if prior == 0:
        return None
    return ((latest - prior) / prior) * 100


def _build_price_changes(
    prices_by_stock: dict[UUID, list[DailyPrice]],
    stock_ids: list[UUID],
    trading_day_window: int,
) -> dict[UUID, float | None]:
    return {
        stock_id: _price_change_percent(prices_by_stock.get(stock_id, []), trading_day_window)
        for stock_id in stock_ids
    }


def _valuation_maps(
    stock_ids: list[UUID],
    snapshots: dict,
    stocks_by_id: dict[UUID, Stock],
) -> tuple[dict[UUID, float | None], dict[UUID, float | None], dict[UUID, float | None], dict[UUID, float | None]]:
    pe_ratios: dict[UUID, float | None] = {}
    pb_ratios: dict[UUID, float | None] = {}
    dividend_yields: dict[UUID, float | None] = {}
    market_caps: dict[UUID, float | None] = {}

    for stock_id in stock_ids:
        stock = stocks_by_id.get(stock_id)
        snapshot = snapshots.get(stock_id)
        market_cap = float(stock.market_cap) if stock and stock.market_cap is not None else None
        if snapshot and snapshot.market_cap is not None:
            market_cap = float(snapshot.market_cap)
        market_caps[stock_id] = market_cap
        pe_ratios[stock_id] = float(snapshot.pe_ratio) if snapshot and snapshot.pe_ratio else None
        pb_ratios[stock_id] = float(snapshot.pb_ratio) if snapshot and snapshot.pb_ratio else None
        dividend_yields[stock_id] = (
            float(snapshot.dividend_yield) if snapshot and snapshot.dividend_yield is not None else None
        )

    return pe_ratios, pb_ratios, dividend_yields, market_caps


class SectorIntelligenceService:
    def __init__(
        self,
        repository: StockDetailsRepository,
        redis: OptionalRedisClient,
        settings: Settings,
    ) -> None:
        self.repository = repository
        self.redis = redis
        self.settings = settings

    @property
    def cache_ttl_seconds(self) -> int:
        return self.settings.market_dashboard_cache_ttl_seconds

    async def get_sector_context(self, *, exchange: ExchangeCode, symbol: str) -> SectorContextRead | None:
        stock = await self.repository.get_stock_by_exchange_symbol(exchange=exchange, symbol=symbol)
        if stock is None:
            raise NotFoundError("Stock was not found")

        sector = (stock.sector or "").strip()
        if not sector:
            return None

        prices = await self.repository.list_daily_prices_window(stock_id=stock.id, limit=1)
        latest_trade_date = prices[-1].trade_date.isoformat() if prices else "unknown"
        cache_key = stock_sector_context_cache_key(exchange, symbol, latest_trade_date)
        cached = await self.redis.get_json(cache_key)
        if cached is not None:
            return SectorContextRead.model_validate(cached)

        result = await self._build_sector_context(stock=stock, sector=sector)
        if result is None:
            return None

        payload = self._to_read(result)
        await self.redis.set_json(cache_key, payload.model_dump(mode="json"), ttl_seconds=self.cache_ttl_seconds)
        return payload

    async def _build_sector_context(self, *, stock: Stock, sector: str) -> SectorContextResult | None:
        sector_stocks = await self.repository.list_active_stocks_in_sector(
            exchange=stock.exchange,
            sector=sector,
        )
        if not sector_stocks:
            return None

        sector_stock_ids = [item.id for item in sector_stocks]
        stocks_by_id = {item.id: item for item in sector_stocks}
        exchange_stocks = await self.repository.list_active_stocks_on_exchange(exchange=stock.exchange)
        exchange_stock_ids = [item.id for item in exchange_stocks]
        all_stock_ids = list({*sector_stock_ids, *exchange_stock_ids})

        valuations, prices_by_stock, eps_growth = await self._gather_batch_data(all_stock_ids)

        changes_5d = _build_price_changes(prices_by_stock, sector_stock_ids, 5)
        changes_20d = _build_price_changes(prices_by_stock, sector_stock_ids, 20)
        trend_window, active_changes = resolve_sector_trend_window(sector_stock_ids, changes_5d, changes_20d)
        sector_trend_percent = average_change(active_changes, sector_stock_ids)
        top_performer, worst_performer = build_sector_performers(
            symbols_by_id={sid: stocks_by_id[sid].symbol for sid in sector_stock_ids if sid in stocks_by_id},
            changes=active_changes,
        )

        sector_pe, sector_pb, sector_yield, sector_caps = _valuation_maps(
            sector_stock_ids,
            valuations,
            stocks_by_id,
        )
        market_pe, market_pb, market_yield, _market_caps = _valuation_maps(
            exchange_stock_ids,
            valuations,
            {item.id: item for item in exchange_stocks},
        )

        ranks = build_sector_ranks(
            stock_id=stock.id,
            sector_stock_ids=sector_stock_ids,
            market_caps=sector_caps,
            dividend_yields=sector_yield,
            pe_ratios=sector_pe,
        )

        comparative = build_comparative_snapshot(
            stock_pe=sector_pe.get(stock.id),
            stock_pb=sector_pb.get(stock.id),
            stock_dividend_yield=sector_yield.get(stock.id),
            stock_eps_growth=eps_growth.get(stock.id),
            sector_pe_values=[sector_pe[sid] for sid in sector_stock_ids],
            sector_pb_values=[sector_pb[sid] for sid in sector_stock_ids],
            sector_yield_values=[sector_yield[sid] for sid in sector_stock_ids],
            sector_eps_growth_values=[eps_growth.get(sid) for sid in sector_stock_ids],
            market_pe_values=[market_pe[sid] for sid in exchange_stock_ids],
            market_pb_values=[market_pb[sid] for sid in exchange_stock_ids],
            market_yield_values=[market_yield[sid] for sid in exchange_stock_ids],
            market_eps_growth_values=[eps_growth.get(sid) for sid in exchange_stock_ids],
        )

        from statistics import median

        sector_pe_values = [value for value in sector_pe.values() if value is not None and value > 0]
        sector_pb_values = [value for value in sector_pb.values() if value is not None and value > 0]

        return SectorContextResult(
            sector_name=sector,
            stock_count=len(sector_stocks),
            median_pe=float(median(sector_pe_values)) if len(sector_pe_values) >= 3 else None,
            median_pb=float(median(sector_pb_values)) if len(sector_pb_values) >= 3 else None,
            sector_trend_percent=sector_trend_percent,
            sector_trend_window=trend_window,
            top_performer=top_performer,
            worst_performer=worst_performer,
            ranks=ranks,
            comparative_snapshot=comparative,
        )

    async def _gather_batch_data(self, stock_ids: list[UUID]):
        import asyncio

        return await asyncio.gather(
            self.repository.list_latest_valuation_snapshots_for_stocks(stock_ids),
            self.repository.list_recent_daily_prices_for_stocks(stock_ids, limit_per_stock=21),
            self.repository.list_eps_yoy_growth_for_stocks(stock_ids),
        )

    def _to_read(self, result: SectorContextResult) -> SectorContextRead:
        return SectorContextRead(
            sector_name=result.sector_name,
            stock_count=result.stock_count,
            median_pe=result.median_pe,
            median_pb=result.median_pb,
            sector_trend_percent=result.sector_trend_percent,
            sector_trend_window=result.sector_trend_window,
            top_performer=(
                SectorPerformerRead(
                    symbol=result.top_performer.symbol,
                    change_percent=result.top_performer.change_percent,
                )
                if result.top_performer
                else None
            ),
            worst_performer=(
                SectorPerformerRead(
                    symbol=result.worst_performer.symbol,
                    change_percent=result.worst_performer.change_percent,
                )
                if result.worst_performer
                else None
            ),
            ranks=[
                SectorRankRead(key=rank.key, label=rank.label, rank=rank.rank, total=rank.total)
                for rank in result.ranks
            ],
            comparative_snapshot=[
                ComparativeMetricRead(
                    key=metric.key,
                    label=metric.label,
                    stock_value=metric.stock_value,
                    sector_median=metric.sector_median,
                    market_median=metric.market_median,
                )
                for metric in result.comparative_snapshot
            ],
        )


def get_sector_intelligence_service(
    repository: Annotated[StockDetailsRepository, Depends(get_stock_details_repository)],
    redis: Annotated[OptionalRedisClient, Depends(get_redis_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SectorIntelligenceService:
    return SectorIntelligenceService(repository, redis, settings)
