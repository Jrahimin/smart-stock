import asyncio
import logging
from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import Depends

from app.api.dependencies.auth_dependencies import get_current_user_context
from app.core.enums import DataQualityFlag, ExchangeCode
from app.core.exception_handlers import NotFoundError
from app.core.security_config import UserContext
from app.jobs.ingestion.ingestion_source_base import IngestedDailyPrice, MarketDataSource
from app.models import DailyMarketSummary, DailyPrice
from app.modules.market_data.market_data_repository import MarketDataRepository, get_market_data_repository
from app.modules.market_data.market_data_schemas import (
    DailyMarketSummaryCreate,
    DailyPriceCreate,
    DailyPriceIngestionResult,
)

logger = logging.getLogger(__name__)

LTP_VALIDATION_THRESHOLD_PERCENT = Decimal("1") # 1%
SOURCE_VALIDATION_SUMMARY_INDEX = "SOURCE_VALIDATION"


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

    async def find_daily_price(self, price_data: DailyPriceCreate) -> DailyPrice | None:
        return await self.repository.get_daily_price_by_stock_date(
            stock_id=price_data.stock_id,
            trade_date=price_data.trade_date,
        )

    async def create_daily_price(self, price_data: DailyPriceCreate) -> DailyPrice:
        await self._ensure_stock_exists(price_data.stock_id)
        prepared_values = await self._prepare_daily_price_values(price_data)
        daily_price = await self.repository.create(prepared_values)
        await self.repository.commit()
        await self.repository.refresh(daily_price)
        return daily_price

    async def ingest_daily_prices(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date,
        source: MarketDataSource,
        validation_source: MarketDataSource | None = None,
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
            return DailyPriceIngestionResult(
                exchange=exchange,
                trade_date=trade_date,
                source=source.source_name,
                fetched_count=0,
                created_count=0,
                skipped_existing_count=0,
                skipped_unknown_symbol_count=0,
                suspicious_count=0,
            )

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
        skipped_unknown_symbol_count = 0

        for ingested_price in ingested_prices:
            stock = stock_by_symbol.get(self._normalize_symbol(ingested_price.symbol))
            if stock is None:
                skipped_unknown_symbol_count += 1
                continue

            price_data = self._build_daily_price_create(stock.id, ingested_price)
            prepared_values = await self._prepare_daily_price_values(price_data)
            await self.repository.upsert_daily_price(prepared_values)
            upserted_count += 1

        if validation_source is not None:
            await self._upsert_source_validation_summary(
                exchange=exchange,
                trade_date=trade_date,
                source_name=f"{source.source_name}+{validation_source.source_name}",
                suspicious_count=suspicious_count,
            )

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
        return DailyPriceIngestionResult(
            exchange=exchange,
            trade_date=trade_date,
            source=source.source_name,
            fetched_count=len(ingested_prices),
            created_count=upserted_count,
            skipped_existing_count=0,
            skipped_unknown_symbol_count=skipped_unknown_symbol_count,
            suspicious_count=suspicious_count,
        )

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
        turnover = price_data.turnover or price_data.close_price * Decimal(price_data.volume)
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


def get_market_data_service(
    repository: MarketDataRepository = Depends(get_market_data_repository),
    user_context: UserContext = Depends(get_current_user_context),
) -> MarketDataService:
    return MarketDataService(repository, user_context)

