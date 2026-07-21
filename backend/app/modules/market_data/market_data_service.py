import asyncio
import logging
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import Depends

from app.api.dependencies.auth_dependencies import get_current_user_context
from app.core.core_config import get_settings
from app.core.enums import DataQualityFlag, ExchangeCode, MarketDataState, TurnoverProvenance
from app.core.exception_handlers import NotFoundError
from app.core.perf_timing import PerfReport, async_perf_stage
from app.core.security_config import UserContext
from app.jobs.ingestion.amarstock_daily_enrichment import (
    PostDailyAmarstockStats,
    run_daily_news_enrichment,
    run_snapshot_market_enrichment,
)
from app.jobs.ingestion.amarstock_index_api_source import AmarStockIndexApiSource
from app.jobs.ingestion.ingestion_source_base import IngestedDailyPrice, MarketDataSource
from app.jobs.market_cache_spawn import spawn_rebuild_market_read_cache
from app.jobs.market_session_schedule import (
    build_freshness_label,
    next_snapshot_sync_at,
    resolve_cache_ttl_seconds,
    resolve_market_status,
)
from app.models import DailyMarketSummary, DailyPrice, Stock
from app.modules.market_data.dsex_metrics import build_dsex_performance_snapshot
from app.modules.market_data.market_data_repository import (
    MarketDataRepository,
    get_market_data_repository,
)
from app.modules.market_data.market_data_schemas import (
    DailyMarketSummaryCreate,
    DailyPriceCreate,
    DailyPriceIngestionResult,
    DsexIndexSnapshotRead,
    MarketFreshnessRead,
)

logger = logging.getLogger(__name__)

LTP_VALIDATION_THRESHOLD_PERCENT = Decimal("1") # 1%
SOURCE_VALIDATION_SUMMARY_INDEX = "SOURCE_VALIDATION"
DSEX_SUMMARY_INDEX = "DSEX"
TRADING_DAYS_1M = 21
TRADING_DAYS_6M = 126
TRADING_DAYS_1Y = 252


