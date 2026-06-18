from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.core.core_config import Settings, get_settings
from app.core.enums import ExchangeCode
from app.core.exception_handlers import NotFoundError
from app.core.redis_client import OptionalRedisClient, get_redis_client
from app.modules.market_data.market_data_schemas import DailyPriceRead
from app.modules.stock_details.stock_details_cache import stock_workspace_cache_key
from app.modules.stock_details.stock_details_decision_service import (
    StockDetailsDecisionService,
    get_stock_details_decision_service,
)
from app.modules.stock_details.stock_details_repository import (
    StockDetailsRepository,
    get_stock_details_repository,
)
from app.modules.stock_details.stock_details_workspace_schemas import (
    FinancialMetricSnapshotRead,
    FundamentalsSnapshotRead,
    StockWorkspaceEventsRead,
    StockWorkspacePatternsRead,
    StockWorkspaceRead,
)
from app.modules.stocks.stocks_schemas import StockRead
from app.modules.stock_details.decision.fundamentals_snapshot import (
    FUNDAMENTALS_PERFORMANCE_METRIC_CODES,
    build_fundamentals_snapshot,
)


class StockDetailsWorkspaceService:
    def __init__(
        self,
        repository: StockDetailsRepository,
        decision_service: StockDetailsDecisionService,
        redis: OptionalRedisClient,
        settings: Settings,
    ) -> None:
        self.repository = repository
        self.decision_service = decision_service
        self.redis = redis
        self.settings = settings

    @property
    def cache_ttl_seconds(self) -> int:
        return self.settings.market_dashboard_cache_ttl_seconds

    async def _cache_get(self, cache_key: str) -> dict | None:
        return await self.redis.get_json(cache_key)

    async def _cache_set(self, cache_key: str, payload: dict) -> None:
        await self.redis.set_json(cache_key, payload, ttl_seconds=self.cache_ttl_seconds)

    async def _resolve_latest_trade_date(self, *, exchange: ExchangeCode, symbol: str) -> tuple[str, StockRead]:
        stock = await self.repository.get_stock_by_exchange_symbol(exchange=exchange, symbol=symbol)
        if stock is None:
            raise NotFoundError("Stock was not found")

        prices = await self.repository.list_daily_prices_window(stock_id=stock.id, limit=1)
        latest_trade_date = prices[-1].trade_date.isoformat() if prices else "unknown"
        return latest_trade_date, StockRead.model_validate(stock)

    async def get_workspace(self, *, exchange: ExchangeCode, symbol: str) -> StockWorkspaceRead:
        latest_trade_date, stock_read = await self._resolve_latest_trade_date(exchange=exchange, symbol=symbol)
        cache_key = stock_workspace_cache_key("core", exchange, symbol, latest_trade_date)
        cached = await self._cache_get(cache_key)
        if cached is not None:
            return StockWorkspaceRead.model_validate(cached)

        stock = await self.repository.get_stock_by_exchange_symbol(exchange=exchange, symbol=symbol)
        if stock is None:
            raise NotFoundError("Stock was not found")

        prices = await self.repository.list_daily_prices_window(stock_id=stock.id)
        decision_support = await self.decision_service.get_decision_support(exchange=exchange, symbol=symbol)
        metric_rows = await self.repository.list_latest_metric_values(
            stock_id=stock.id,
            metric_codes=list(FUNDAMENTALS_PERFORMANCE_METRIC_CODES),
        )
        fundamentals_result = build_fundamentals_snapshot(metric_rows)
        fundamentals_snapshot = FundamentalsSnapshotRead(
            metrics=[
                FinancialMetricSnapshotRead(
                    metric_code=metric.metric_code,
                    label=metric.label,
                    value=metric.value,
                    as_of_date=metric.as_of_date,
                    fiscal_year=metric.fiscal_year,
                )
                for metric in fundamentals_result.metrics
            ],
            latest_fiscal_year=fundamentals_result.latest_fiscal_year,
            latest_as_of_date=fundamentals_result.latest_as_of_date,
        )
        payload = StockWorkspaceRead(
            stock=stock_read,
            prices=[DailyPriceRead.model_validate(price) for price in prices],
            latest_trade_date=latest_trade_date,
            decision_support=decision_support,
            fundamentals_snapshot=fundamentals_snapshot,
        )
        await self._cache_set(cache_key, payload.model_dump(mode="json"))
        return payload

    async def get_workspace_patterns(self, *, exchange: ExchangeCode, symbol: str) -> StockWorkspacePatternsRead:
        workspace = await self.get_workspace(exchange=exchange, symbol=symbol)
        latest_trade_date = workspace.latest_trade_date
        cache_key = stock_workspace_cache_key("patterns", exchange, symbol, latest_trade_date)
        cached = await self._cache_get(cache_key)
        if cached is not None:
            return StockWorkspacePatternsRead.model_validate(cached)

        decision = workspace.decision_support
        payload = StockWorkspacePatternsRead(
            latest_trade_date=latest_trade_date,
            patterns=decision.patterns,
            primary_pattern=decision.primary_pattern,
            breakout=decision.breakout,
        )
        await self._cache_set(cache_key, payload.model_dump(mode="json"))
        return payload

    async def get_workspace_events(self, *, exchange: ExchangeCode, symbol: str) -> StockWorkspaceEventsRead:
        workspace = await self.get_workspace(exchange=exchange, symbol=symbol)
        latest_trade_date = workspace.latest_trade_date
        cache_key = stock_workspace_cache_key("events", exchange, symbol, latest_trade_date)
        cached = await self._cache_get(cache_key)
        if cached is not None:
            return StockWorkspaceEventsRead.model_validate(cached)

        decision = workspace.decision_support
        payload = StockWorkspaceEventsRead(
            latest_trade_date=latest_trade_date,
            ownership=decision.ownership,
            valuation=decision.valuation,
            events=decision.events,
        )
        await self._cache_set(cache_key, payload.model_dump(mode="json"))
        return payload


def get_stock_details_workspace_service(
    repository: Annotated[StockDetailsRepository, Depends(get_stock_details_repository)],
    decision_service: Annotated[StockDetailsDecisionService, Depends(get_stock_details_decision_service)],
    redis: Annotated[OptionalRedisClient, Depends(get_redis_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> StockDetailsWorkspaceService:
    return StockDetailsWorkspaceService(repository, decision_service, redis, settings)
