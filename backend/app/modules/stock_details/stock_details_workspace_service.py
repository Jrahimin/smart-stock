from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import Depends

from app.core.core_config import Settings, get_settings
from app.jobs.market_session_schedule import current_cache_ttl_seconds
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
    DividendIntelligenceRead,
    FinancialMetricSnapshotRead,
    FinancialTrendPointRead,
    FinancialTrendRead,
    FundamentalsSnapshotRead,
    StockWorkspaceEventsRead,
    StockWorkspacePatternsRead,
    StockWorkspaceRead,
    ValuationContextRead,
    ValuationMetricContextRead,
)
from app.modules.stocks.stocks_schemas import StockRead
from app.modules.stock_details.decision.dividend_intelligence import build_dividend_intelligence
from app.modules.stock_details.decision.financial_trends import build_financial_trends
from app.modules.stock_details.decision.fundamentals_snapshot import (
    FUNDAMENTALS_PERFORMANCE_METRIC_CODES,
    FUNDAMENTALS_SNAPSHOT_QUERY_METRIC_CODES,
    build_fundamentals_snapshot,
)
from app.modules.stock_details.decision.valuation_context import build_valuation_context


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

    async def _cache_get(self, cache_key: str) -> dict | None:
        return await self.redis.get_json(cache_key)

    async def _cache_set(self, cache_key: str, payload: dict) -> None:
        ttl_seconds = current_cache_ttl_seconds(self.settings)
        await self.redis.set_json(cache_key, payload, ttl_seconds=ttl_seconds)

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
        (
            decision_support,
            metric_rows,
            metric_histories,
            dividend_events,
            market_events,
        ) = await asyncio.gather(
            self.decision_service.get_decision_support(exchange=exchange, symbol=symbol),
            self.repository.list_latest_metric_values(
                stock_id=stock.id,
                metric_codes=list(FUNDAMENTALS_SNAPSHOT_QUERY_METRIC_CODES),
            ),
            self.repository.list_metric_histories(
                stock_id=stock.id,
                metric_codes=list(FUNDAMENTALS_PERFORMANCE_METRIC_CODES),
                limit_per_code=5,
            ),
            self.repository.list_dividend_events(stock_id=stock.id, limit=10),
            self.repository.list_market_events(stock_id=stock.id, limit=20),
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
        financial_trends_result = build_financial_trends(metric_histories)
        financial_trends = [
            FinancialTrendRead(
                metric_code=trend.metric_code,
                label=trend.label,
                latest_value=trend.latest_value,
                points=[
                    FinancialTrendPointRead(fiscal_year=point.fiscal_year, value=point.value)
                    for point in trend.points
                ],
                coverage_status=trend.coverage_status,
                direction=trend.direction,
            )
            for trend in financial_trends_result
        ]

        valuation_context = await self._build_valuation_context(stock=stock, decision_support=decision_support)

        dividend_result = build_dividend_intelligence(
            dividend_events=dividend_events,
            market_events=market_events,
        )
        dividend_intelligence = (
            DividendIntelligenceRead(
                last_dividend_year=dividend_result.last_dividend_year,
                last_dividend_value=dividend_result.last_dividend_value,
            )
            if dividend_result
            else None
        )

        payload = StockWorkspaceRead(
            stock=stock_read,
            prices=[DailyPriceRead.model_validate(price) for price in prices],
            latest_trade_date=latest_trade_date,
            decision_support=decision_support,
            fundamentals_snapshot=fundamentals_snapshot,
            financial_trends=financial_trends,
            valuation_context=valuation_context,
            dividend_intelligence=dividend_intelligence,
        )
        await self._cache_set(cache_key, payload.model_dump(mode="json"))
        return payload

    async def _build_valuation_context(self, *, stock, decision_support) -> ValuationContextRead | None:
        sector = (stock.sector or "").strip()
        valuation = decision_support.valuation
        if not sector or valuation is None:
            return None

        peer_stocks = await self.repository.list_active_stocks_in_sector(
            exchange=stock.exchange,
            sector=sector,
            exclude_stock_id=stock.id,
        )
        if not peer_stocks:
            return None

        peer_snapshots = await self.repository.list_latest_valuation_snapshots_for_stocks(
            [peer.id for peer in peer_stocks]
        )
        peer_pe_values: list[float] = []
        peer_pb_values: list[float] = []
        for snapshot in peer_snapshots.values():
            if snapshot.pe_ratio is not None and float(snapshot.pe_ratio) > 0:
                peer_pe_values.append(float(snapshot.pe_ratio))
            if snapshot.pb_ratio is not None and float(snapshot.pb_ratio) > 0:
                peer_pb_values.append(float(snapshot.pb_ratio))

        stock_pe = valuation.pe_ratio if valuation.pe_ratio and valuation.pe_ratio > 0 else None
        stock_pb = valuation.pb_ratio if valuation.pb_ratio and valuation.pb_ratio > 0 else None
        context = build_valuation_context(
            stock_pe=stock_pe,
            stock_pb=stock_pb,
            peer_pe_values=peer_pe_values,
            peer_pb_values=peer_pb_values,
        )

        def to_read(metric) -> ValuationMetricContextRead:
            return ValuationMetricContextRead(
                metric_key=metric.metric_key,
                stock_value=metric.stock_value,
                sector_median=metric.sector_median,
                relative_label=metric.relative_label,
                peer_count=metric.peer_count,
                has_sufficient_peers=metric.has_sufficient_peers,
            )

        return ValuationContextRead(pe=to_read(context.pe), pb=to_read(context.pb))

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
