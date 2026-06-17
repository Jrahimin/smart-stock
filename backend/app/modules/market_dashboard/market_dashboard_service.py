from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import Depends

from app.core.constants.trading_constants import (
    DASHBOARD_MARKET_MOVERS_LIMIT,
    DASHBOARD_OVERVIEW_SUMMARIES_LIMIT,
)
from app.core.core_config import Settings, get_settings
from app.core.enums import ExchangeCode, TrendDirection
from app.core.redis_client import OptionalRedisClient, get_redis_client
from app.models import DailyPrice, Stock
from app.modules.market_data.market_data_repository import MarketDataRepository, get_market_data_repository
from app.modules.market_data.market_data_schemas import DailyMarketSummaryRead
from app.modules.market_data.market_data_service import MarketDataService, get_market_data_service
from app.modules.market_data.market_mover_rules import is_eligible_session_mover
from app.modules.market_dashboard.market_dashboard_cache import dashboard_cache_key
from app.modules.market_dashboard.market_dashboard_schemas import (
    DashboardMoverRead,
    DashboardMoversRead,
    DashboardOverviewRead,
)
from app.modules.stock_details.decision.technical import TechnicalSnapshot, build_technical_snapshot
from app.modules.stocks.stocks_repository import StocksRepository, get_stocks_repository

DASHBOARD_LATEST_PRICES_LIMIT = 5000


def _price_tone(change: float | None) -> TrendDirection:
    if change is None or change == 0:
        return TrendDirection.SIDEWAYS
    return TrendDirection.UPTREND if change > 0 else TrendDirection.DOWNTREND


def _to_mover_read(stock: Stock, snapshot: TechnicalSnapshot) -> DashboardMoverRead:
    change = snapshot.price_change_percent
    return DashboardMoverRead(
        stock_id=stock.id,
        symbol=stock.symbol,
        name=stock.name,
        exchange=stock.exchange,
        latest_price=Decimal(str(snapshot.latest_price or 0)),
        price_change_percent=Decimal(str(change)) if change is not None else None,
        turnover=Decimal(str(snapshot.turnover)) if snapshot.turnover is not None else None,
        volume=snapshot.volume,
        trend_direction=_price_tone(change),
    )


def _build_movers_from_rows(
    rows: list[tuple[Stock, DailyPrice, TechnicalSnapshot]],
    *,
    session_trade_date: date | None,
    limit: int = DASHBOARD_MARKET_MOVERS_LIMIT,
) -> DashboardMoversRead:
    eligible = [
        (stock, price, snapshot)
        for stock, price, snapshot in rows
        if is_eligible_session_mover(snapshot, session_trade_date)
    ]

    gainers = sorted(
        [row for row in eligible if (row[2].price_change_percent or 0) > 0],
        key=lambda row: row[2].price_change_percent or 0,
        reverse=True,
    )[:limit]
    losers = sorted(
        [row for row in eligible if (row[2].price_change_percent or 0) < 0],
        key=lambda row: row[2].price_change_percent or 0,
    )[:limit]
    turnover_leaders = sorted(
        eligible,
        key=lambda row: row[2].turnover or 0,
        reverse=True,
    )[:limit]
    volume_leaders = sorted(
        eligible,
        key=lambda row: row[2].volume,
        reverse=True,
    )[:limit]

    return DashboardMoversRead(
        session_trade_date=session_trade_date,
        gainers=[_to_mover_read(stock, snapshot) for stock, _, snapshot in gainers],
        losers=[_to_mover_read(stock, snapshot) for stock, _, snapshot in losers],
        turnover_leaders=[_to_mover_read(stock, snapshot) for stock, _, snapshot in turnover_leaders],
        volume_leaders=[_to_mover_read(stock, snapshot) for stock, _, snapshot in volume_leaders],
    )


class MarketDashboardService:
    def __init__(
        self,
        market_repository: MarketDataRepository,
        market_data_service: MarketDataService,
        stocks_repository: StocksRepository,
        redis: OptionalRedisClient,
        settings: Settings,
    ) -> None:
        self.market_repository = market_repository
        self.market_data_service = market_data_service
        self.stocks_repository = stocks_repository
        self.redis = redis
        self.settings = settings

    @property
    def cache_ttl_seconds(self) -> int:
        return self.settings.market_dashboard_cache_ttl_seconds

    async def _cache_get(self, cache_key: str) -> dict | None:
        return await self.redis.get_json(cache_key)

    async def _cache_set(self, cache_key: str, payload: dict) -> None:
        await self.redis.set_json(cache_key, payload, ttl_seconds=self.cache_ttl_seconds)

    async def get_overview(self, *, exchange: ExchangeCode) -> DashboardOverviewRead:
        cache_key = dashboard_cache_key("overview", exchange)
        cached = await self._cache_get(cache_key)
        if cached is not None:
            return DashboardOverviewRead.model_validate(cached)

        data = await self._compute_overview(exchange)
        await self._cache_set(cache_key, data.model_dump(mode="json"))
        return data

    async def get_movers(self, *, exchange: ExchangeCode) -> DashboardMoversRead:
        cache_key = dashboard_cache_key("movers", exchange)
        cached = await self._cache_get(cache_key)
        if cached is not None:
            return DashboardMoversRead.model_validate(cached)

        data = await self._compute_movers(exchange)
        await self._cache_set(cache_key, data.model_dump(mode="json"))
        return data

    async def _compute_overview(self, exchange: ExchangeCode) -> DashboardOverviewRead:
        session_trade_date, _ = await self.market_repository.get_market_price_freshness(exchange=exchange)
        summaries = await self.market_repository.list_daily_market_summaries(
            exchange=exchange,
            limit=DASHBOARD_OVERVIEW_SUMMARIES_LIMIT,
            offset=0,
        )
        dsex_index = await self.market_data_service.get_dsex_index_snapshot(exchange=exchange)
        listed_stock_count = await self.stocks_repository.count_stocks(exchange=exchange, is_active=True)

        return DashboardOverviewRead(
            exchange=exchange,
            session_trade_date=session_trade_date,
            listed_stock_count=listed_stock_count,
            dsex_index=dsex_index,
            summaries=[DailyMarketSummaryRead.model_validate(summary) for summary in summaries],
        )

    async def _compute_movers(self, exchange: ExchangeCode) -> DashboardMoversRead:
        session_trade_date, _ = await self.market_repository.get_market_price_freshness(exchange=exchange)
        latest_rows = await self.market_repository.list_latest_daily_prices(
            exchange=exchange,
            limit=DASHBOARD_LATEST_PRICES_LIMIT,
            offset=0,
        )

        scored_rows: list[tuple[Stock, DailyPrice, TechnicalSnapshot]] = []
        for stock, price in latest_rows:
            snapshot = build_technical_snapshot([price])
            if snapshot is None:
                continue
            scored_rows.append((stock, price, snapshot))

        return _build_movers_from_rows(scored_rows, session_trade_date=session_trade_date)


def get_market_dashboard_service(
    market_repository: Annotated[MarketDataRepository, Depends(get_market_data_repository)],
    market_data_service: Annotated[MarketDataService, Depends(get_market_data_service)],
    stocks_repository: Annotated[StocksRepository, Depends(get_stocks_repository)],
    redis: Annotated[OptionalRedisClient, Depends(get_redis_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> MarketDashboardService:
    return MarketDashboardService(
        market_repository,
        market_data_service,
        stocks_repository,
        redis,
        settings,
    )
