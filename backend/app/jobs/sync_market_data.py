"""Run market snapshot (default), news-only, or snapshot + news from the shell.

Usage from the backend directory::

    python -m app.jobs.sync_market_data
    python -m app.jobs.sync_market_data --with-news
    python -m app.jobs.sync_market_data --news-only
    python -m app.jobs.sync_market_data --date 2026-06-11
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.core.logging_config import configure_logging
from app.jobs.ingestion.ingest_daily_market_prices import run_daily_market_sync, sync_market_snapshot

logger = logging.getLogger(__name__)
DHAKA_TZ = ZoneInfo("Asia/Dhaka")


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Market snapshot (prices + DSEX) by default; optional news ingestion.",
    )
    parser.add_argument("--date", metavar="YYYY-MM-DD", help="Trade date label (default: today in Asia/Dhaka)")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--news-only",
        action="store_true",
        help="Ingest AmarStock news only (no price snapshot)",
    )
    mode.add_argument(
        "--with-news",
        action="store_true",
        help="Run snapshot first, then news",
    )
    parser.add_argument(
        "--no-validation",
        action="store_true",
        help="Skip StockNow validation on snapshot when enabled in settings",
    )
    return parser.parse_args(argv)


def _resolve_trade_date(raw: str | None) -> date:
    if raw:
        return date.fromisoformat(raw)
    return datetime.now(DHAKA_TZ).date()


def _warn_snapshot_past_date(trade_date: date) -> None:
    today = datetime.now(DHAKA_TZ).date()
    if trade_date < today:
        logger.warning(
            "Snapshot sync fetches live AmarStock prices; --date only sets the stored trade_date. "
            "For true historical OHLCV use: python -m app.jobs.backfill_daily_prices --date %s",
            trade_date.isoformat(),
        )


async def _run_snapshot(trade_date: date, *, skip_validation: bool) -> None:
    result = await sync_market_snapshot(trade_date, skip_validation=skip_validation)
    logger.info(
        "Snapshot done: trade_date=%s source=%s fetched=%s upserted=%s unknown=%s "
        "suspicious=%s dsex_upserted=%s dsex_error=%s",
        result.trade_date,
        result.source,
        result.fetched_count,
        result.created_count,
        result.skipped_unknown_symbol_count,
        result.suspicious_count,
        result.index_summary_upserted,
        result.index_summary_error,
    )
    if result.fetched_count == 0:
        logger.error("No rows from primary source (possible API outage or empty parse)")


async def _run_news(trade_date: date) -> None:
    daily = await run_daily_market_sync(trade_date, include_snapshot=False)
    logger.info(
        "News sync done: news_upserted=%s news_skipped=%s error=%s",
        daily.news_upserted,
        daily.news_skipped,
        daily.news_error,
    )


async def _run(args: argparse.Namespace) -> None:
    trade_date = _resolve_trade_date(args.date)

    if args.news_only:
        await _run_news(trade_date)
        return

    _warn_snapshot_past_date(trade_date)
    await _run_snapshot(trade_date, skip_validation=args.no_validation)
    if args.with_news:
        await _run_news(trade_date)


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)
    configure_logging()

    if args.date:
        try:
            _resolve_trade_date(args.date)
        except ValueError:
            logger.error("Invalid --date %r (use YYYY-MM-DD)", args.date)
            sys.exit(2)

    try:
        asyncio.run(_run(args))
    except KeyboardInterrupt:
        logger.info("Interrupted")
        sys.exit(130)
    except Exception:
        logger.exception("Market sync failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
