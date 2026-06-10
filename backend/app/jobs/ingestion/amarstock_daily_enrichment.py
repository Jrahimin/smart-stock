"""Post-steps after primary daily price ingest: AmarStock News + LatestPrice trade stats (additive)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.core_config import Settings
from app.core.enums import DataQualityFlag, ExchangeCode
from app.jobs.ingestion.amarstock_latest_price_api_source import (
    AmarStockLatestPriceApiSource,
    latest_price_snapshot_date,
    turnover_decimal_from_latest_price_row,
)
from app.jobs.ingestion.amarstock_news_api_source import AmarStockNewsApiSource
from app.jobs.ingestion.amarstock_news_classifier import classify_market_event_type
from app.modules.market_data.market_data_repository import MarketDataRepository
from app.modules.stock_details.stock_details_repository import StockDetailsRepository

logger = logging.getLogger(__name__)

CLOSE_MISMATCH_THRESHOLD_PERCENT = Decimal("0.5")


@dataclass
class PostDailyAmarstockStats:
    news_upserted: int = 0
    news_skipped: int = 0
    price_trade_fields_patched: int = 0
    price_trade_rows_missing: int = 0
    index_summary_upserted: bool = False
    news_error: str | None = None
    latest_price_patch_error: str | None = None
    index_summary_error: str | None = None


async def run_post_daily_amarstock_enrichment(
    session: AsyncSession,
    *,
    exchange: ExchangeCode,
    trade_date: date,
    settings: Settings,
) -> PostDailyAmarstockStats:
    """Soft-fail each subsection; caller commits."""
    stats = PostDailyAmarstockStats()
    market_repo = MarketDataRepository(session)
    details_repo = StockDetailsRepository(session)

    if settings.amarstock_news_ingestion_enabled:
        try:
            news_stats = await _ingest_amarstock_news(
                details_repo,
                market_repo,
                exchange=exchange,
                event_date=trade_date,
                settings=settings,
            )
            stats.news_upserted = news_stats[0]
            stats.news_skipped = news_stats[1]
        except Exception as exc:
            stats.news_error = str(exc)
            logger.warning("AmarStock news ingestion failed (daily sync continues): %s", exc, exc_info=True)

    if settings.amarstock_daily_latest_price_patch_enabled:
        try:
            patch_stats = await _patch_trade_stats_from_latest_price(
                market_repo,
                exchange=exchange,
                trade_date=trade_date,
                settings=settings,
            )
            stats.price_trade_fields_patched = patch_stats[0]
            stats.price_trade_rows_missing = patch_stats[1]
        except Exception as exc:
            stats.latest_price_patch_error = str(exc)
            logger.warning(
                "AmarStock LatestPrice trade patch failed (daily sync continues): %s",
                exc,
                exc_info=True,
            )

    if settings.amarstock_index_summary_enabled:
        try:
            from app.jobs.ingestion.amarstock_index_api_source import AmarStockIndexApiSource

            snapshot = await AmarStockIndexApiSource.from_settings(settings).fetch_dsex_snapshot()
            await market_repo.upsert_daily_market_summary(
                {
                    "exchange": exchange,
                    "trade_date": trade_date,
                    "index_name": "DSEX",
                    "index_close": snapshot.index_close,
                    "index_change": snapshot.index_change,
                    "index_change_percent": snapshot.index_change_percent,
                    "total_volume": snapshot.total_volume,
                    "total_turnover": snapshot.total_turnover,
                    "total_trades": snapshot.total_trades,
                    "advancing_issues": snapshot.advancing_issues,
                    "declining_issues": snapshot.declining_issues,
                    "unchanged_issues": snapshot.unchanged_issues,
                    "source": AmarStockIndexApiSource.source_name,
                    "data_quality_flag": DataQualityFlag.OK,
                    "has_suspicious_prices": False,
                }
            )
            stats.index_summary_upserted = True
        except Exception as exc:
            stats.index_summary_error = str(exc)
            logger.warning(
                "AmarStock DSEX summary upsert failed (daily sync continues): %s",
                exc,
                exc_info=True,
            )

    return stats


async def _ingest_amarstock_news(
    details_repo: StockDetailsRepository,
    market_repo: MarketDataRepository,
    *,
    exchange: ExchangeCode,
    event_date: date,
    settings: Settings,
) -> tuple[int, int]:
    source = AmarStockNewsApiSource.from_settings(settings)
    items = await source.fetch_news()
    if not items:
        return 0, 0

    symbols = {item.scrip for item in items if item.scrip and item.scrip != "EXCH"}
    stock_by_symbol = await market_repo.get_stocks_by_symbols(exchange=exchange, symbols=symbols)

    upserted = 0
    skipped = 0
    news_source = AmarStockNewsApiSource.source_name

    for item in items:
        if not item.scrip or item.scrip == "EXCH":
            stock_id = None
            res_exchange = exchange
        else:
            stock = stock_by_symbol.get(item.scrip.upper())
            if stock is None:
                skipped += 1
                continue
            stock_id = stock.id
            res_exchange = stock.exchange

        event_type = classify_market_event_type(title=item.title, content=item.content)
        meta: dict[str, object] = {
            "is_clickable": item.is_clickable,
            "scrip": item.scrip,
            "source_api": "info/News",
        }
        combined_lower = f"{item.title}\n{item.content}".lower()
        if "agm" in combined_lower or "annual general meeting" in combined_lower:
            meta["subtype"] = "AGM"
        elif "egm" in combined_lower or "extraordinary general meeting" in combined_lower:
            meta["subtype"] = "EGM"

        await details_repo.create_or_update_market_event(
            {
                "stock_id": stock_id,
                "exchange": res_exchange,
                "event_type": event_type,
                "event_date": event_date,
                "title": item.title[:255],
                "summary": item.content or None,
                "source": news_source,
                "source_url": None,
                "sentiment_score": None,
                "metadata_json": meta,
            }
        )
        upserted += 1

    return upserted, skipped


def _close_mismatch_percent(a: Decimal, b: Decimal) -> Decimal | None:
    base = (abs(a) + abs(b)) / Decimal("2")
    if base == 0:
        return None
    return abs(a - b) / base * Decimal("100")


async def _patch_trade_stats_from_latest_price(
    market_repo: MarketDataRepository,
    *,
    exchange: ExchangeCode,
    trade_date: date,
    settings: Settings,
) -> tuple[int, int]:
    lp = AmarStockLatestPriceApiSource.from_settings(settings)
    rows = await lp.fetch_all_rows()
    if not rows:
        return 0, 0

    symbols = {row.scrip.upper() for row in rows}
    stock_by_symbol = await market_repo.get_stocks_by_symbols(exchange=exchange, symbols=symbols)

    patched = 0
    missing_row = 0
    for row in rows:
        stock = stock_by_symbol.get(row.scrip.upper())
        if stock is None:
            continue
        daily = await market_repo.get_daily_price_by_stock_date(
            stock_id=stock.id,
            trade_date=trade_date,
        )
        if daily is None:
            missing_row += 1
            continue

        turnover = turnover_decimal_from_latest_price_row(row)
        trade_count = row.trade

        dq_update: DataQualityFlag | None = None
        api_close = row.close if row.close is not None else row.ltp
        if api_close is not None and daily.close_price is not None:
            diff = _close_mismatch_percent(api_close, daily.close_price)
            if diff is not None and diff > CLOSE_MISMATCH_THRESHOLD_PERCENT:
                dq_update = DataQualityFlag.SUSPICIOUS

        if trade_count is None and turnover is None and dq_update is None:
            continue

        rows_affected = await market_repo.patch_daily_price_trade_stats(
            stock_id=stock.id,
            trade_date=trade_date,
            trade_count=trade_count,
            turnover=turnover,
            data_quality_flag=dq_update,
        )
        patched += rows_affected

    return patched, missing_row
