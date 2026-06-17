from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.core.constants.trading_constants import PULSE_PRICE_WINDOW_LIMIT, PULSE_UNIVERSE_LIMIT
from app.core.core_config import Settings, get_settings
from app.core.enums import ExchangeCode
from app.core.redis_client import OptionalRedisClient, get_redis_client
from app.modules.market_data.market_data_repository import MarketDataRepository, get_market_data_repository
from app.modules.market_universe.market_universe_cache import universe_cache_key
from app.modules.market_universe.market_universe_compute import (
    build_scored_universe_rows,
    group_price_window_rows,
)
from app.modules.market_universe.market_universe_schemas import (
    ScoredUniverseCacheRead,
    ScoredUniverseRow,
    UniverseRowsMetaRead,
    UniverseRowsRead,
)
from app.modules.stocks.stocks_repository import StocksRepository, get_stocks_repository


class MarketUniverseService:
    def __init__(
        self,
        market_repository: MarketDataRepository,
        stocks_repository: StocksRepository,
        redis: OptionalRedisClient,
        settings: Settings,
    ) -> None:
        self.market_repository = market_repository
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

    async def get_scored_universe(self, *, exchange: ExchangeCode) -> list[ScoredUniverseRow]:
        cache_key = universe_cache_key("scored", exchange)
        cached = await self._cache_get(cache_key)
        if cached is not None:
            return ScoredUniverseCacheRead.model_validate(cached).rows

        rows = await self._compute_scored_universe(exchange)
        await self._cache_set(
            cache_key,
            ScoredUniverseCacheRead(rows=rows).model_dump(mode="json"),
        )
        return rows

    async def _compute_scored_universe(self, exchange: ExchangeCode) -> list[ScoredUniverseRow]:
        window_rows = await self.market_repository.list_market_price_windows(
            exchange=exchange,
            limit=PULSE_UNIVERSE_LIMIT,
            offset=0,
            price_window_limit=PULSE_PRICE_WINDOW_LIMIT,
        )
        grouped = group_price_window_rows(window_rows)
        return build_scored_universe_rows(grouped)

    async def get_universe_rows(self, *, exchange: ExchangeCode) -> UniverseRowsRead:
        session_trade_date, _ = await self.market_repository.get_market_price_freshness(exchange=exchange)
        rows = await self.get_scored_universe(exchange=exchange)
        listed_stock_count = await self.stocks_repository.count_stocks(exchange=exchange, is_active=True)
        return UniverseRowsRead(
            meta=UniverseRowsMetaRead(
                exchange=exchange,
                listed_stock_count=listed_stock_count,
                session_trade_date=session_trade_date,
            ),
            rows=rows,
        )


def get_market_universe_service(
    market_repository: Annotated[MarketDataRepository, Depends(get_market_data_repository)],
    stocks_repository: Annotated[StocksRepository, Depends(get_stocks_repository)],
    redis: Annotated[OptionalRedisClient, Depends(get_redis_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> MarketUniverseService:
    return MarketUniverseService(
        market_repository,
        stocks_repository,
        redis,
        settings,
    )
