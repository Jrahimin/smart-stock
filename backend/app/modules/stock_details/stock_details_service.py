import asyncio
import logging
import random
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import Depends

from app.api.dependencies.auth_dependencies import get_current_user_context
from app.core.core_config import Settings, get_settings
from app.core.enums import (
    DataQualityFlag,
    ExchangeCode,
    MetricValueType,
    ReportPeriodType,
    ReportStatus,
    StockDetailsSyncJobStatus,
    StockDetailsSyncScope,
    StockDetailsSyncTriggerType,
    TurnoverProvenance,
)
from app.core.exception_handlers import NotFoundError
from app.core.security_config import UserContext
from app.jobs.ingestion.amarstock_api_stock_details_source import (
    AMARSTOCK_SOURCE,
    AmarStockApiStockDetailsSource,
)
from app.jobs.ingestion.amarstock_latest_price_api_source import (
    AmarStockLatestPriceApiSource,
    AmarStockLatestPriceRow,
    latest_price_snapshot_date,
)
from app.jobs.ingestion.stock_details_api_source_base import ApiStockDetailsPayload
from app.models import FinancialMetricDefinition, FinancialReport, Stock, StockDetailsSyncJob
from app.modules.stock_details.stock_details_repository import (
    StockDetailsRepository,
    get_stock_details_repository,
)
from app.modules.stock_details.stock_details_schemas import (
    StockDetailsSyncRequest,
    StockDetailsSyncResult,
)

AMARSTOCK_LATEST_PRICE_SOURCE = AmarStockLatestPriceApiSource.source_name

CONTROLLED_METRIC_DEFINITIONS: dict[str, tuple[str, MetricValueType, str | None, str | None]] = {
    "EPS": ("Earnings Per Share", MetricValueType.PER_SHARE, "income-statement", None),
    "Q1_EPS": ("Q1 Earnings Per Share", MetricValueType.PER_SHARE, "snapshot", None),
    "Q2_EPS": ("Q2 Earnings Per Share", MetricValueType.PER_SHARE, "snapshot", None),
    "Q3_EPS": ("Q3 Earnings Per Share", MetricValueType.PER_SHARE, "snapshot", None),
    "Q4_EPS": ("Q4 Earnings Per Share", MetricValueType.PER_SHARE, "snapshot", None),
    "NAV_PER_SHARE": ("Net Asset Value Per Share", MetricValueType.PER_SHARE, "balance-sheet", None),
    "TOTAL_ASSETS": ("Total Assets", MetricValueType.AMOUNT, "balance-sheet", None),
    "TOTAL_LIABILITIES": ("Total Liabilities", MetricValueType.AMOUNT, "balance-sheet", None),
    "NET_PROFIT_AFTER_TAX": ("Net Profit After Tax", MetricValueType.AMOUNT, "income-statement", None),
    "NET_OPERATING_CASH_FLOW": (
        "Net Cash Flow From Operating Activities",
        MetricValueType.AMOUNT,
        "cash-flow-statement",
        None,
    ),
    "REVENUE": ("Revenue", MetricValueType.AMOUNT, "income-statement", None),
    "OPERATING_PROFIT": ("Operating Profit", MetricValueType.AMOUNT, "income-statement", None),
    "AUTHORIZED_CAPITAL": ("Authorized Capital", MetricValueType.AMOUNT, "snapshot", None),
    "PAID_UP_CAPITAL": ("Paid-up Capital", MetricValueType.AMOUNT, "balance-sheet", None),
    "TOTAL_SHARES": ("Total Shares", MetricValueType.COUNT, "balance-sheet", None),
    "RESERVE_SURPLUS": ("Reserve and Surplus", MetricValueType.AMOUNT, "balance-sheet", None),
    "SHORT_TERM_LOAN": ("Short-term Loan", MetricValueType.AMOUNT, "balance-sheet", None),
    "LONG_TERM_LOAN": ("Long-term Loan", MetricValueType.AMOUNT, "balance-sheet", None),
    "FREE_FLOAT_PERCENT": ("Free Float", MetricValueType.PERCENT, "snapshot", None),
    "BETA": ("Stock Beta", MetricValueType.RATIO, "snapshot", None),
}

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _FetchedDetails:
    stock: Stock
    job: StockDetailsSyncJob
    payload: ApiStockDetailsPayload | None
    attempt_count: int
    error: Exception | None = None


