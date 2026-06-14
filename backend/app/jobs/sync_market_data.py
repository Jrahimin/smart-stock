"""Run daily market orchestration (news) or full manual sync from the shell.

Usage from the backend directory::

    python -m app.jobs.sync_market_data
    python -m app.jobs.sync_market_data --daily-only
    python -m app.jobs.sync_market_data --snapshot --daily
    python -m app.jobs.sync_market_data --date 2026-06-11
"""

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
    parser = argparse.ArgumentParser(description="Daily market orchestration (news) and optional snapshot.")
    parser.add_argument("--date", metavar="YYYY-MM-DD", help="Trading date (default: today in Asia/Dhaka)")
    parser.add_argument("--daily-only", action="store_true", help="News ingestion only (default)")
    parser.add_argument("--snapshot", action="store_true", help="Also run intraday snapshot before daily job")
    parser.add_argument(
        "--no-validation",
        action="store_true",
        help="Skip StockNow validation on snapshot when enabled in settings",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)
    configure_logging()

    if args.date:
        try:
            trade_date = date.fromisoformat(args.date)
        except ValueError:
            logger.error("Invalid --date %r (use YYYY-MM-DD)", args.date)
            sys.exit(2)
    else:
        trade_date = datetime.now(DHAKA_TZ).date()

    async def _run() -> None:
        if args.snapshot:
            snap = await sync_market_snapshot(trade_date, skip_validation=args.no_validation)
            logger.info(
                "Snapshot: fetched=%s upserted=%s dsex=%s",
                snap.fetched_count,
                snap.created_count,
                snap.index_summary_upserted,
            )
        daily = await run_daily_market_sync(
            trade_date,
            include_snapshot=False,
            skip_validation=args.no_validation,
        )
        logger.info(
            "Daily: news_upserted=%s news_skipped=%s error=%s",
            daily.news_upserted,
            daily.news_skipped,
            daily.news_error,
        )

    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        logger.info("Interrupted")
        sys.exit(130)
    except Exception:
        logger.exception("Market sync failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
