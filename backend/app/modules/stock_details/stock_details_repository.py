from datetime import date, datetime
from uuid import UUID

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_repository import BaseRepository
from app.core.constants.trading_constants import DECISION_OHLCV_WINDOW
from app.core.database_session import get_db_session
from app.core.enums import ExchangeCode, IndicatorType, MarketEventType, StockDetailsSyncJobStatus
from app.modules.stock_details.decision.fundamentals_snapshot import LatestFinancialMetricRow
from app.modules.stock_details.decision.financial_trends import FinancialMetricHistoryRow
from app.models import (
    CorporateAction,
    DailyPrice,
    DividendEvent,
    FinancialMetricDefinition,
    FinancialMetricValue,
    FinancialReport,
    MarketEvent,
    ShareholdingSnapshot,
    Stock,
    StockDetailsSyncJob,
    TechnicalIndicator,
    TradingSignal,
    ValuationSnapshot,
)


class StockDetailsRepository(BaseRepository[StockDetailsSyncJob]):
    model = StockDetailsSyncJob

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_stock_by_exchange_symbol(self, *, exchange: ExchangeCode, symbol: str) -> Stock | None:
        statement = select(Stock).where(
            Stock.exchange == exchange,
            func.upper(Stock.symbol) == symbol.upper(),
        )
        return await self.session.scalar(statement)

    async def list_daily_prices_window(self, *, stock_id: UUID, limit: int = DECISION_OHLCV_WINDOW) -> list[DailyPrice]:
        statement = (
            select(DailyPrice)
            .where(DailyPrice.stock_id == stock_id)
            .order_by(DailyPrice.trade_date.desc(), DailyPrice.id.desc())
            .limit(limit)
        )
        result = await self.session.scalars(statement)
        return list(reversed(result.all()))

    async def get_latest_trading_signal(self, stock_id: UUID) -> TradingSignal | None:
        statement = (
            select(TradingSignal)
            .where(TradingSignal.stock_id == stock_id, TradingSignal.is_active.is_(True))
            .order_by(TradingSignal.trade_date.desc(), TradingSignal.updated_at.desc())
            .limit(1)
        )
        return await self.session.scalar(statement)

    async def get_latest_indicator(
        self,
        *,
        stock_id: UUID,
        indicator_type: IndicatorType,
        period: int,
    ) -> TechnicalIndicator | None:
        statement = (
            select(TechnicalIndicator)
            .where(
                TechnicalIndicator.stock_id == stock_id,
                TechnicalIndicator.indicator_type == indicator_type,
                TechnicalIndicator.period == period,
            )
            .order_by(TechnicalIndicator.trade_date.desc(), TechnicalIndicator.updated_at.desc())
            .limit(1)
        )
        return await self.session.scalar(statement)

    async def get_latest_shareholding_snapshot(self, stock_id: UUID) -> ShareholdingSnapshot | None:
        statement = (
            select(ShareholdingSnapshot)
            .where(ShareholdingSnapshot.stock_id == stock_id)
            .order_by(ShareholdingSnapshot.snapshot_date.desc(), ShareholdingSnapshot.updated_at.desc())
            .limit(1)
        )
        return await self.session.scalar(statement)

    async def get_latest_valuation_snapshot(self, stock_id: UUID) -> ValuationSnapshot | None:
        statement = (
            select(ValuationSnapshot)
            .where(ValuationSnapshot.stock_id == stock_id)
            .order_by(ValuationSnapshot.valuation_date.desc(), ValuationSnapshot.updated_at.desc())
            .limit(1)
        )
        return await self.session.scalar(statement)

    async def list_market_events(self, *, stock_id: UUID, limit: int = 20) -> list[MarketEvent]:
        statement = (
            select(MarketEvent)
            .where(MarketEvent.stock_id == stock_id)
            .order_by(MarketEvent.event_date.desc(), MarketEvent.updated_at.desc())
            .limit(limit)
        )
        return list((await self.session.scalars(statement)).all())

    async def list_dividend_events(self, *, stock_id: UUID, limit: int = 10) -> list[DividendEvent]:
        statement = (
            select(DividendEvent)
            .where(DividendEvent.stock_id == stock_id)
            .order_by(DividendEvent.declaration_date.desc(), DividendEvent.updated_at.desc())
            .limit(limit)
        )
        return list((await self.session.scalars(statement)).all())

    async def list_corporate_actions(self, *, stock_id: UUID, limit: int = 10) -> list[CorporateAction]:
        statement = (
            select(CorporateAction)
            .where(CorporateAction.stock_id == stock_id)
            .order_by(CorporateAction.announcement_date.desc(), CorporateAction.updated_at.desc())
            .limit(limit)
        )
        return list((await self.session.scalars(statement)).all())

    async def list_latest_metric_values(
        self,
        *,
        stock_id: UUID,
        metric_codes: list[str],
    ) -> list[LatestFinancialMetricRow]:
        if not metric_codes:
            return []

        statement = (
            select(
                FinancialMetricDefinition.metric_code,
                FinancialMetricDefinition.display_name,
                FinancialMetricValue.value,
                FinancialMetricValue.as_of_date,
                FinancialReport.fiscal_year,
                FinancialMetricValue.updated_at,
            )
            .join(
                FinancialMetricDefinition,
                FinancialMetricValue.metric_definition_id == FinancialMetricDefinition.id,
            )
            .join(
                FinancialReport,
                FinancialMetricValue.financial_report_id == FinancialReport.id,
            )
            .where(
                FinancialReport.stock_id == stock_id,
                FinancialMetricDefinition.metric_code.in_(metric_codes),
            )
            .order_by(
                FinancialMetricDefinition.metric_code,
                FinancialMetricValue.as_of_date.desc(),
                FinancialMetricValue.updated_at.desc(),
            )
        )
        result = await self.session.execute(statement)
        latest_by_code: dict[str, LatestFinancialMetricRow] = {}
        for metric_code, display_name, value, as_of_date, fiscal_year, _updated_at in result.all():
            if metric_code in latest_by_code:
                continue
            latest_by_code[metric_code] = LatestFinancialMetricRow(
                metric_code=metric_code,
                display_name=display_name,
                value=value,
                as_of_date=as_of_date,
                fiscal_year=fiscal_year,
            )

        return [latest_by_code[code] for code in metric_codes if code in latest_by_code]

    async def list_metric_histories(
        self,
        *,
        stock_id: UUID,
        metric_codes: list[str],
        limit_per_code: int = 5,
    ) -> dict[str, list[FinancialMetricHistoryRow]]:
        if not metric_codes or limit_per_code <= 0:
            return {code: [] for code in metric_codes}

        statement = (
            select(
                FinancialMetricDefinition.metric_code,
                FinancialMetricDefinition.display_name,
                FinancialMetricValue.value,
                FinancialReport.fiscal_year,
                FinancialMetricValue.as_of_date,
            )
            .join(
                FinancialMetricDefinition,
                FinancialMetricValue.metric_definition_id == FinancialMetricDefinition.id,
            )
            .join(
                FinancialReport,
                FinancialMetricValue.financial_report_id == FinancialReport.id,
            )
            .where(
                FinancialReport.stock_id == stock_id,
                FinancialMetricDefinition.metric_code.in_(metric_codes),
            )
            .order_by(
                FinancialMetricDefinition.metric_code,
                FinancialReport.fiscal_year.desc(),
                FinancialMetricValue.as_of_date.desc(),
            )
        )
        result = await self.session.execute(statement)
        grouped: dict[str, list[FinancialMetricHistoryRow]] = {code: [] for code in metric_codes}
        seen_years: dict[str, set[int]] = {code: set() for code in metric_codes}

        for metric_code, display_name, value, fiscal_year, _as_of_date in result.all():
            if metric_code not in grouped:
                continue
            if fiscal_year in seen_years[metric_code]:
                continue
            if len(grouped[metric_code]) >= limit_per_code:
                continue
            seen_years[metric_code].add(fiscal_year)
            grouped[metric_code].append(
                FinancialMetricHistoryRow(
                    metric_code=metric_code,
                    display_name=display_name,
                    value=value,
                    fiscal_year=fiscal_year,
                )
            )

        return grouped

    async def list_active_stocks_in_sector(
        self,
        *,
        exchange: ExchangeCode,
        sector: str,
        exclude_stock_id: UUID | None = None,
    ) -> list[Stock]:
        statement = select(Stock).where(
            Stock.exchange == exchange,
            Stock.is_active.is_(True),
            Stock.sector == sector,
        )
        if exclude_stock_id is not None:
            statement = statement.where(Stock.id != exclude_stock_id)
        result = await self.session.scalars(statement)
        return list(result.all())

    async def list_active_stocks_on_exchange(self, *, exchange: ExchangeCode) -> list[Stock]:
        statement = select(Stock).where(
            Stock.exchange == exchange,
            Stock.is_active.is_(True),
        )
        result = await self.session.scalars(statement)
        return list(result.all())

    async def list_recent_daily_prices_for_stocks(
        self,
        stock_ids: list[UUID],
        *,
        limit_per_stock: int,
    ) -> dict[UUID, list[DailyPrice]]:
        if not stock_ids or limit_per_stock <= 0:
            return {}

        statement = (
            select(DailyPrice)
            .where(DailyPrice.stock_id.in_(stock_ids))
            .order_by(
                DailyPrice.stock_id,
                DailyPrice.trade_date.desc(),
                DailyPrice.id.desc(),
            )
        )
        result = await self.session.scalars(statement)
        grouped: dict[UUID, list[DailyPrice]] = {stock_id: [] for stock_id in stock_ids}
        for price in result.all():
            bucket = grouped.get(price.stock_id)
            if bucket is None or len(bucket) >= limit_per_stock:
                continue
            bucket.append(price)
        return grouped

    async def list_eps_yoy_growth_for_stocks(self, stock_ids: list[UUID]) -> dict[UUID, float | None]:
        if not stock_ids:
            return {}

        statement = (
            select(
                FinancialReport.stock_id,
                FinancialReport.fiscal_year,
                FinancialMetricValue.value,
            )
            .join(
                FinancialMetricValue,
                FinancialMetricValue.financial_report_id == FinancialReport.id,
            )
            .join(
                FinancialMetricDefinition,
                FinancialMetricValue.metric_definition_id == FinancialMetricDefinition.id,
            )
            .where(
                FinancialReport.stock_id.in_(stock_ids),
                FinancialMetricDefinition.metric_code == "EPS",
                FinancialMetricValue.value.is_not(None),
                FinancialMetricValue.value != 0,
            )
            .order_by(
                FinancialReport.stock_id,
                FinancialReport.fiscal_year.desc(),
            )
        )
        result = await self.session.execute(statement)
        eps_by_year: dict[UUID, list[tuple[int, float]]] = {stock_id: [] for stock_id in stock_ids}
        seen_years: dict[UUID, set[int]] = {stock_id: set() for stock_id in stock_ids}

        for stock_id, fiscal_year, value in result.all():
            if stock_id not in eps_by_year:
                continue
            if fiscal_year in seen_years[stock_id]:
                continue
            if len(eps_by_year[stock_id]) >= 2:
                continue
            seen_years[stock_id].add(fiscal_year)
            eps_by_year[stock_id].append((fiscal_year, float(value)))

        growth: dict[UUID, float | None] = {}
        for stock_id, years in eps_by_year.items():
            if len(years) < 2:
                growth[stock_id] = None
                continue
            latest_eps = years[0][1]
            previous_eps = years[1][1]
            if previous_eps == 0:
                growth[stock_id] = None
            else:
                growth[stock_id] = ((latest_eps - previous_eps) / abs(previous_eps)) * 100
        return growth

    async def list_latest_valuation_snapshots_for_stocks(
        self,
        stock_ids: list[UUID],
    ) -> dict[UUID, ValuationSnapshot]:
        if not stock_ids:
            return {}

        statement = (
            select(ValuationSnapshot)
            .where(ValuationSnapshot.stock_id.in_(stock_ids))
            .order_by(
                ValuationSnapshot.stock_id,
                ValuationSnapshot.valuation_date.desc(),
                ValuationSnapshot.updated_at.desc(),
            )
        )
        result = await self.session.scalars(statement)
        latest: dict[UUID, ValuationSnapshot] = {}
        for snapshot in result.all():
            if snapshot.stock_id not in latest:
                latest[snapshot.stock_id] = snapshot
        return latest

    async def list_due_stocks(
        self,
        *,
        exchange: ExchangeCode,
        cutoff: datetime,
        limit: int | None,
        offset: int,
    ) -> list[Stock]:
        latest_completed = (
            select(func.max(StockDetailsSyncJob.completed_at))
            .where(
                StockDetailsSyncJob.stock_id == Stock.id,
                StockDetailsSyncJob.status.in_(
                    [StockDetailsSyncJobStatus.SUCCEEDED, StockDetailsSyncJobStatus.PARTIAL]
                ),
            )
            .correlate(Stock)
            .scalar_subquery()
        )
        statement = (
            select(Stock)
            .where(
                Stock.exchange == exchange,
                Stock.is_active.is_(True),
                Stock.should_fetch_details.is_(True),
                (latest_completed.is_(None) | (latest_completed < cutoff)),
            )
            .order_by(Stock.exchange, Stock.symbol, Stock.id)
            .offset(offset)
        )
        if limit is not None:
            statement = statement.limit(limit)
        result = await self.session.scalars(statement)
        return list(result.all())

    async def list_eligible_stocks(
        self,
        *,
        exchange: ExchangeCode,
        limit: int | None,
        offset: int,
    ) -> list[Stock]:
        """Active detail-enabled stocks, ordered for batch runs, without last-sync cadence."""
        statement = (
            select(Stock)
            .where(
                Stock.exchange == exchange,
                Stock.is_active.is_(True),
                Stock.should_fetch_details.is_(True),
            )
            .order_by(Stock.exchange, Stock.symbol, Stock.id)
            .offset(offset)
        )
        if limit is not None:
            statement = statement.limit(limit)
        result = await self.session.scalars(statement)
        return list(result.all())

    async def get_stocks_by_symbols(
        self,
        *,
        exchange: ExchangeCode,
        symbols: set[str],
    ) -> dict[str, Stock]:
        if not symbols:
            return {}
        statement = select(Stock).where(
            Stock.exchange == exchange,
            func.upper(Stock.symbol).in_({symbol.upper() for symbol in symbols}),
        )
        result = await self.session.scalars(statement)
        return {stock.symbol.upper(): stock for stock in result.all()}

    async def get_latest_completed_job(self, stock_id: UUID) -> StockDetailsSyncJob | None:
        statement = (
            select(StockDetailsSyncJob)
            .where(
                StockDetailsSyncJob.stock_id == stock_id,
                StockDetailsSyncJob.status.in_(
                    [StockDetailsSyncJobStatus.SUCCEEDED, StockDetailsSyncJobStatus.PARTIAL]
                ),
            )
            .order_by(StockDetailsSyncJob.completed_at.desc(), StockDetailsSyncJob.id.desc())
            .limit(1)
        )
        return await self.session.scalar(statement)

    async def update_sync_job(
        self,
        job: StockDetailsSyncJob,
        values: dict[str, object],
    ) -> StockDetailsSyncJob:
        return await self.update(job, values)

    async def update_stock_profile(self, stock: Stock, values: dict[str, object]) -> Stock:
        for key, value in values.items():
            setattr(stock, key, value)
        await self.session.flush()
        return stock

    async def insert_daily_price_if_absent(self, values: dict[str, object]) -> DailyPrice | None:
        statement = insert(DailyPrice).values(**values)
        statement = statement.on_conflict_do_nothing(
            index_elements=[DailyPrice.stock_id, DailyPrice.trade_date],
        ).returning(DailyPrice)
        return await self.session.scalar(statement)

    async def upsert_metric_definition(self, values: dict[str, object]) -> FinancialMetricDefinition:
        return await self._upsert(
            FinancialMetricDefinition,
            values,
            [FinancialMetricDefinition.metric_code],
            exclude_update={"metric_code"},
        )

    async def create_or_update_financial_report(self, values: dict[str, object]) -> FinancialReport:
        statement = select(FinancialReport).where(
            FinancialReport.stock_id == values["stock_id"],
            FinancialReport.fiscal_year == values["fiscal_year"],
            FinancialReport.period_type == values["period_type"],
            FinancialReport.period_end_date == values["period_end_date"],
            FinancialReport.report_status == values["report_status"],
        )
        report = await self.session.scalar(statement)
        if report is None:
            return await self.create_model(FinancialReport, values)

        for key in ("period_start_date", "published_date", "currency", "source", "data_quality_flag"):
            setattr(report, key, values[key])
        report.metadata_json = {**report.metadata_json, **values.get("metadata_json", {})}
        await self.session.flush()
        return report

    async def upsert_metric_value(self, values: dict[str, object]) -> FinancialMetricValue:
        return await self._upsert(
            FinancialMetricValue,
            values,
            [
                FinancialMetricValue.financial_report_id,
                FinancialMetricValue.metric_definition_id,
                FinancialMetricValue.as_of_date,
            ],
        )

    async def upsert_valuation(self, values: dict[str, object]) -> ValuationSnapshot:
        return await self._upsert(
            ValuationSnapshot,
            values,
            [ValuationSnapshot.stock_id, ValuationSnapshot.valuation_date, ValuationSnapshot.source],
        )

    async def upsert_shareholding(self, values: dict[str, object]) -> ShareholdingSnapshot:
        return await self._upsert(
            ShareholdingSnapshot,
            values,
            [ShareholdingSnapshot.stock_id, ShareholdingSnapshot.snapshot_date, ShareholdingSnapshot.source],
        )

    async def create_or_update_market_event(self, values: dict[str, object]) -> MarketEvent:
        statement = insert(MarketEvent).values(**values)
        update_values = {
            column.name: statement.excluded[column.name]
            for column in MarketEvent.__table__.columns
            if column.name not in {"id", "created_at", "stock_id", "event_date", "title", "source"}
        }
        update_values["updated_at"] = func.now()
        statement = statement.on_conflict_do_update(
            index_elements=[
                MarketEvent.stock_id,
                MarketEvent.event_date,
                MarketEvent.title,
                MarketEvent.source,
            ],
            set_=update_values,
        ).returning(MarketEvent)
        event = await self.session.scalar(statement)
        if event is None:
            raise RuntimeError("Market event upsert did not return a row")
        return event

    async def _upsert(
        self,
        model: type,
        values: dict[str, object],
        index_elements: list[object],
        *,
        exclude_update: set[str] | None = None,
    ):
        statement = insert(model).values(**values)
        excluded = {"id", "created_at", *(exclude_update or set())}
        update_values = {
            column.name: statement.excluded[column.name]
            for column in model.__table__.columns
            if column.name not in excluded
        }
        update_values["updated_at"] = func.now()
        statement = statement.on_conflict_do_update(
            index_elements=index_elements,
            set_=update_values,
        ).returning(model)
        entity = await self.session.scalar(statement)
        if entity is None:
            raise RuntimeError(f"{model.__name__} upsert did not return a row")
        return entity


def get_stock_details_repository(
    session: AsyncSession = Depends(get_db_session),
) -> StockDetailsRepository:
    return StockDetailsRepository(session)
