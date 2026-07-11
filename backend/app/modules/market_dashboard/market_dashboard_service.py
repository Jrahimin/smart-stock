from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated, TypeVar

from fastapi import Depends
from pydantic import BaseModel

from app.core.constants.trading_constants import (
    DASHBOARD_HEATMAP_LIMIT,
    DASHBOARD_MARKET_MOVERS_LIMIT,
)
from app.core.core_config import Settings, get_settings
from app.core.enums import ExchangeCode, TrendDirection
from app.jobs.market_session_schedule import current_cache_ttl_seconds
from app.core.perf_timing import PerfReport, async_perf_stage
from app.core.redis_client import OptionalRedisClient, get_redis_client
from app.models import DailyMarketSummary, DailyPrice, Stock
from app.modules.market_data.market_data_repository import MarketDataRepository, get_market_data_repository
from app.modules.market_data.market_data_schemas import DailyMarketSummaryRead
from app.modules.market_data.market_data_service import MarketDataService, get_market_data_service
from app.modules.market_data.market_mover_rules import is_eligible_session_mover
from app.modules.market_dashboard.market_dashboard_cache import dashboard_cache_key
from app.modules.market_dashboard.market_dashboard_compute import (
    build_heatmap_tiles,
    build_market_alerts_from_snapshot,
    build_market_insights,
    build_sector_snapshots_from_snapshot,
    derive_market_breadth_from_snapshot,
    derive_market_mood_from_snapshot,
)
from app.modules.market_dashboard.market_snapshot import (
    DashboardMarketSnapshot,
    load_dashboard_market_snapshot,
)
from app.modules.market_dashboard.market_dashboard_schemas import (
    DashboardHeatmapRead,
    DashboardHeatmapTileRead,
    DashboardInsightRead,
    DashboardMarketAlertsRead,
    DashboardMarketSentimentRead,
    DashboardMoverRead,
    DashboardMoversRead,
    DashboardOverviewRead,
    DashboardSectorRead,
    DashboardSectorsRead,
    DashboardStocksInFocusRead,
    DashboardTimelineItemRead,
    DashboardTopGainerRead,
)
from app.modules.stock_details.decision.technical import TechnicalSnapshot, build_technical_snapshot
from app.modules.stocks.stocks_repository import StocksRepository, get_stocks_repository

DASHBOARD_LATEST_PRICES_LIMIT = 5000

T = TypeVar("T", bound=BaseModel)


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


