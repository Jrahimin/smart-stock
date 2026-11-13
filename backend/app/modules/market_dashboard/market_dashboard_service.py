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
from app.core.enums import DataQualityFlag, ExchangeCode, MarketDataState, TrendDirection
from app.core.perf_timing import PerfReport, async_perf_stage
from app.core.redis_client import OptionalRedisClient, get_redis_client
from app.jobs.market_session_schedule import current_cache_ttl_seconds
from app.models import DailyMarketSummary, DailyPrice, Stock
from app.modules.market_dashboard.market_dashboard_cache import dashboard_cache_key
from app.modules.market_dashboard.market_dashboard_compute import (
    build_heatmap_sectors,
    build_heatmap_tiles,
    build_market_alerts_from_snapshot,
    build_market_insights,
    derive_market_breadth_from_snapshot,
    derive_market_mood_from_snapshot,
    measured_market_interpretation,
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
    DashboardSectorsRead,
    DashboardStocksInFocusRead,
    DashboardTimelineItemRead,
)
from app.modules.market_dashboard.market_snapshot import (
    DashboardMarketSnapshot,
    dated_breadth_changes,
    load_dashboard_market_snapshot,
)
from app.modules.market_data.market_data_repository import (
    MarketDataRepository,
    get_market_data_repository,
)
from app.modules.market_data.market_data_schemas import DailyMarketSummaryRead, MarketFreshnessRead
from app.modules.market_data.market_data_service import MarketDataService, get_market_data_service
from app.modules.market_data.market_mover_rules import is_eligible_session_mover
from app.modules.stock_details.decision.technical import TechnicalSnapshot, build_technical_snapshot
from app.modules.stocks.stocks_repository import StocksRepository, get_stocks_repository
from app.modules.trading_intelligence.decision_snapshot_repository import (
    DecisionSnapshotRepository,
    get_decision_snapshot_repository,
)

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
        decision_snapshot_repository: DecisionSnapshotRepository | None = None,
    ) -> None:
        self.market_repository = market_repository
        self.market_data_service = market_data_service
        self.stocks_repository = stocks_repository
        self.redis = redis
        self.settings = settings
        self.decision_snapshot_repository = decision_snapshot_repository
        self._last_compute_ms: float | None = None

    @property
    def last_compute_ms(self) -> float | None:
        return self._last_compute_ms

    async def _cache_get(self, cache_key: str) -> dict | None:
        return await self.redis.get_json(cache_key)

    async def _cache_set(self, cache_key: str, payload: dict) -> None:
        ttl_seconds = current_cache_ttl_seconds(self.settings)
        await self.redis.set_json(cache_key, payload, ttl_seconds=ttl_seconds)

    async def cache_dashboard_payload(
        self,
        section: str,
        exchange: ExchangeCode,
        payload: BaseModel,
        *,
        market_sync_id: str | None = None,
    ) -> None:
        if market_sync_id is None:
            freshness = await self.market_data_service.get_market_freshness(exchange=exchange)
            market_sync_id = freshness.market_sync_id
        if market_sync_id is not None:
            payload = payload.model_copy(update={"market_sync_id": market_sync_id})
        cache_key = dashboard_cache_key(section, exchange, market_sync_id)
        await self._cache_set(cache_key, payload.model_dump(mode="json"))

    @staticmethod
    def _same_generation(before: MarketFreshnessRead, after: MarketFreshnessRead) -> bool:
        before_id = before.market_sync_id or before.last_synced_at
        after_id = after.market_sync_id or after.last_synced_at
        return before_id is not None and before_id == after_id

    async def _get_cached(self, section: str, exchange: ExchangeCode, model: type[T], compute) -> T:
        """Serve or compute one dashboard response fenced to one publication id."""

        for _ in range(2):
            freshness = await self.market_data_service.get_market_freshness(exchange=exchange)
            cache_key = dashboard_cache_key(section, exchange, freshness.market_sync_id)
            cached = await self._cache_get(cache_key)
            # This section gained measured interpretation without changing the
            # quote generation. Upgrade just this old cached projection on read.
            if section == "market-sentiment" and cached is not None and not cached.get("interpretation"):
                cached = None
            if cached is not None:
                data = model.model_validate(cached)
                after = await self.market_data_service.get_market_freshness(exchange=exchange)
                if self._same_generation(freshness, after):
                    return data.model_copy(update={"market_status": after.market_status.value}) if "market_status" in model.model_fields else data
                continue

            perf = PerfReport(f"dashboard.{section}")
            async with async_perf_stage(perf, "compute.total"):
                data = await compute(perf, freshness)
            after = await self.market_data_service.get_market_freshness(exchange=exchange)
            if not self._same_generation(freshness, after):
                continue
            data = data.model_copy(update={"market_sync_id": freshness.market_sync_id, **({"market_status": after.market_status.value} if "market_status" in model.model_fields else {})})
            perf.log_summary()
            self._last_compute_ms = perf.total_ms
            await self._cache_set(cache_key, data.model_dump(mode="json"))
            return data
        raise RuntimeError(f"Published market generation changed while loading dashboard {section}")

    async def _load_snapshot(
        self,
        exchange: ExchangeCode,
        report: PerfReport | None = None,
        freshness: MarketFreshnessRead | None = None,
    ) -> DashboardMarketSnapshot:
        if freshness is None:
            freshness = await self.market_data_service.get_market_freshness(exchange=exchange)
        return await load_dashboard_market_snapshot(
            self.market_repository,
            exchange=exchange,
            session_trade_date=freshness.trade_date,
            report=report,
        )

    async def get_overview(self, *, exchange: ExchangeCode) -> DashboardOverviewRead:
        return await self._get_cached(
            "overview",
            exchange,
            DashboardOverviewRead,
            lambda perf, freshness: self.compute_overview(
                exchange,
                report=perf,
                freshness=freshness,
            ),
        )

    async def get_movers(self, *, exchange: ExchangeCode) -> DashboardMoversRead:
        return await self._get_cached(
            "movers",
            exchange,
            DashboardMoversRead,
            lambda perf, freshness: self.compute_movers(exchange, report=perf, freshness=freshness),
        )

    async def get_sectors(self, *, exchange: ExchangeCode) -> DashboardSectorsRead:
        # The compact publication projection is its own generation-keyed cache.
        # Do not load the exchange-wide result on a normal warm dashboard read.
        for _ in range(2):
            before = await self.market_data_service.get_market_freshness(exchange=exchange)
            data = await self.compute_sectors(exchange, freshness=before)
            after = await self.market_data_service.get_market_freshness(exchange=exchange)
            if (not self._same_generation(before, after)
                or before.decision_generation_id != after.decision_generation_id
                or before.decision_status != after.decision_status
                or data.decision_generation_id is not None and data.decision_generation_id != after.decision_generation_id):
                continue
            return data.model_copy(update={"market_sync_id": after.market_sync_id})
        raise RuntimeError("Published market generation changed while loading dashboard sectors")

    async def _project_session_leaders(self, payload, *, exchange):
        from app.modules.market_data.published_session_leadership import (
            build_published_session_leadership,
            leadership_cache_key,
        )
        from app.modules.market_universe.market_universe_schemas import ScoredUniverseCacheRead
        empty = payload.model_copy(update={"sectors": [], "top_gainer": None,
            "decision_generation_id": None, "decision_session_date": None,
            "excluded_sector_count": 0, "leadership_status": "UNAVAILABLE"})
        repository = self.decision_snapshot_repository
        if repository is None:
            return empty
        publication = await repository.latest_publication(exchange=exchange, metadata_only=True)
        if publication is None or publication.invalidated_at:
            return empty
        # Cheap manifest identity check: no historical input fingerprint on the
        # lightweight dashboard read path. Corrections publish a new manifest.
        reader = getattr(self.market_repository, "get_latest_market_data_generation", None)
        manifest = await reader(exchange=exchange, state=MarketDataState.FINALIZED) if reader else None
        if manifest is not None and (manifest.trade_date != publication.session_date
            or not (publication.generation_id == manifest.sync_id or publication.generation_id.startswith(manifest.sync_id + ":"))):
            return empty
        key = leadership_cache_key(exchange, publication.generation_id)
        compact = await self.redis.get_json(key)
        if compact is None:
            winner = await repository.get_publication(exchange=exchange, generation_id=publication.generation_id)
            if winner is None or winner.invalidated_at:
                return empty
            canonical = ScoredUniverseCacheRead.model_validate(winner.result_payload)
            if canonical.market_sync_id != publication.generation_id or canonical.session_trade_date != publication.session_date:
                return empty
            compact = build_published_session_leadership(canonical)
            await self.redis.set_json(key, compact, ttl_seconds=28800)
        if compact.get("decision_generation_id") != publication.generation_id:
            return empty
        after = await repository.latest_publication(exchange=exchange, metadata_only=True)
        if after is None or after.invalidated_at or after.generation_id != publication.generation_id:
            return empty
        return DashboardSectorsRead.model_validate({**payload.model_dump(), **compact})

    async def get_market_alerts(self, *, exchange: ExchangeCode) -> DashboardMarketAlertsRead:
        return await self._get_cached(
            "market-alerts",
            exchange,
            DashboardMarketAlertsRead,
            lambda perf, freshness: self.compute_market_alerts(
                exchange, report=perf, freshness=freshness
            ),
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
            lambda perf, freshness: self.compute_heatmap(exchange, report=perf, freshness=freshness),
        )

    async def get_market_sentiment(self, *, exchange: ExchangeCode) -> DashboardMarketSentimentRead:
        return await self._get_cached(
            "market-sentiment",
            exchange,
            DashboardMarketSentimentRead,
            lambda perf, freshness: self.compute_market_sentiment(
                exchange, report=perf, freshness=freshness
            ),
        )

    async def compute_overview(
        self,
        exchange: ExchangeCode,
        *,
        report: PerfReport | None = None,
        freshness: MarketFreshnessRead | None = None,
    ) -> DashboardOverviewRead:
        perf = report or PerfReport("dashboard.overview")
        if freshness is None:
            freshness = await self.market_data_service.get_market_freshness(exchange=exchange)
        snapshot = await self._load_snapshot(exchange, perf, freshness)

        async with async_perf_stage(perf, "metrics.local"):
            listed_stock_count = await self.stocks_repository.count_stocks(exchange=exchange, is_active=True)

        async with async_perf_stage(perf, "metrics.dsex"):
            dsex_index = await self.market_data_service.get_dsex_index_snapshot(
                exchange=exchange,
                summaries=snapshot.summaries,
                report=perf,
                end_date=freshness.trade_date,
            )

        if report is None:
            perf.log_summary()
            self._last_compute_ms = perf.total_ms

        from app.modules.market_data.breadth import breadth_facts
        return DashboardOverviewRead(
            market_status=freshness.market_status.value,
            breadth=breadth_facts(dated_breadth_changes(snapshot.rows, snapshot.session_trade_date), cohort="ACTIVE_VALID_OHLC", as_of_date=snapshot.session_trade_date),
            exchange=exchange,
            session_trade_date=snapshot.session_trade_date,
            last_synced_at=freshness.last_synced_at,
            listed_stock_count=listed_stock_count,
            dsex_index=dsex_index,
            summaries=[DailyMarketSummaryRead.model_validate(summary) for summary in snapshot.summaries],
        )

    async def compute_movers(
        self,
        exchange: ExchangeCode,
        *,
        report: PerfReport | None = None,
        freshness: MarketFreshnessRead | None = None,
    ) -> DashboardMoversRead:
        perf = report or PerfReport("dashboard.movers")
        if freshness is None:
            freshness = await self.market_data_service.get_market_freshness(exchange=exchange)
        session_trade_date = freshness.trade_date
        async with async_perf_stage(perf, "db.latest_prices"):
            latest_rows = await self.market_repository.list_latest_daily_prices(
                exchange=exchange,
                limit=DASHBOARD_LATEST_PRICES_LIMIT,
                offset=0,
                end_date=session_trade_date,
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
        freshness: MarketFreshnessRead | None = None,
    ) -> DashboardSectorsRead:
        perf = report or PerfReport("dashboard.sectors")
        if freshness is None:
            freshness = await self.market_data_service.get_market_freshness(exchange=exchange)
        async with async_perf_stage(perf, "compute.eligible_session_leaders"):
            payload = await self._project_session_leaders(
                DashboardSectorsRead(session_trade_date=freshness.trade_date), exchange=exchange,
            )
        if report is None:
            perf.log_summary()
            self._last_compute_ms = perf.total_ms
        return payload

    async def compute_market_alerts(
        self,
        exchange: ExchangeCode,
        *,
        report: PerfReport | None = None,
        freshness: MarketFreshnessRead | None = None,
    ) -> DashboardMarketAlertsRead:
        perf = report or PerfReport("dashboard.market-alerts")
        if freshness is None:
            freshness = await self.market_data_service.get_market_freshness(exchange=exchange)
        snapshot = await self._load_snapshot(exchange, perf, freshness)
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
        freshness: MarketFreshnessRead | None = None,
    ) -> DashboardHeatmapRead:
        perf = report or PerfReport("dashboard.heatmap")
        if freshness is None:
            freshness = await self.market_data_service.get_market_freshness(exchange=exchange)
        session_trade_date = freshness.trade_date
        async with async_perf_stage(perf, "db.latest_prices"):
            latest_rows = await self.market_repository.list_latest_daily_prices(
                exchange=exchange,
                limit=DASHBOARD_HEATMAP_LIMIT,
                offset=0,
                end_date=session_trade_date,
            )

        heatmap_rows: list[tuple[Stock, TechnicalSnapshot]] = []
        async with async_perf_stage(perf, "compute.heatmap"):
            for stock, price in latest_rows:
                snapshot = build_technical_snapshot([price])
                if snapshot is None:
                    continue
                heatmap_rows.append((stock, snapshot))

            tiles = build_heatmap_tiles(heatmap_rows, session_trade_date=session_trade_date)

        if report is None:
            perf.log_summary()
            self._last_compute_ms = perf.total_ms

        return DashboardHeatmapRead(
            session_trade_date=session_trade_date,
            tiles=[DashboardHeatmapTileRead.model_validate(tile) for tile in tiles],
            sectors=build_heatmap_sectors(tiles),
        )

    async def compute_market_sentiment(
        self,
        exchange: ExchangeCode,
        *,
        report: PerfReport | None = None,
        freshness: MarketFreshnessRead | None = None,
    ) -> DashboardMarketSentimentRead:
        perf = report or PerfReport("dashboard.market-sentiment")
        if freshness is None:
            freshness = await self.market_data_service.get_market_freshness(exchange=exchange)
        snapshot = await self._load_snapshot(exchange, perf, freshness)
        latest_summary = _latest_summary(snapshot.summaries)

        # Use recorded session facts directly. The overview's display DTO can
        # substitute zero for an unknown index change and load horizon metrics;
        # neither is evidence for this lightweight interpretation.
        dsex_index = next((row for row in snapshot.summaries
            if row.index_name == "DSEX" and row.trade_date == snapshot.session_trade_date
            and row.data_quality_flag != DataQualityFlag.SUSPICIOUS), None)

        advancing, declining, unchanged, _ = derive_market_breadth_from_snapshot(snapshot.rows, snapshot.session_trade_date)

        async with async_perf_stage(perf, "compute.sentiment"):
            market_mood = derive_market_mood_from_snapshot(
                snapshot.rows,
                advancing=advancing,
                declining=declining,
            )

            turnover_value = dsex_index.total_turnover if dsex_index is not None else None
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

        from app.modules.market_data.breadth import breadth_facts
        facts = breadth_facts(dated_breadth_changes(snapshot.rows, snapshot.session_trade_date), cohort="ACTIVE_VALID_OHLC", as_of_date=snapshot.session_trade_date)
        return DashboardMarketSentimentRead(
            interpretation=measured_market_interpretation(breadth=facts, index=dsex_index, summaries=snapshot.summaries, session_date=snapshot.session_trade_date),
            market_status=freshness.market_status.value,
            breadth=breadth_facts(dated_breadth_changes(snapshot.rows, snapshot.session_trade_date), cohort="ACTIVE_VALID_OHLC", as_of_date=snapshot.session_trade_date),
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
    decision_snapshot_repository: Annotated[DecisionSnapshotRepository, Depends(get_decision_snapshot_repository)],
) -> MarketDashboardService:
    return MarketDashboardService(
        market_repository,
        market_data_service,
        stocks_repository,
        redis,
        settings,
        decision_snapshot_repository,
    )