class StockDetailsService:
    def __init__(
        self,
        repository: StockDetailsRepository,
        user_context: UserContext,
        settings: Settings,
    ) -> None:
        self.repository = repository
        self.user_context = user_context
        self.settings = settings

    async def sync_stock_details(
        self,
        request: StockDetailsSyncRequest,
        *,
        source: AmarStockApiStockDetailsSource | None = None,
    ) -> StockDetailsSyncResult:
        selected_stocks, skipped_count = await self._select_stocks(request)
        requested_count = self._requested_count(request, selected_count=len(selected_stocks))
        if not selected_stocks:
            return self._empty_result(
                exchange=request.exchange,
                requested_count=requested_count,
                skipped_count=skipped_count,
                scope=request.scope,
            )

        resolved_source = source or self._default_source()
        jobs = await self._create_jobs(selected_stocks, resolved_source, request.trigger_type)
        await self.repository.commit()

        latest_by_symbol: dict[str, AmarStockLatestPriceRow] = {}
        if self.settings.amarstock_latest_price_stock_details_enabled:
            try:
                lp_source = AmarStockLatestPriceApiSource.from_settings(self.settings)
                latest_by_symbol = await lp_source.fetch_by_scrip()
            except Exception as exc:
                logger.warning(
                    "AmarStock LatestPrice bulk fetch failed; continuing per-stock snapshot sync: %s",
                    exc,
                    exc_info=True,
                )

        fetched_results = await self._fetch_batch(jobs, resolved_source, request)

        synced_count = 0
        partial_count = 0
        failed_count = 0
        stock_profile_count = 0
        daily_price_count = 0
        daily_price_skipped_count = 0
        metric_count = 0
        valuation_count = 0
        shareholding_count = 0
        event_count = 0
        latest_price_profile_fill_count = 0
        latest_price_shareholding_count = 0
        latest_price_valuation_count = 0

        for fetched in fetched_results:
            if fetched.error is not None or fetched.payload is None:
                failed_count += 1
                await self._finish_job(
                    fetched.job,
                    status=StockDetailsSyncJobStatus.FAILED,
                    error_message=str(fetched.error) if fetched.error is not None else "No payload parsed",
                    metadata={
                        "symbol": fetched.stock.symbol,
                        "sections": self._empty_section_diagnostics(),
                    },
                    attempt_count=fetched.attempt_count,
                )
                continue

            counts = await self._persist_payload(
                fetched.stock,
                fetched.payload,
                scope=request.scope,
                lp_row=latest_by_symbol.get(fetched.stock.symbol.upper()),
            )
            stock_profile_count += counts["stock_profile_count"]
            daily_price_count += counts["daily_price_count"]
            daily_price_skipped_count += counts["daily_price_skipped_count"]
            metric_count += counts["metric_count"]
            valuation_count += counts["valuation_count"]
            shareholding_count += counts["shareholding_count"]
            event_count += counts["event_count"]
            latest_price_profile_fill_count += counts["latest_price_profile_fill"]
            latest_price_shareholding_count += counts["latest_price_shareholding"]
            latest_price_valuation_count += counts["latest_price_valuation"]

            useful_count = sum(counts.values())
            if useful_count == 0 and request.scope != StockDetailsSyncScope.STOCKS:
                failed_count += 1
                await self._finish_job(
                    fetched.job,
                    status=StockDetailsSyncJobStatus.FAILED,
                    error_message="No mapped stock details were persisted",
                    metadata=self._job_metadata(fetched.payload, counts, request.scope),
                    attempt_count=fetched.attempt_count,
                )
                continue

            if fetched.payload.data_quality_flag == DataQualityFlag.PARTIAL:
                partial_count += 1
                status = StockDetailsSyncJobStatus.PARTIAL
            else:
                synced_count += 1
                status = StockDetailsSyncJobStatus.SUCCEEDED
            await self._finish_job(
                fetched.job,
                status=status,
                metadata=self._job_metadata(fetched.payload, counts, request.scope),
                attempt_count=fetched.attempt_count,
            )

        await self.repository.commit()
        return StockDetailsSyncResult(
            exchange=request.exchange,
            scope=request.scope,
            source=resolved_source.source_name,
            requested_count=requested_count,
            selected_count=len(selected_stocks),
            synced_count=synced_count,
            partial_count=partial_count,
            failed_count=failed_count,
            skipped_count=skipped_count,
            stock_profile_count=stock_profile_count,
            daily_price_count=daily_price_count,
            daily_price_skipped_count=daily_price_skipped_count,
            metric_count=metric_count,
            valuation_count=valuation_count,
            shareholding_count=shareholding_count,
            event_count=event_count,
            latest_price_profile_fill_count=latest_price_profile_fill_count,
            latest_price_shareholding_count=latest_price_shareholding_count,
            latest_price_valuation_count=latest_price_valuation_count,
        )

    async def get_stock_details_sync_job(self, job_id: UUID) -> StockDetailsSyncJob:
        job = await self.repository.get_by_id(job_id)
        if job is None:
            raise NotFoundError("Stock details sync job was not found")
        return job

    async def _select_stocks(self, request: StockDetailsSyncRequest) -> tuple[list[Stock], int]:
        stocks_scope = request.scope == StockDetailsSyncScope.STOCKS
        skip_cadence = self._skip_cadence(request)
        if request.symbols:
            stocks_by_symbol = await self.repository.get_stocks_by_symbols(
                exchange=request.exchange,
                symbols=set(request.symbols),
            )
            candidates = [stocks_by_symbol[symbol] for symbol in request.symbols if symbol in stocks_by_symbol]
            selected = await self._eligible_explicit_stocks(candidates, skip_cadence=skip_cadence)
            return selected, len(request.symbols) - len(selected)

        if stocks_scope or skip_cadence:
            selected = await self.repository.list_eligible_stocks(
                exchange=request.exchange,
                limit=request.limit,
                offset=request.offset,
            )
            return selected, 0

        selected = await self.repository.list_due_stocks(
            exchange=request.exchange,
            cutoff=self._sync_cutoff(),
            limit=request.limit,
            offset=request.offset,
        )
        return selected, 0

    async def _eligible_explicit_stocks(self, stocks: list[Stock], *, skip_cadence: bool) -> list[Stock]:
        selected: list[Stock] = []
        for stock in stocks:
            if not stock.is_active:
                continue
            if not stock.should_fetch_details:
                continue
            if skip_cadence:
                selected.append(stock)
                continue
            latest_job = await self.repository.get_latest_completed_job(stock.id)
            if latest_job is not None and latest_job.completed_at is not None:
                if latest_job.completed_at >= self._sync_cutoff():
                    continue
            selected.append(stock)
        return selected

    async def _create_jobs(
        self,
        stocks: list[Stock],
        source: AmarStockApiStockDetailsSource,
        trigger_type: StockDetailsSyncTriggerType,
    ) -> list[tuple[Stock, StockDetailsSyncJob]]:
        jobs: list[tuple[Stock, StockDetailsSyncJob]] = []
        for stock in stocks:
            job = await self.repository.create(
                {
                    "stock_id": stock.id,
                    "source": source.source_name,
                    "source_url": source.source_url(stock.symbol),
                    "status": StockDetailsSyncJobStatus.PENDING,
                    "trigger_type": trigger_type,
                    "attempt_count": 0,
                    "metadata_json": {"symbol": stock.symbol},
                }
            )
            jobs.append((stock, job))
        return jobs

    async def _fetch_batch(
        self,
        jobs: list[tuple[Stock, StockDetailsSyncJob]],
        source: AmarStockApiStockDetailsSource,
        request: StockDetailsSyncRequest,
    ) -> list[_FetchedDetails]:
        semaphore = asyncio.Semaphore(self.settings.stock_details_sync_max_concurrency)
        for _, job in jobs:
            await self.repository.update_sync_job(
                job,
                {
                    "status": StockDetailsSyncJobStatus.RUNNING,
                    "started_at": datetime.now(UTC),
                    "attempt_count": job.attempt_count + 1,
                },
            )
        await self.repository.commit()

        async def fetch_one(stock: Stock, job: StockDetailsSyncJob) -> _FetchedDetails:
            async with semaphore:
                await asyncio.sleep(
                    random.uniform(
                        self.settings.stock_details_sync_request_delay_min_seconds,
                        self.settings.stock_details_sync_request_delay_max_seconds,
                    )
                )
                last_error: Exception | None = None
                for attempt in range(1, self.settings.stock_details_sync_job_max_attempts + 1):
                    try:
                        payload = await source.fetch_stock_details(
                            stock.symbol,
                            historical_window_days=request.historical_window_days,
                        )
                    except Exception as exc:
                        last_error = exc
                        if attempt < self.settings.stock_details_sync_job_max_attempts:
                            await asyncio.sleep(2 ** (attempt - 1) + random.random())
                        continue
                    return _FetchedDetails(stock, job, payload, attempt)
                return _FetchedDetails(stock, job, None, self.settings.stock_details_sync_job_max_attempts, last_error)

        return await asyncio.gather(*(fetch_one(stock, job) for stock, job in jobs))

    async def _persist_payload(
        self,
        stock: Stock,
        payload: ApiStockDetailsPayload,
        *,
        scope: StockDetailsSyncScope,
        lp_row: AmarStockLatestPriceRow | None = None,
    ) -> dict[str, int]:
        if scope == StockDetailsSyncScope.STOCKS:
            stock_profile_count = await self._merge_stock_profile_from_snapshot_fill_empty(stock, payload)
            daily_price_count = 0
            daily_price_skipped_count = 0
            metric_count = 0
            valuation_count = 0
            shareholding_count = 0
            event_count = 0
            latest_price_profile_fill = 0
            latest_price_shareholding = 0
            latest_price_valuation = 0
            if lp_row is not None:
                latest_price_profile_fill = await self._merge_latest_price_stock_profile_fill_empty(
                    stock, lp_row
                )
            return {
                "stock_profile_count": stock_profile_count,
                "daily_price_count": daily_price_count,
                "daily_price_skipped_count": daily_price_skipped_count,
                "metric_count": metric_count,
                "valuation_count": valuation_count,
                "shareholding_count": shareholding_count,
                "event_count": event_count,
                "latest_price_profile_fill": latest_price_profile_fill,
                "latest_price_shareholding": latest_price_shareholding,
                "latest_price_valuation": latest_price_valuation,
            }

        stock_profile_count = await self._persist_stock_profile(stock, payload)
        daily_price_count, daily_price_skipped_count = await self._persist_daily_prices(stock, payload)
        metric_count = await self._persist_metrics(stock, payload)
        valuation_count = await self._persist_valuation(stock, payload)
        shareholding_count = await self._persist_shareholding(stock, payload)
        event_count = await self._persist_events(stock, payload)

        latest_price_profile_fill = 0
        latest_price_shareholding = 0
        latest_price_valuation = 0
        if lp_row is not None:
            latest_price_profile_fill = await self._merge_latest_price_stock_profile_fill_empty(
                stock, lp_row
            )
            snap_date = latest_price_snapshot_date(lp_row, fallback=payload.scrape_date)
            latest_price_shareholding = await self._persist_latest_price_shareholding(
                stock, lp_row, snap_date
            )
            latest_price_valuation = await self._persist_latest_price_valuation(stock, lp_row, snap_date)

        return {
            "stock_profile_count": stock_profile_count,
            "daily_price_count": daily_price_count,
            "daily_price_skipped_count": daily_price_skipped_count,
            "metric_count": metric_count,
            "valuation_count": valuation_count,
            "shareholding_count": shareholding_count,
            "event_count": event_count,
            "latest_price_profile_fill": latest_price_profile_fill,
            "latest_price_shareholding": latest_price_shareholding,
            "latest_price_valuation": latest_price_valuation,
        }

    @staticmethod
    def _is_blank_text(value: object) -> bool:
        if value is None:
            return True
        return not str(value).strip()

    @staticmethod
    def _stock_name_is_symbol_placeholder(stock: Stock) -> bool:
        return stock.name.strip().upper() == stock.symbol.strip().upper()

    async def _merge_latest_price_stock_profile_fill_empty(self, stock: Stock, lp: AmarStockLatestPriceRow) -> int:
        updates: dict[str, object] = {}
        if self._is_blank_text(stock.sector) and lp.business_segment:
            updates["sector"] = lp.business_segment[:120]
        if self._is_blank_text(stock.category) and lp.market_category:
            updates["category"] = lp.market_category[:32]
        if lp.full_name and self._stock_name_is_symbol_placeholder(stock):
            updates["name"] = lp.full_name[:255]
        if stock.paid_up_capital is None and lp.paid_up_cap is not None:
            updates["paid_up_capital"] = lp.paid_up_cap
        if stock.market_cap is None and lp.market_cap is not None:
            updates["market_cap"] = lp.market_cap
        if not updates:
            return 0
        await self.repository.update_stock_profile(stock, updates)
        return 1

    async def _merge_stock_profile_from_snapshot_fill_empty(
        self, stock: Stock, payload: ApiStockDetailsPayload
    ) -> int:
        if payload.stock_profile is None:
            return 0
        profile = payload.stock_profile
        updates: dict[str, object] = {}
        if self._is_blank_text(stock.sector) and profile.sector is not None and not self._is_blank_text(
            profile.sector
        ):
            updates["sector"] = str(profile.sector).strip()[:120]
        if self._is_blank_text(stock.category) and profile.category is not None and not self._is_blank_text(
            profile.category
        ):
            updates["category"] = str(profile.category).strip()[:32]
        if profile.name and self._stock_name_is_symbol_placeholder(stock) and not self._is_blank_text(
            profile.name
        ):
            updates["name"] = str(profile.name).strip()[:255]
        if stock.listing_date is None and profile.listing_date is not None:
            updates["listing_date"] = profile.listing_date
        if stock.paid_up_capital is None and profile.paid_up_capital is not None:
            updates["paid_up_capital"] = profile.paid_up_capital
        if stock.market_cap is None and profile.market_cap is not None:
            updates["market_cap"] = profile.market_cap
        if not updates:
            return 0
        await self.repository.update_stock_profile(stock, updates)
        return 1

    async def _persist_latest_price_shareholding(
        self,
        stock: Stock,
        lp: AmarStockLatestPriceRow,
        snapshot_date: date,
    ) -> int:
        if (
            lp.sponsor_director is None
            and lp.government is None
            and lp.institute is None
            and lp.foreign is None
            and lp.public_pct is None
            and lp.free_float is None
            and lp.total_securities is None
        ):
            return 0
        circulating: int | None = None
        if lp.total_securities is not None and lp.free_float is not None:
            circulating = int(Decimal(lp.total_securities) * lp.free_float / Decimal("100"))

        metadata = {
            "api": "latest_price",
            "VolChangePer": str(lp.vol_change_per) if lp.vol_change_per is not None else None,
            "OpenChangePer": str(lp.open_change_per) if lp.open_change_per is not None else None,
            "ChangePer": str(lp.change_per) if lp.change_per is not None else None,
            "Trade": lp.trade,
            "ValueTurnoverRaw": lp.value_turnover_millions_raw,
        }

        await self.repository.upsert_shareholding(
            {
                "stock_id": stock.id,
                "snapshot_date": snapshot_date,
                "sponsor_director_percent": lp.sponsor_director,
                "government_percent": lp.government,
                "institution_percent": lp.institute,
                "foreign_percent": lp.foreign,
                "public_percent": lp.public_pct,
                "total_shares": lp.total_securities,
                "circulating_shares": circulating,
                "free_float_percent": lp.free_float,
                "source": AMARSTOCK_LATEST_PRICE_SOURCE,
                "data_quality_flag": DataQualityFlag.OK,
                "metadata_json": metadata,
            }
        )
        return 1

    async def _persist_latest_price_valuation(
        self,
        stock: Stock,
        lp: AmarStockLatestPriceRow,
        snapshot_date: date,
    ) -> int:
        close_px = lp.close if lp.close is not None else lp.ltp
        if close_px is None and lp.market_cap is None and lp.pe is None:
            return 0
        earnings_yield = self._ratio_percent(Decimal("1"), lp.pe)
        metadata: dict[str, object] = {
            "api": "latest_price",
            "nav": str(lp.nav) if lp.nav is not None else None,
            "reserve_surplus": str(lp.reserve_surplus) if lp.reserve_surplus is not None else None,
            "eps": str(lp.eps) if lp.eps is not None else None,
            "q1_eps": str(lp.q1_eps) if lp.q1_eps is not None else None,
            "q2_eps": str(lp.q2_eps) if lp.q2_eps is not None else None,
            "q3_eps": str(lp.q3_eps) if lp.q3_eps is not None else None,
            "q4_eps": str(lp.q4_eps) if lp.q4_eps is not None else None,
        }
        await self.repository.upsert_valuation(
            {
                "stock_id": stock.id,
                "valuation_date": snapshot_date,
                "close_price": close_px,
                "market_cap": lp.market_cap,
                "pe_ratio": lp.pe,
                "pb_ratio": None,
                "dividend_yield": None,
                "earnings_yield": earnings_yield,
                "price_to_sales": None,
                "source": AMARSTOCK_LATEST_PRICE_SOURCE,
                "data_quality_flag": DataQualityFlag.OK,
                "metadata_json": metadata,
            }
        )
        return 1

    async def _persist_stock_profile(self, stock: Stock, payload: ApiStockDetailsPayload) -> int:
        if payload.stock_profile is None:
            return 0

        profile = payload.stock_profile
        values = {
            key: value
            for key, value in {
                "name": profile.name,
                "sector": profile.sector,
                "category": profile.category,
                "listing_date": profile.listing_date,
                "paid_up_capital": profile.paid_up_capital,
                "market_cap": profile.market_cap,
                "is_active": profile.is_active,
            }.items()
            if value is not None
        }
        if not values:
            return 0

        await self.repository.update_stock_profile(stock, values)
        return 1

    async def _persist_daily_prices(self, stock: Stock, payload: ApiStockDetailsPayload) -> tuple[int, int]:
        inserted = 0
        skipped = 0
        for price in payload.daily_prices:
            turnover = price.close_price * Decimal(price.volume)
            row = await self.repository.insert_daily_price_if_absent(
                {
                    "stock_id": stock.id,
                    "trade_date": price.trade_date,
                    "open_price": price.open_price,
                    "high_price": price.high_price,
                    "low_price": price.low_price,
                    "close_price": price.close_price,
                    "adjusted_close_price": None,
                    "previous_close_price": None,
                    "price_change": None,
                    "price_change_percent": None,
                    "day_range": price.high_price - price.low_price,
                    "day_range_percent": self._ratio_percent(price.high_price - price.low_price, price.low_price),
                    "vwap": turnover / Decimal(price.volume) if price.volume > 0 else None,
                    "volume": price.volume,
                    "trade_count": price.trade_count,
                    "turnover": turnover,
                    "turnover_provenance": TurnoverProvenance.ESTIMATED,
                    "source": payload.source,
                    "data_quality_flag": price.data_quality_flag,
                }
            )
            if row is None:
                skipped += 1
            else:
                inserted += 1
        return inserted, skipped

    async def _persist_metrics(self, stock: Stock, payload: ApiStockDetailsPayload) -> int:
        metric_def_cache: dict[str, FinancialMetricDefinition] = {}
        report_cache: dict[tuple[UUID, int, str], FinancialReport] = {}
        count = 0
        for metric in payload.financial_metrics:
            definition_values = CONTROLLED_METRIC_DEFINITIONS.get(metric.metric_code)
            if definition_values is None:
                logger.warning(
                    "Skipping unmapped stock details metric: symbol=%s metric_code=%s label=%s",
                    stock.symbol,
                    metric.metric_code,
                    metric.source_label,
                )
                continue
            metric_definition = metric_def_cache.get(metric.metric_code)
            if metric_definition is None:
                display_name, value_type, statement_section, description = definition_values
                metric_definition = await self.repository.upsert_metric_definition(
                    {
                        "metric_code": metric.metric_code,
                        "display_name": display_name,
                        "value_type": value_type,
                        "statement_section": statement_section or metric.statement_section,
                        "description": description,
                        "is_active": True,
                    }
                )
                metric_def_cache[metric.metric_code] = metric_definition

            report_key = (stock.id, metric.fiscal_year, metric.statement_section)
            report = report_cache.get(report_key)
            if report is None:
                report = await self.repository.create_or_update_financial_report(
                    {
                        "stock_id": stock.id,
                        "fiscal_year": metric.fiscal_year,
                        "period_type": metric.period_type,
                        "period_start_date": date(metric.fiscal_year, 1, 1),
                        "period_end_date": date(metric.fiscal_year, 12, 31),
                        "published_date": None,
                        "report_status": metric.report_status,
                        "currency": "BDT",
                        "source": payload.source,
                        "data_quality_flag": payload.data_quality_flag,
                        "metadata_json": {
                            "statement_section": metric.statement_section,
                            "source_url": payload.company_url,
                        },
                    }
                )
                report_cache[report_key] = report

            await self.repository.upsert_metric_value(
                {
                    "financial_report_id": report.id,
                    "metric_definition_id": metric_definition.id,
                    "as_of_date": metric.as_of_date,
                    "value": metric.value,
                    "currency": "BDT",
                    "source_value": metric.source_value[:120],
                    "metadata_json": {
                        **metric.metadata,
                        "source_label": metric.source_label,
                        "statement_section": metric.statement_section,
                    },
                }
            )
            count += 1
        return count

    async def _persist_valuation(self, stock: Stock, payload: ApiStockDetailsPayload) -> int:
        if payload.valuation is None:
            return 0
        valuation = payload.valuation
        earnings_yield = self._ratio_percent(Decimal("1"), valuation.pe_ratio)
        await self.repository.upsert_valuation(
            {
                "stock_id": stock.id,
                "valuation_date": valuation.valuation_date,
                "close_price": valuation.close_price,
                "market_cap": valuation.market_cap,
                "pe_ratio": valuation.pe_ratio,
                "pb_ratio": valuation.pb_ratio,
                "dividend_yield": valuation.dividend_yield,
                "earnings_yield": earnings_yield,
                "price_to_sales": None,
                "source": payload.source,
                "data_quality_flag": valuation.data_quality_flag,
                "metadata_json": {
                    **valuation.metadata,
                    "derived": {
                        "earnings_yield": {
                            "derived": earnings_yield is not None,
                            "formula": "1 / pe_ratio * 100",
                        }
                    },
                    "snapshot_url": payload.snapshot_url,
                },
            }
        )
        return 1

    async def _persist_shareholding(self, stock: Stock, payload: ApiStockDetailsPayload) -> int:
        if payload.shareholding is None:
            return 0
        shareholding = payload.shareholding
        await self.repository.upsert_shareholding(
            {
                "stock_id": stock.id,
                "snapshot_date": shareholding.snapshot_date,
                "sponsor_director_percent": shareholding.sponsor_director_percent,
                    "government_percent": shareholding.government_percent,
                "institution_percent": shareholding.institution_percent,
                "foreign_percent": shareholding.foreign_percent,
                "public_percent": shareholding.public_percent,
                    "total_shares": shareholding.total_shares,
                    "circulating_shares": shareholding.circulating_shares,
                    "free_float_percent": shareholding.free_float_percent,
                "source": payload.source,
                "data_quality_flag": shareholding.data_quality_flag,
                "metadata_json": {
                    **shareholding.metadata,
                    "history_preserved_in_metadata": bool(shareholding.metadata.get("indexed_history")),
                    "snapshot_url": payload.snapshot_url,
                },
            }
        )
        return 1

    async def _persist_events(self, stock: Stock, payload: ApiStockDetailsPayload) -> int:
        count = 0
        for event in payload.market_events:
            await self.repository.create_or_update_market_event(
                {
                    "stock_id": stock.id,
                    "exchange": stock.exchange,
                    "event_type": event.event_type,
                    "event_date": event.event_date,
                    "title": event.title,
                    "summary": event.summary,
                    "source": payload.source,
                    "source_url": event.source_url,
                    "sentiment_score": None,
                    "metadata_json": event.metadata,
                }
            )
            count += 1
        return count

    async def _finish_job(
        self,
        job: StockDetailsSyncJob,
        *,
        status: StockDetailsSyncJobStatus,
        error_message: str | None = None,
        metadata: dict[str, object] | None = None,
        attempt_count: int | None = None,
    ) -> None:
        values: dict[str, object] = {
            "status": status,
            "completed_at": datetime.now(UTC),
            "error_message": error_message,
            "metadata_json": {**job.metadata_json, **(metadata or {})},
        }
        if attempt_count is not None:
            values["attempt_count"] = attempt_count
        await self.repository.update_sync_job(job, values)

    def _default_source(self) -> AmarStockApiStockDetailsSource:
        return AmarStockApiStockDetailsSource(
            base_url=self.settings.amarstock_api_base_url,
            snapshot_token=self.settings.amarstock_snapshot_token,
            historical_token=self.settings.amarstock_historical_token,
            company_token=self.settings.amarstock_company_token,
            historical_window_days=self.settings.stock_details_historical_window_days,
            max_retries=self.settings.stock_details_sync_max_retries,
            retry_delay_seconds=self.settings.stock_details_sync_request_delay_min_seconds,
        )

    def _skip_cadence(self, request: StockDetailsSyncRequest) -> bool:
        return (
            request.force
            or request.scope == StockDetailsSyncScope.STOCKS
            or request.trigger_type == StockDetailsSyncTriggerType.MANUAL
        )

    def _sync_cutoff(self) -> datetime:
        now = datetime.now(UTC)
        month = now.month - self.settings.stock_details_sync_frequency_months
        year = now.year
        while month <= 0:
            month += 12
            year -= 1
        return now.replace(year=year, month=month, day=min(now.day, 28))

    def _ratio_percent(self, numerator: Decimal, denominator: Decimal | None) -> Decimal | None:
        if denominator is None or denominator == 0:
            return None
        return numerator / denominator * Decimal("100")

    def _job_metadata(
        self,
        payload: ApiStockDetailsPayload,
        counts: dict[str, int],
        scope: StockDetailsSyncScope,
    ) -> dict[str, object]:
        return {
            "scope": scope.value,
            "symbol": payload.symbol,
            "urls": {
                "snapshot": payload.snapshot_url,
                "historical": payload.historical_url,
                "company": payload.company_url,
            },
            "counts": counts,
            "sections": self._section_diagnostics(payload, counts),
            "diagnostics": payload.metadata.get("diagnostics", {}),
        }

    def _section_diagnostics(
        self,
        payload: ApiStockDetailsPayload,
        counts: dict[str, int],
    ) -> dict[str, dict[str, object]]:
        diagnostics = payload.metadata.get("diagnostics", {})
        unmapped_company_rows = diagnostics.get("unmapped_company_rows", 0)
        return {
            "prices": {
                "parsed_count": len(payload.daily_prices),
                "persisted_count": counts["daily_price_count"],
                "skipped_existing_count": counts["daily_price_skipped_count"],
                "success": counts["daily_price_count"] > 0 or counts["daily_price_skipped_count"] > 0,
            },
            "metrics": {
                "parsed_count": len(payload.financial_metrics),
                "persisted_count": counts["metric_count"],
                "success": counts["metric_count"] > 0,
                "unmapped_count": unmapped_company_rows,
            },
            "stock_profile": {
                "parsed_count": 1 if payload.stock_profile is not None else 0,
                "persisted_count": counts["stock_profile_count"],
                "success": counts["stock_profile_count"] > 0,
                "source_fields": payload.stock_profile.metadata.get("source_fields", {})
                if payload.stock_profile is not None
                else {},
            },
            "valuation": {
                "parsed_count": 1 if payload.valuation is not None else 0,
                "persisted_count": counts["valuation_count"],
                "success": counts["valuation_count"] > 0,
            },
            "shareholding": {
                "parsed_count": 1 if payload.shareholding is not None else 0,
                "persisted_count": counts["shareholding_count"],
                "success": counts["shareholding_count"] > 0,
                "history_count": len(payload.shareholding.metadata.get("indexed_history", []))
                if payload.shareholding is not None
                else 0,
            },
            "events": {
                "parsed_count": len(payload.market_events),
                "persisted_count": counts["event_count"],
                "success": counts["event_count"] > 0,
            },
        }

    def _empty_section_diagnostics(self) -> dict[str, dict[str, object]]:
        return {
            section: {"parsed_count": 0, "persisted_count": 0, "success": False}
            for section in ("stock_profile", "prices", "metrics", "valuation", "shareholding", "events")
        }

    def _requested_count(self, request: StockDetailsSyncRequest, *, selected_count: int) -> int:
        if request.symbols is not None:
            return len(request.symbols)
        if request.limit is not None:
            return request.limit
        return selected_count

    def _empty_result(
        self,
        *,
        exchange: ExchangeCode,
        requested_count: int,
        skipped_count: int,
        scope: StockDetailsSyncScope,
    ) -> StockDetailsSyncResult:
        return StockDetailsSyncResult(
            exchange=exchange,
            scope=scope,
            source=AMARSTOCK_SOURCE,
            requested_count=requested_count,
            selected_count=0,
            synced_count=0,
            partial_count=0,
            failed_count=0,
            skipped_count=skipped_count,
            stock_profile_count=0,
            daily_price_count=0,
            daily_price_skipped_count=0,
            metric_count=0,
            valuation_count=0,
            shareholding_count=0,
            event_count=0,
            latest_price_profile_fill_count=0,
            latest_price_shareholding_count=0,
            latest_price_valuation_count=0,
        )


def get_stock_details_service(
    repository: StockDetailsRepository = Depends(get_stock_details_repository),
    user_context: UserContext = Depends(get_current_user_context),
    settings: Settings = Depends(get_settings),
) -> StockDetailsService:
    return StockDetailsService(repository, user_context, settings)