def _latest_summary(summaries: list[DailyMarketSummary]) -> DailyMarketSummary | None:
    filtered = [
        summary
        for summary in summaries
        if summary.index_name != "SOURCE_VALIDATION"
    ]
    if not filtered:
        return summaries[0] if summaries else None
    return max(filtered, key=lambda summary: summary.trade_date)


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
        self._last_compute_ms: float | None = None

    @property
    def last_compute_ms(self) -> float | None:
        return self._last_compute_ms

    async def _cache_get(self, cache_key: str) -> dict | None:
        return await self.redis.get_json(cache_key)

    async def _cache_set(self, cache_key: str, payload: dict) -> None:
        ttl_seconds = current_cache_ttl_seconds(self.settings)
        await self.redis.set_json(cache_key, payload, ttl_seconds=ttl_seconds)

    async def cache_dashboard_payload(self, section: str, exchange: ExchangeCode, payload: BaseModel) -> None:
        cache_key = dashboard_cache_key(section, exchange)
        await self._cache_set(cache_key, payload.model_dump(mode="json"))

    async def _get_cached(self, section: str, exchange: ExchangeCode, model: type[T], compute) -> T:
        cache_key = dashboard_cache_key(section, exchange)
        cached = await self._cache_get(cache_key)
        if cached is not None:
            return model.model_validate(cached)

        perf = PerfReport(f"dashboard.{section}")
        async with async_perf_stage(perf, "compute.total"):
            data = await compute(perf)
        perf.log_summary()
        self._last_compute_ms = perf.total_ms
        await self._cache_set(cache_key, data.model_dump(mode="json"))
        return data

    async def _load_snapshot(self, exchange: ExchangeCode, report: PerfReport | None = None) -> DashboardMarketSnapshot:
        return await load_dashboard_market_snapshot(
            self.market_repository,
            exchange=exchange,
            report=report,
        )

    async def get_overview(self, *, exchange: ExchangeCode) -> DashboardOverviewRead:
        cache_key = dashboard_cache_key("overview", exchange)
        cached = await self._cache_get(cache_key)

        if cached is not None:
            overview = DashboardOverviewRead.model_validate(cached)
            dsex_index = await self.market_data_service.get_dsex_index_snapshot(exchange=exchange)
            merged = overview.model_copy(update={"dsex_index": dsex_index})
            await self._cache_set(cache_key, merged.model_dump(mode="json"))
            return merged

        perf = PerfReport("dashboard.overview")
        async with async_perf_stage(perf, "compute.total"):
            data = await self.compute_overview(exchange, report=perf)
        perf.log_summary()
        self._last_compute_ms = perf.total_ms
        await self._cache_set(cache_key, data.model_dump(mode="json"))
        return data

    async def get_movers(self, *, exchange: ExchangeCode) -> DashboardMoversRead:
        return await self._get_cached(
            "movers",
            exchange,
            DashboardMoversRead,
            lambda perf: self.compute_movers(exchange, report=perf),
        )

    async def get_sectors(self, *, exchange: ExchangeCode) -> DashboardSectorsRead:
        return await self._get_cached(
            "sectors",
            exchange,
            DashboardSectorsRead,
            lambda perf: self.compute_sectors(exchange, report=perf),
        )

    async def get_market_alerts(self, *, exchange: ExchangeCode) -> DashboardMarketAlertsRead:
        return await self._get_cached(
            "market-alerts",
            exchange,
            DashboardMarketAlertsRead,
            lambda perf: self.compute_market_alerts(exchange, report=perf),
        )

    async def get_stocks_in_focus(self, *, exchange: ExchangeCode) -> DashboardStocksInFocusRead:
        """Legacy endpoint; terminal UI should use GET /signals/decisions/latest."""
        session_trade_date, _ = await self.market_repository.get_market_price_freshness(exchange=exchange)
        return DashboardStocksInFocusRead(
            session_trade_date=session_trade_date,
            evaluated_count=0,
            signals=[],
        )

    async def get_heatmap(self, *, exchange: ExchangeCode) -> DashboardHeatmapRead:
        return await self._get_cached(
            "heatmap",
            exchange,
            DashboardHeatmapRead,
            lambda perf: self.compute_heatmap(exchange, report=perf),
        )

    async def get_market_sentiment(self, *, exchange: ExchangeCode) -> DashboardMarketSentimentRead:
        return await self._get_cached(
            "market-sentiment",
            exchange,
            DashboardMarketSentimentRead,
            lambda perf: self.compute_market_sentiment(exchange, report=perf),
        )

    async def compute_overview(
        self,
        exchange: ExchangeCode,
        *,
        report: PerfReport | None = None,
    ) -> DashboardOverviewRead:
        perf = report or PerfReport("dashboard.overview")
        snapshot = await self._load_snapshot(exchange, perf)

        async with async_perf_stage(perf, "metrics.local"):
            listed_stock_count = await self.stocks_repository.count_stocks(exchange=exchange, is_active=True)

        async with async_perf_stage(perf, "metrics.dsex"):
            dsex_index = await self.market_data_service.get_dsex_index_snapshot(
                exchange=exchange,
                summaries=None,
                report=perf,
            )

        async with async_perf_stage(perf, "db.freshness"):
            _, last_synced_at = await self.market_repository.get_market_price_freshness(exchange=exchange)

        if report is None:
            perf.log_summary()
            self._last_compute_ms = perf.total_ms

        return DashboardOverviewRead(
            exchange=exchange,
            session_trade_date=snapshot.session_trade_date,
            last_synced_at=last_synced_at,
            listed_stock_count=listed_stock_count,
            dsex_index=dsex_index,
            summaries=[DailyMarketSummaryRead.model_validate(summary) for summary in snapshot.summaries],
        )

    async def compute_movers(
        self,
        exchange: ExchangeCode,
        *,
        report: PerfReport | None = None,
    ) -> DashboardMoversRead:
        perf = report or PerfReport("dashboard.movers")
        async with async_perf_stage(perf, "db.freshness"):
            session_trade_date, _ = await self.market_repository.get_market_price_freshness(exchange=exchange)
        async with async_perf_stage(perf, "db.latest_prices"):
            latest_rows = await self.market_repository.list_latest_daily_prices(
                exchange=exchange,
                limit=DASHBOARD_LATEST_PRICES_LIMIT,
                offset=0,
            )

        scored_rows: list[tuple[Stock, DailyPrice, TechnicalSnapshot]] = []
        async with async_perf_stage(perf, "compute.snapshot_rows"):
            for stock, price in latest_rows:
                snapshot = build_technical_snapshot([price])
                if snapshot is None:
                    continue
                scored_rows.append((stock, price, snapshot))

        if report is None:
            perf.log_summary()
            self._last_compute_ms = perf.total_ms

        return _build_movers_from_rows(scored_rows, session_trade_date=session_trade_date)

    async def compute_sectors(
        self,
        exchange: ExchangeCode,
        *,
        report: PerfReport | None = None,
    ) -> DashboardSectorsRead:
        perf = report or PerfReport("dashboard.sectors")
        snapshot = await self._load_snapshot(exchange, perf)

        async with async_perf_stage(perf, "compute.sectors_agg"):
            sectors, top_gainer = build_sector_snapshots_from_snapshot(
                snapshot.rows,
                session_trade_date=snapshot.session_trade_date,
            )

        if report is None:
            perf.log_summary()
            self._last_compute_ms = perf.total_ms

        return DashboardSectorsRead(
            session_trade_date=snapshot.session_trade_date,
            sectors=[DashboardSectorRead.model_validate(sector) for sector in sectors],
            top_gainer=DashboardTopGainerRead.model_validate(top_gainer) if top_gainer else None,
        )

    async def compute_market_alerts(
        self,
        exchange: ExchangeCode,
        *,
        report: PerfReport | None = None,
    ) -> DashboardMarketAlertsRead:
        perf = report or PerfReport("dashboard.market-alerts")
        snapshot = await self._load_snapshot(exchange, perf)
        latest_summary = _latest_summary(snapshot.summaries)

        async with async_perf_stage(perf, "compute.alerts"):
            items = build_market_alerts_from_snapshot(
                snapshot.rows,
                latest_summary=latest_summary,
                session_trade_date=snapshot.session_trade_date,
            )

        if report is None:
            perf.log_summary()
            self._last_compute_ms = perf.total_ms

        return DashboardMarketAlertsRead(
            session_trade_date=snapshot.session_trade_date,
            items=[DashboardTimelineItemRead.model_validate(item) for item in items],
        )

    async def compute_heatmap(
        self,
        exchange: ExchangeCode,
        *,
        report: PerfReport | None = None,
    ) -> DashboardHeatmapRead:
        perf = report or PerfReport("dashboard.heatmap")
        async with async_perf_stage(perf, "db.freshness"):
            session_trade_date, _ = await self.market_repository.get_market_price_freshness(exchange=exchange)
        async with async_perf_stage(perf, "db.latest_prices"):
            latest_rows = await self.market_repository.list_latest_daily_prices(
                exchange=exchange,
                limit=DASHBOARD_HEATMAP_LIMIT,
                offset=0,
            )

        heatmap_rows: list[tuple[Stock, TechnicalSnapshot]] = []
        async with async_perf_stage(perf, "compute.heatmap"):
            for stock, price in latest_rows:
                snapshot = build_technical_snapshot([price])
                if snapshot is None:
                    continue
                heatmap_rows.append((stock, snapshot))

            tiles = build_heatmap_tiles(heatmap_rows)

        if report is None:
            perf.log_summary()
            self._last_compute_ms = perf.total_ms

        return DashboardHeatmapRead(
            session_trade_date=session_trade_date,
            tiles=[DashboardHeatmapTileRead.model_validate(tile) for tile in tiles],
        )

    async def compute_market_sentiment(
        self,
        exchange: ExchangeCode,
        *,
        report: PerfReport | None = None,
    ) -> DashboardMarketSentimentRead:
        perf = report or PerfReport("dashboard.market-sentiment")
        snapshot = await self._load_snapshot(exchange, perf)
        latest_summary = _latest_summary(snapshot.summaries)

        async with async_perf_stage(perf, "metrics.dsex"):
            dsex_index = await self.market_data_service.get_dsex_index_snapshot(
                exchange=exchange,
                summaries=None,
                report=perf,
            )

        advancing, declining, unchanged, _ = derive_market_breadth_from_snapshot(snapshot.rows)
        if dsex_index.advancing_issues + dsex_index.declining_issues + dsex_index.unchanged_issues > 0:
            advancing = dsex_index.advancing_issues
            declining = dsex_index.declining_issues
            unchanged = dsex_index.unchanged_issues

        async with async_perf_stage(perf, "compute.sentiment"):
            market_mood = derive_market_mood_from_snapshot(
                snapshot.rows,
                advancing=advancing,
                declining=declining,
            )

            turnover_value = dsex_index.total_turnover
            if turnover_value is None and latest_summary is not None:
                turnover_value = latest_summary.total_turnover
            if turnover_value is None:
                turnover_value = Decimal(
                    str(sum((row.technical.turnover or 0) for row in snapshot.rows)),
                )

            turnover_label = "N/A" if turnover_value is None else str(turnover_value)
            has_partial_data = (
                latest_summary is not None
                and latest_summary.data_quality_flag.value != "OK"
                and latest_summary.index_name == "SOURCE_VALIDATION"
            )

            insights = build_market_insights(
                market_mood=market_mood,
                has_partial_data=has_partial_data,
                signal_count=0,
                turnover_label=turnover_label,
            )

        if report is None:
            perf.log_summary()
            self._last_compute_ms = perf.total_ms

        return DashboardMarketSentimentRead(
            exchange=exchange,
            session_trade_date=snapshot.session_trade_date,
            market_mood=market_mood,
            signal_count=0,
            price_backed_count=len(snapshot.rows),
            turnover_value=turnover_value,
            has_partial_data=has_partial_data,
            insights=[DashboardInsightRead.model_validate(insight) for insight in insights],
        )


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
