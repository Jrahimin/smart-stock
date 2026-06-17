from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated, TypeVar

from fastapi import Depends
from pydantic import BaseModel

from app.core.constants.trading_constants import (
    DASHBOARD_HEATMAP_LIMIT,
    DASHBOARD_MARKET_MOVERS_LIMIT,
    DASHBOARD_OVERVIEW_SUMMARIES_LIMIT,
)
from app.core.core_config import Settings, get_settings
from app.core.enums import ExchangeCode, TraderRecommendation, TrendDirection
from app.core.redis_client import OptionalRedisClient, get_redis_client
from app.models import DailyMarketSummary, DailyPrice, Stock
from app.modules.market_data.market_data_repository import MarketDataRepository, get_market_data_repository
from app.modules.market_data.market_data_schemas import DailyMarketSummaryRead
from app.modules.market_data.market_data_service import MarketDataService, get_market_data_service
from app.modules.market_data.market_mover_rules import is_eligible_session_mover
from app.modules.market_dashboard.market_dashboard_cache import dashboard_cache_key
from app.core.market_cache import DASHBOARD_CACHE_KEY_NAMES
from app.modules.market_dashboard.market_dashboard_compute import (
    build_heatmap_tiles,
    build_market_alerts,
    build_market_insights,
    build_sector_snapshots,
    build_signal_feed,
    derive_market_breadth,
    derive_market_mood,
)
from app.modules.market_universe.market_universe_schemas import ScoredUniverseRow
from app.modules.market_universe.market_universe_service import MarketUniverseService, get_market_universe_service
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
    DashboardSignalRead,
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
        universe_service: MarketUniverseService,
        redis: OptionalRedisClient,
        settings: Settings,
    ) -> None:
        self.market_repository = market_repository
        self.market_data_service = market_data_service
        self.stocks_repository = stocks_repository
        self.universe_service = universe_service
        self.redis = redis
        self.settings = settings

    @property
    def cache_ttl_seconds(self) -> int:
        return self.settings.market_dashboard_cache_ttl_seconds

    async def _cache_get(self, cache_key: str) -> dict | None:
        return await self.redis.get_json(cache_key)

    async def _cache_set(self, cache_key: str, payload: dict) -> None:
        await self.redis.set_json(cache_key, payload, ttl_seconds=self.cache_ttl_seconds)

    async def _get_cached(self, section: str, exchange: ExchangeCode, model: type[T], compute) -> T:
        cache_key = dashboard_cache_key(section, exchange)
        cached = await self._cache_get(cache_key)
        if cached is not None:
            return model.model_validate(cached)

        data = await compute()
        await self._cache_set(cache_key, data.model_dump(mode="json"))
        return data

    async def get_overview(self, *, exchange: ExchangeCode) -> DashboardOverviewRead:
        return await self._get_cached("overview", exchange, DashboardOverviewRead, lambda: self._compute_overview(exchange))

    async def get_movers(self, *, exchange: ExchangeCode) -> DashboardMoversRead:
        return await self._get_cached("movers", exchange, DashboardMoversRead, lambda: self._compute_movers(exchange))

    async def get_sectors(self, *, exchange: ExchangeCode) -> DashboardSectorsRead:
        return await self._get_cached("sectors", exchange, DashboardSectorsRead, lambda: self._compute_sectors(exchange))

    async def get_market_alerts(self, *, exchange: ExchangeCode) -> DashboardMarketAlertsRead:
        return await self._get_cached(
            "market-alerts",
            exchange,
            DashboardMarketAlertsRead,
            lambda: self._compute_market_alerts(exchange),
        )

    async def get_stocks_in_focus(self, *, exchange: ExchangeCode) -> DashboardStocksInFocusRead:
        return await self._get_cached(
            "stocks-in-focus",
            exchange,
            DashboardStocksInFocusRead,
            lambda: self._compute_stocks_in_focus(exchange),
        )

    async def get_heatmap(self, *, exchange: ExchangeCode) -> DashboardHeatmapRead:
        return await self._get_cached("heatmap", exchange, DashboardHeatmapRead, lambda: self._compute_heatmap(exchange))

    async def get_market_sentiment(self, *, exchange: ExchangeCode) -> DashboardMarketSentimentRead:
        return await self._get_cached(
            "market-sentiment",
            exchange,
            DashboardMarketSentimentRead,
            lambda: self._compute_market_sentiment(exchange),
        )

    async def _load_scored_rows(self, exchange: ExchangeCode) -> tuple[date | None, list[ScoredUniverseRow]]:
        session_trade_date, _ = await self.market_repository.get_market_price_freshness(exchange=exchange)
        scored_rows = await self.universe_service.get_scored_universe(exchange=exchange)
        return session_trade_date, scored_rows

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

    async def _compute_sectors(self, exchange: ExchangeCode) -> DashboardSectorsRead:
        session_trade_date, scored_rows = await self._load_scored_rows(exchange)
        sectors, top_gainer = build_sector_snapshots(scored_rows, session_trade_date=session_trade_date)
        return DashboardSectorsRead(
            session_trade_date=session_trade_date,
            sectors=[DashboardSectorRead.model_validate(sector) for sector in sectors],
            top_gainer=DashboardTopGainerRead.model_validate(top_gainer) if top_gainer else None,
        )

    async def _compute_market_alerts(self, exchange: ExchangeCode) -> DashboardMarketAlertsRead:
        session_trade_date, scored_rows = await self._load_scored_rows(exchange)
        summaries = await self.market_repository.list_daily_market_summaries(
            exchange=exchange,
            limit=DASHBOARD_OVERVIEW_SUMMARIES_LIMIT,
            offset=0,
        )
        latest_summary = _latest_summary(summaries)
        items = build_market_alerts(
            scored_rows,
            latest_summary=latest_summary,
            session_trade_date=session_trade_date,
        )
        return DashboardMarketAlertsRead(
            session_trade_date=session_trade_date,
            items=[DashboardTimelineItemRead.model_validate(item) for item in items],
        )

    async def _compute_stocks_in_focus(self, exchange: ExchangeCode) -> DashboardStocksInFocusRead:
        session_trade_date, scored_rows = await self._load_scored_rows(exchange)
        signals = build_signal_feed(scored_rows)
        return DashboardStocksInFocusRead(
            session_trade_date=session_trade_date,
            evaluated_count=len(scored_rows),
            signals=[DashboardSignalRead.model_validate(signal) for signal in signals],
        )

    async def _compute_heatmap(self, exchange: ExchangeCode) -> DashboardHeatmapRead:
        session_trade_date, _ = await self.market_repository.get_market_price_freshness(exchange=exchange)
        latest_rows = await self.market_repository.list_latest_daily_prices(
            exchange=exchange,
            limit=DASHBOARD_HEATMAP_LIMIT,
            offset=0,
        )
        heatmap_rows: list[tuple[Stock, TechnicalSnapshot]] = []
        for stock, price in latest_rows:
            snapshot = build_technical_snapshot([price])
            if snapshot is None:
                continue
            heatmap_rows.append((stock, snapshot))

        tiles = build_heatmap_tiles(heatmap_rows)
        return DashboardHeatmapRead(
            session_trade_date=session_trade_date,
            tiles=[DashboardHeatmapTileRead.model_validate(tile) for tile in tiles],
        )

    async def _compute_market_sentiment(self, exchange: ExchangeCode) -> DashboardMarketSentimentRead:
        session_trade_date, scored_rows = await self._load_scored_rows(exchange)
        summaries = await self.market_repository.list_daily_market_summaries(
            exchange=exchange,
            limit=DASHBOARD_OVERVIEW_SUMMARIES_LIMIT,
            offset=0,
        )
        latest_summary = _latest_summary(summaries)
        dsex_index = await self.market_data_service.get_dsex_index_snapshot(exchange=exchange)

        advancing, declining, unchanged, total = derive_market_breadth(scored_rows)
        if dsex_index.advancing_issues + dsex_index.declining_issues + dsex_index.unchanged_issues > 0:
            advancing = dsex_index.advancing_issues
            declining = dsex_index.declining_issues

        market_mood = derive_market_mood(scored_rows, advancing=advancing, declining=declining)
        signal_count = sum(
            1
            for row in scored_rows
            if row.decision is not None
            and row.decision.recommendation in {TraderRecommendation.BUY, TraderRecommendation.SELL}
        )

        turnover_value = dsex_index.total_turnover
        if turnover_value is None and latest_summary is not None:
            turnover_value = latest_summary.total_turnover
        if turnover_value is None:
            turnover_value = Decimal(
                str(sum((row.technical_snapshot.turnover or 0) for row in scored_rows)),
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
            signal_count=signal_count,
            turnover_label=turnover_label,
        )

        return DashboardMarketSentimentRead(
            exchange=exchange,
            session_trade_date=session_trade_date,
            market_mood=market_mood,
            signal_count=signal_count,
            price_backed_count=len(scored_rows),
            turnover_value=turnover_value,
            has_partial_data=has_partial_data,
            insights=[DashboardInsightRead.model_validate(insight) for insight in insights],
        )


def get_market_dashboard_service(
    market_repository: Annotated[MarketDataRepository, Depends(get_market_data_repository)],
    market_data_service: Annotated[MarketDataService, Depends(get_market_data_service)],
    stocks_repository: Annotated[StocksRepository, Depends(get_stocks_repository)],
    universe_service: Annotated[MarketUniverseService, Depends(get_market_universe_service)],
    redis: Annotated[OptionalRedisClient, Depends(get_redis_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> MarketDashboardService:
    return MarketDashboardService(
        market_repository,
        market_data_service,
        stocks_repository,
        universe_service,
        redis,
        settings,
    )