class MarketDataService:
    def __init__(self, repository: MarketDataRepository, user_context: UserContext) -> None:
        self.repository = repository
        self.user_context = user_context

    async def list_daily_prices(
        self,
        *,
        stock_id: UUID,
        start_date: date | None,
        end_date: date | None,
        data_quality_flag: DataQualityFlag | None,
        source: str | None,
        limit: int,
        offset: int,
    ) -> list[DailyPrice]:
        await self._ensure_stock_exists(stock_id)
        return await self.repository.list_daily_prices_filtered(
            stock_id=stock_id,
            start_date=start_date,
            end_date=end_date,
            data_quality_flag=data_quality_flag,
            source=source,
            limit=limit,
            offset=offset,
        )

    async def list_latest_daily_prices(
        self,
        *,
        exchange: ExchangeCode | None,
        limit: int,
        offset: int,
    ) -> list[tuple[Stock, DailyPrice]]:
        return await self.repository.list_latest_daily_prices(
            exchange=exchange,
            limit=limit,
            offset=offset,
        )

    async def list_market_price_windows(
        self,
        *,
        exchange: ExchangeCode | None,
        limit: int,
        offset: int,
        price_window_limit: int,
    ) -> list[tuple[Stock, DailyPrice]]:
        return await self.repository.list_market_price_windows(
            exchange=exchange,
            limit=limit,
            offset=offset,
            price_window_limit=price_window_limit,
        )

    async def find_daily_price(self, price_data: DailyPriceCreate) -> DailyPrice | None:
        return await self.repository.get_daily_price_by_stock_date(
            stock_id=price_data.stock_id,
            trade_date=price_data.trade_date,
        )

    async def create_daily_price(self, price_data: DailyPriceCreate) -> DailyPrice:
        stock = await self.repository.get_stock_by_id(price_data.stock_id)
        if stock is None:
            raise NotFoundError("Stock was not found")
        prepared_values = await self._prepare_daily_price_values(price_data)
        daily_price = await self.repository.create(prepared_values)
        await self.repository.commit()
        await self.repository.refresh(daily_price)
        spawn_rebuild_market_read_cache(stock.exchange)
        return daily_price

    async def ingest_daily_prices(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date,
        source: MarketDataSource,
        validation_source: MarketDataSource | None = None,
        insert_only: bool = False,
        invalidate_market_cache: bool = True,
        commit: bool = True,
    ) -> DailyPriceIngestionResult:
        ingested_prices, validation_prices = await self._fetch_ingestion_prices(
            source=source,
            validation_source=validation_source,
            trade_date=trade_date,
        )
        if not ingested_prices:
            logger.warning(
                "No market data parsed; skipping daily price write: exchange=%s trade_date=%s source=%s",
                exchange,
                trade_date,
                source.source_name,
            )
            result = DailyPriceIngestionResult(
                exchange=exchange,
                trade_date=trade_date,
                source=source.source_name,
                fetched_count=0,
                created_count=0,
                skipped_existing_count=0,
                skipped_unknown_symbol_count=0,
                suspicious_count=0,
            )
            if invalidate_market_cache:
                spawn_rebuild_market_read_cache(exchange)
            return result

        suspicious_count = self._apply_close_price_validation(
            primary_prices=ingested_prices,
            validation_prices=validation_prices,
            validation_source_name=validation_source.source_name if validation_source is not None else None,
        )
        stock_by_symbol = await self.repository.get_stocks_by_symbols(
            exchange=exchange,
            symbols={self._normalize_symbol(price.symbol) for price in ingested_prices},
        )

        upserted_count = 0
        skipped_existing_count = 0
        skipped_unknown_symbol_count = 0

        for ingested_price in ingested_prices:
            stock = stock_by_symbol.get(self._normalize_symbol(ingested_price.symbol))
            if stock is None:
                skipped_unknown_symbol_count += 1
                continue

            price_data = self._build_daily_price_create(stock.id, ingested_price)
            prepared_values = await self._prepare_daily_price_values(price_data)
            if insert_only:
                inserted = await self.repository.insert_daily_price_if_absent(prepared_values)
                if inserted is None:
                    skipped_existing_count += 1
                else:
                    upserted_count += 1
            else:
                await self.repository.upsert_daily_price(prepared_values)
                upserted_count += 1

        if validation_source is not None:
            await self._upsert_source_validation_summary(
                exchange=exchange,
                trade_date=trade_date,
                source_name=f"{source.source_name}+{validation_source.source_name}",
                suspicious_count=suspicious_count,
            )

        if commit:
            await self.repository.commit()
        logger.info(
            "Daily market ingestion completed: exchange=%s trade_date=%s source=%s total_rows=%s "
            "success=%s failed_rows=%s suspicious_rows=%s",
            exchange,
            trade_date,
            source.source_name,
            len(ingested_prices),
            upserted_count,
            skipped_unknown_symbol_count,
            suspicious_count,
        )
        if invalidate_market_cache:
            spawn_rebuild_market_read_cache(exchange)
        return DailyPriceIngestionResult(
            exchange=exchange,
            trade_date=trade_date,
            source=source.source_name,
            fetched_count=len(ingested_prices),
            created_count=upserted_count,
            skipped_existing_count=skipped_existing_count,
            skipped_unknown_symbol_count=skipped_unknown_symbol_count,
            suspicious_count=suspicious_count,
        )

    async def run_snapshot_enrichment(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date,
        commit: bool = True,
    ) -> PostDailyAmarstockStats:
        try:
            stats = await run_snapshot_market_enrichment(
                self.repository.session,
                exchange=exchange,
                trade_date=trade_date,
                settings=get_settings(),
            )
            if commit:
                await self.repository.commit()
            return stats
        except Exception as exc:
            await self.repository.rollback()
            logger.warning("Snapshot market enrichment failed: %s", exc, exc_info=True)
            return PostDailyAmarstockStats(index_summary_error=str(exc))

    async def run_daily_news_sync(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date,
    ) -> PostDailyAmarstockStats:
        try:
            stats = await run_daily_news_enrichment(
                self.repository.session,
                exchange=exchange,
                trade_date=trade_date,
                settings=get_settings(),
            )
            await self.repository.commit()
            return stats
        except Exception as exc:
            await self.repository.rollback()
            logger.warning("Daily news enrichment failed: %s", exc, exc_info=True)
            return PostDailyAmarstockStats(news_error=str(exc))

    async def _fetch_ingestion_prices(
        self,
        *,
        source: MarketDataSource,
        validation_source: MarketDataSource | None,
        trade_date: date,
    ) -> tuple[list[IngestedDailyPrice], list[IngestedDailyPrice]]:
        if validation_source is None:
            return await source.fetch_daily_prices(trade_date), []

        primary_task = source.fetch_daily_prices(trade_date)
        validation_task = validation_source.fetch_daily_prices(trade_date)
        primary_result, validation_result = await asyncio.gather(
            primary_task,
            validation_task,
            return_exceptions=True,
        )

        if isinstance(primary_result, Exception):
            raise primary_result

        if isinstance(validation_result, Exception):
            logger.warning(
                "Validation source fetch failed; continuing primary ingestion: source=%s error=%s",
                validation_source.source_name,
                validation_result,
            )
            validation_prices: list[IngestedDailyPrice] = []
        else:
            validation_prices = validation_result

        return primary_result, validation_prices

    def _apply_close_price_validation(
        self,
        *,
        primary_prices: list[IngestedDailyPrice],
        validation_prices: list[IngestedDailyPrice],
        validation_source_name: str | None,
    ) -> int:
        if not validation_prices:
            if validation_source_name is not None:
                logger.warning("Validation skipped: no validation data available")
            return 0

        validation_by_symbol = {
            self._normalize_symbol(price.symbol): price
            for price in validation_prices
            if self._normalize_symbol(price.symbol)
        }
        suspicious_count = 0
        for primary_price in primary_prices:
            symbol_key = self._normalize_symbol(primary_price.symbol)
            validation_price = validation_by_symbol.get(symbol_key)
            if validation_price is None:
                logger.debug(
                    "No validation price match found: symbol=%s validation_source=%s",
                    primary_price.symbol,
                    validation_source_name,
                )
                continue

            difference_percent = self._calculate_close_price_difference_percent(
                primary_price.close_price,
                validation_price.close_price,
            )
            if difference_percent is None:
                logger.debug(
                    "Skipping LTP validation due to unsafe price: symbol=%s primary_close=%s "
                    "validation_close=%s",
                    primary_price.symbol,
                    primary_price.close_price,
                    validation_price.close_price,
                )
                continue

            if difference_percent <= LTP_VALIDATION_THRESHOLD_PERCENT:
                continue

            suspicious_count += 1
            if primary_price.data_quality_flag == DataQualityFlag.OK:
                primary_price.data_quality_flag = DataQualityFlag.SUSPICIOUS
            else:
                logger.debug(
                    "Preserving existing data quality flag after validation mismatch: symbol=%s "
                    "existing_flag=%s",
                    primary_price.symbol,
                    primary_price.data_quality_flag,
                )

            logger.warning(
                "LTP validation mismatch: symbol=%s primary_source=%s validation_source=%s "
                "primary_close=%s validation_close=%s difference_percent=%s threshold_percent=%s",
                primary_price.symbol,
                primary_price.source,
                validation_source_name,
                primary_price.close_price,
                validation_price.close_price,
                difference_percent,
                LTP_VALIDATION_THRESHOLD_PERCENT,
            )

        return suspicious_count

    def _normalize_symbol(self, symbol: str) -> str:
        return symbol.strip().upper()

    def _calculate_close_price_difference_percent(
        self,
        primary_close_price: Decimal | None,
        validation_close_price: Decimal | None,
    ) -> Decimal | None:
        if primary_close_price is None or validation_close_price is None:
            return None

        base = (abs(primary_close_price) + abs(validation_close_price)) / Decimal("2")
        if base == 0:
            return None

        difference = abs(primary_close_price - validation_close_price)
        return difference / base * Decimal("100")

    async def _upsert_source_validation_summary(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date,
        source_name: str,
        suspicious_count: int,
    ) -> None:
        await self.repository.upsert_daily_market_summary(
            {
                "exchange": exchange,
                "trade_date": trade_date,
                "index_name": SOURCE_VALIDATION_SUMMARY_INDEX,
                "source": source_name,
                "data_quality_flag": (
                    DataQualityFlag.SUSPICIOUS if suspicious_count > 0 else DataQualityFlag.OK
                ),
                "has_suspicious_prices": suspicious_count > 0,
            }
        )

    async def list_daily_market_summaries(
        self,
        *,
        exchange: ExchangeCode | None,
        limit: int,
        offset: int,
    ) -> list[DailyMarketSummary]:
        return await self.repository.list_daily_market_summaries(
            exchange=exchange,
            limit=limit,
            offset=offset,
        )

    async def create_daily_market_summary(
        self,
        summary_data: DailyMarketSummaryCreate,
    ) -> DailyMarketSummary:
        summary = await self.repository.create_model(DailyMarketSummary, summary_data.model_dump())
        await self.repository.commit()
        await self.repository.refresh(summary)
        return summary

    async def find_daily_market_summary(
        self,
        summary_data: DailyMarketSummaryCreate,
    ) -> DailyMarketSummary | None:
        return await self.repository.get_daily_market_summary(
            exchange=summary_data.exchange,
            trade_date=summary_data.trade_date,
            index_name=summary_data.index_name,
        )

    async def get_dsex_index_snapshot(
        self,
        *,
        exchange: ExchangeCode = ExchangeCode.DSE,
        summaries: list[DailyMarketSummary] | None = None,
        report: PerfReport | None = None,
    ) -> DsexIndexSnapshotRead:
        settings = get_settings()
        now = datetime.now(ZoneInfo("Asia/Dhaka"))
        market_status = resolve_market_status(now, settings).value
        perf = report or PerfReport("dsex.snapshot")

        summaries_provided = summaries is not None
        if summaries is None:
            async with async_perf_stage(perf, "db.summaries"):
                summaries = await self.repository.list_daily_market_summaries(
                    exchange=exchange,
                    limit=280,
                    offset=0,
                )

        dsex_history = sorted(
            (
                summary
                for summary in summaries
                if summary.index_name == DSEX_SUMMARY_INDEX and summary.index_close is not None
            ),
            key=lambda summary: summary.trade_date,
        )

        # Dashboard overview passes a shallow summary batch (all indices, ~30 rows).
        # Reload full history for horizon metrics without bloating the overview payload.
        if summaries_provided and len(dsex_history) <= TRADING_DAYS_1Y:
            async with async_perf_stage(perf, "db.summaries.deep"):
                summaries = await self.repository.list_daily_market_summaries(
                    exchange=exchange,
                    limit=280,
                    offset=0,
                )
            dsex_history = sorted(
                (
                    summary
                    for summary in summaries
                    if summary.index_name == DSEX_SUMMARY_INDEX and summary.index_close is not None
                ),
                key=lambda summary: summary.trade_date,
            )

        if not dsex_history:
            raise NotFoundError("DSEX index snapshot is not available")

        latest = dsex_history[-1]
        index_close = latest.index_close
        if index_close is None:
            raise NotFoundError("DSEX index snapshot is not available")

        index_change = latest.index_change if latest.index_change is not None else Decimal("0")
        index_change_percent = (
            latest.index_change_percent if latest.index_change_percent is not None else Decimal("0")
        )
        day_open = index_close - index_change
        day_high = max(index_close, day_open)
        day_low = min(index_close, day_open)

        async with async_perf_stage(perf, "metrics.local"):
            performance = await build_dsex_performance_snapshot(
                summaries,
                index_close=index_close,
                day_low=day_low,
                day_high=day_high,
                exchange=exchange,
                settings=settings,
            )

        range_position_percent = self._compute_range_position_percent(
            index_close,
            performance.range_52w_low or day_low,
            performance.range_52w_high or day_high,
        )

        perf.log_summary()
        return DsexIndexSnapshotRead(
            trade_date=latest.trade_date,
            market_status=market_status,
            index_close=index_close,
            index_change=index_change,
            index_change_percent=index_change_percent,
            day_open=day_open,
            day_high=day_high,
            day_low=day_low,
            range_52w_low=performance.range_52w_low or day_low,
            range_52w_high=performance.range_52w_high or day_high,
            range_position_percent=range_position_percent,
            return_1m_percent=performance.return_1m_percent,
            return_6m_percent=performance.return_6m_percent,
            return_1y_percent=performance.return_1y_percent,
            total_volume=latest.total_volume,
            total_turnover=latest.total_turnover,
            total_trades=latest.total_trades,
            advancing_issues=latest.advancing_issues or 0,
            declining_issues=latest.declining_issues or 0,
            unchanged_issues=latest.unchanged_issues or 0,
            source=latest.source,
        )

    async def upsert_dsex_index_summary(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date | None = None,
    ) -> None:
        source = AmarStockIndexApiSource.from_settings(get_settings())
        snapshot = await source.fetch_dsex_snapshot()
        resolved_trade_date = trade_date or snapshot.trade_date
        await self.repository.upsert_daily_market_summary(
            {
                "exchange": exchange,
                "trade_date": resolved_trade_date,
                "index_name": DSEX_SUMMARY_INDEX,
                "index_close": snapshot.index_close,
                "index_change": snapshot.index_change,
                "index_change_percent": snapshot.index_change_percent,
                "total_volume": snapshot.total_volume,
                "total_turnover": snapshot.total_turnover,
                "total_trades": snapshot.total_trades,
                "advancing_issues": snapshot.advancing_issues,
                "declining_issues": snapshot.declining_issues,
                "unchanged_issues": snapshot.unchanged_issues,
                "source": source.source_name,
                "data_quality_flag": DataQualityFlag.OK,
                "has_suspicious_prices": False,
                "is_finalized": False,
            }
        )

    def _compute_index_return_percent(
        self,
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

    def _compute_range_position_percent(
        self,
        current_close: Decimal,
        range_low: Decimal,
        range_high: Decimal,
    ) -> Decimal:
        if range_high <= range_low:
            return Decimal("50")

        position = (current_close - range_low) / (range_high - range_low) * Decimal("100")
        return max(Decimal("0"), min(Decimal("100"), position))

    async def _ensure_stock_exists(self, stock_id: UUID) -> None:
        stock = await self.repository.get_stock_by_id(stock_id)
        if stock is None:
            raise NotFoundError("Stock was not found")

    async def _prepare_daily_price_values(self, price_data: DailyPriceCreate) -> dict[str, object]:
        previous_close_price = price_data.previous_close_price
        if previous_close_price is None:
            previous_price = await self.repository.get_latest_daily_price_before(
                stock_id=price_data.stock_id,
                trade_date=price_data.trade_date,
            )
            previous_close_price = previous_price.close_price if previous_price is not None else None

        day_range = price_data.high_price - price_data.low_price
        turnover_is_reported = price_data.turnover is not None
        turnover = (
            price_data.turnover
            if turnover_is_reported
            else price_data.close_price * Decimal(price_data.volume)
        )
        turnover_provenance = price_data.turnover_provenance
        if turnover_provenance == TurnoverProvenance.UNKNOWN:
            turnover_provenance = (
                TurnoverProvenance.REPORTED
                if turnover_is_reported
                else TurnoverProvenance.ESTIMATED
            )
        data_quality_flag = price_data.data_quality_flag
        if previous_close_price is None and data_quality_flag == DataQualityFlag.OK:
            data_quality_flag = DataQualityFlag.PARTIAL

        values = price_data.model_dump()
        values.update(
            {
                "previous_close_price": previous_close_price,
                "price_change": self._calculate_price_change(price_data.close_price, previous_close_price),
                "price_change_percent": self._calculate_percent_change(
                    price_data.close_price,
                    previous_close_price,
                ),
                "day_range": day_range,
                "day_range_percent": self._calculate_ratio_percent(day_range, price_data.low_price),
                "turnover": turnover,
                "turnover_provenance": turnover_provenance,
                "vwap": self._calculate_vwap(turnover, price_data.volume),
                "data_quality_flag": data_quality_flag,
            }
        )
        return values

    def _build_daily_price_create(self, stock_id: UUID, price: IngestedDailyPrice) -> DailyPriceCreate:
        return DailyPriceCreate(
            stock_id=stock_id,
            trade_date=price.trade_date,
            open_price=price.open_price,
            high_price=price.high_price,
            low_price=price.low_price,
            close_price=price.close_price,
            adjusted_close_price=price.adjusted_close_price,
            previous_close_price=price.previous_close_price,
            volume=price.volume,
            trade_count=price.trade_count,
            turnover=price.turnover,
            turnover_provenance=(
                TurnoverProvenance.REPORTED
                if price.turnover is not None
                else TurnoverProvenance.ESTIMATED
            ),
            source=price.source,
            data_quality_flag=price.data_quality_flag,
        )

    def _calculate_price_change(
        self,
        close_price: Decimal,
        previous_close_price: Decimal | None,
    ) -> Decimal | None:
        if previous_close_price is None:
            return None
        return close_price - previous_close_price

    def _calculate_percent_change(
        self,
        close_price: Decimal,
        previous_close_price: Decimal | None,
    ) -> Decimal | None:
        if previous_close_price is None or previous_close_price == 0:
            return None
        return (close_price - previous_close_price) / previous_close_price * Decimal("100")

    def _calculate_ratio_percent(self, numerator: Decimal, denominator: Decimal) -> Decimal | None:
        if denominator == 0:
            return None
        return numerator / denominator * Decimal("100")

    def _calculate_vwap(self, turnover: Decimal | None, volume: int) -> Decimal | None:
        if turnover is None or volume == 0:
            return None
        return turnover / Decimal(volume)

    async def get_market_freshness(self, *, exchange: ExchangeCode) -> MarketFreshnessRead:
        settings = get_settings()
        now = datetime.now(ZoneInfo("Asia/Dhaka"))
        status = resolve_market_status(now, settings)
        published = await self._resolve_published_market_generation(
            exchange=exchange,
            market_status=status,
            today=now.date(),
            now=now,
            stale_after_seconds=settings.market_sync_interval_seconds * 2,
        )
        trade_date, last_synced_at = await self.repository.get_market_price_freshness(exchange=exchange)
        decision_session_date, _ = await self.repository.get_decision_session_freshness(
            exchange=exchange
        )
        from app.core.enums import MarketSessionStatus

        interval = settings.market_snapshot_interval_minutes
        next_sync = None
        if status in {MarketSessionStatus.PRE_OPEN, MarketSessionStatus.OPEN}:
            next_sync = next_snapshot_sync_at(now, settings)

        return MarketFreshnessRead(
            exchange=exchange,
            trade_date=published[0] if published is not None else trade_date,
            last_synced_at=published[3] if published is not None else last_synced_at,
            market_sync_id=published[1] if published is not None else None,
            data_state=published[2] if published is not None else MarketDataState.STALE,
            published_at=published[4] if published is not None else None,
            decision_session_date=decision_session_date,
            live_data_as_of=(
                published[3]
                if published is not None and published[2] in {
                    MarketDataState.LIVE,
                    MarketDataState.FINALIZATION_PENDING,
                    MarketDataState.STALE,
                }
                else None
            ),
            is_live_session=(
                published is not None
                and published[2]
                in {
                    MarketDataState.LIVE,
                    MarketDataState.FINALIZATION_PENDING,
                    MarketDataState.STALE,
                }
            ),
            next_sync_at=next_sync,
            snapshot_interval_minutes=interval,
            market_sync_interval_seconds=settings.market_sync_interval_seconds,
            dashboard_cache_ttl_seconds=resolve_cache_ttl_seconds(status, settings),
            expected_delay_minutes=interval,
            market_open_time=settings.market_open_time,
            market_close_time=settings.market_close_time,
            market_status=status,
            freshness_label=build_freshness_label(settings, status),
        )

    async def publish_market_generation(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date,
        state: MarketDataState,
        source: str,
        fetched_count: int,
        accepted_count: int,
        suspicious_count: int,
    ) -> str:
        """Publish one completed source run after prices and DSEX enrichment commit."""

        _, source_last_synced_at = await self.repository.get_market_price_freshness(exchange=exchange)
        if source_last_synced_at is None:
            raise RuntimeError("Cannot publish market generation without persisted market prices")
        sync_id = uuid4().hex
        await self.repository.create_market_data_generation(
            exchange=exchange,
            trade_date=trade_date,
            sync_id=sync_id,
            state=state,
            source=source,
            source_last_synced_at=source_last_synced_at,
            fetched_count=fetched_count,
            accepted_count=accepted_count,
            suspicious_count=suspicious_count,
        )
        await self.repository.commit()
        return sync_id

    async def publish_finalized_market_generation(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date,
    ) -> str:
        existing = await self.repository.get_latest_market_data_generation(
            exchange=exchange,
            state=MarketDataState.FINALIZED,
            trade_date=trade_date,
        )
        if existing is not None:
            return existing.sync_id
        live = await self.repository.get_latest_market_data_generation(
            exchange=exchange,
            state=MarketDataState.LIVE,
            trade_date=trade_date,
        )
        if live is None:
            # Safe deployment/retry fallback: the finalizer already verified the
            # price and DSEX inputs.  Older deployments have no LIVE manifest to
            # promote, but must not leave a verified session permanently hidden.
            logger.warning(
                "Finalizing %s %s without a prior LIVE generation; publishing a verified fallback",
                exchange.value,
                trade_date,
            )
            return await self.publish_market_generation(
                exchange=exchange,
                trade_date=trade_date,
                state=MarketDataState.FINALIZED,
                source="verified-finalization-fallback",
                fetched_count=0,
                accepted_count=0,
                suspicious_count=0,
            )
        return await self.publish_market_generation(
            exchange=exchange,
            trade_date=trade_date,
            state=MarketDataState.FINALIZED,
            source=live.source,
            fetched_count=live.fetched_count,
            accepted_count=live.accepted_count,
            suspicious_count=live.suspicious_count,
        )

    async def _resolve_published_market_generation(
        self,
        *,
        exchange: ExchangeCode,
        market_status,
        today: date,
        now: datetime,
        stale_after_seconds: int,
    ) -> tuple[date, str, MarketDataState, datetime, datetime] | None:
        """Resolve the only dataset readers may expose for the current session state."""

        finalized = await self.repository.get_latest_market_data_generation(
            exchange=exchange,
            state=MarketDataState.FINALIZED,
        )
        today_finalized = (
            finalized if finalized is not None and finalized.trade_date == today else None
        )
        today_live = await self.repository.get_latest_market_data_generation(
            exchange=exchange,
            state=MarketDataState.LIVE,
            trade_date=today,
        )

        from app.core.enums import MarketSessionStatus

        selected = None
        data_state = MarketDataState.STALE
        if market_status == MarketSessionStatus.OPEN:
            selected = today_live or today_finalized or finalized
            data_state = MarketDataState.LIVE if selected is today_live else MarketDataState.FINALIZED
        elif market_status == MarketSessionStatus.POST_CLOSE:
            selected = today_finalized or today_live or finalized
            data_state = (
                MarketDataState.FINALIZED
                if selected is today_finalized or selected is finalized
                else MarketDataState.FINALIZATION_PENDING
            )
        else:
            selected = finalized
            data_state = MarketDataState.FINALIZED if selected is not None else MarketDataState.STALE

        if selected is None:
            return None
        if selected is today_live:
            synced_at = selected.source_last_synced_at
            if synced_at.tzinfo is None:
                synced_at = synced_at.replace(tzinfo=now.tzinfo)
            if (now - synced_at).total_seconds() > stale_after_seconds:
                data_state = MarketDataState.STALE
        return (
            selected.trade_date,
            selected.sync_id,
            data_state,
            selected.source_last_synced_at,
            selected.published_at,
        )

    async def list_recent_finalized_session_dates(
        self,
        *,
        exchange: ExchangeCode,
        end_date: date,
        limit: int,
    ) -> list[date]:
        return await self.repository.list_recent_finalized_session_dates(
            exchange=exchange,
            end_date=end_date,
            limit=limit,
        )

    async def finalize_market_session(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date,
    ) -> bool:
        finalized = await self.repository.finalize_market_session(
            exchange=exchange,
            trade_date=trade_date,
        )
        if finalized:
            await self.repository.commit()
        else:
            await self.repository.session.rollback()
        return finalized


def get_market_data_service(
    repository: MarketDataRepository = Depends(get_market_data_repository),
    user_context: UserContext = Depends(get_current_user_context),
) -> MarketDataService:
    return MarketDataService(repository, user_context)

