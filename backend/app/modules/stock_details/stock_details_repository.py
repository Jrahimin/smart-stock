from datetime import datetime
from uuid import UUID

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_repository import BaseRepository
from app.core.database_session import get_db_session
from app.core.enums import ExchangeCode, MarketEventType, StockDetailsSyncJobStatus
from app.models import (
    DailyPrice,
    FinancialMetricDefinition,
    FinancialMetricValue,
    FinancialReport,
    MarketEvent,
    ShareholdingSnapshot,
    Stock,
    StockDetailsSyncJob,
    ValuationSnapshot,
)


class StockDetailsRepository(BaseRepository[StockDetailsSyncJob]):
    model = StockDetailsSyncJob

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

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

    async def upsert_daily_price(self, values: dict[str, object]) -> DailyPrice:
        return await self._upsert(DailyPrice, values, [DailyPrice.stock_id, DailyPrice.trade_date])

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
