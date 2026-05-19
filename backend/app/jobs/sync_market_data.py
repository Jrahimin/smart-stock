"""Run the scheduled-equivalent daily market sync from the shell (AmarStock + optional StockNow).

Usage from the backend directory::

    python -m app.jobs.sync_market_data
    python -m app.jobs.sync_market_data --date 2026-05-02
    python -m app.jobs.sync_market_data --no-validation
"""

import argparse
import asyncio
import logging
import sys
from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.core.logging_config import configure_logging
from app.jobs.ingestion.ingest_daily_market_prices import run_daily_market_sync

logger = logging.getLogger(__name__)

DHAKA_TZ = ZoneInfo("Asia/Dhaka")


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch and upsert DSE daily prices (AmarStock; StockNow validation by default).",
    )
    parser.add_argument(
        "--date",
        metavar="YYYY-MM-DD",
        help="Trading date (default: calendar date in Asia/Dhaka now, not the machine's local timezone)",
    )
    parser.add_argument(
        "--no-validation",
        action="store_true",
        help="Skip StockNow cross-check (AmarStock-only ingest; no SOURCE_VALIDATION summary)",
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
        result = await run_daily_market_sync(
            trade_date,
            skip_validation=args.no_validation,
        )
        done_msg = (
            "Done: exchange=%s trade_date=%s source=%s fetched=%s upserted=%s "
            "skipped_existing=%s skipped_unknown_symbol=%s suspicious=%s "
            "post_news=%s post_news_skipped=%s post_lp_trade_patch=%s post_lp_missing_rows=%s"
        )
        done_args = (
            result.exchange,
            result.trade_date,
            result.source,
            result.fetched_count,
            result.created_count,
            result.skipped_existing_count,
            result.skipped_unknown_symbol_count,
            result.suspicious_count,
            result.post_news_upserted,
            result.post_news_skipped,
            result.post_latest_price_trade_fields_patched,
            result.post_latest_price_trade_rows_missing,
        )
        if result.fetched_count == 0:
            logger.error(
                done_msg
                + " — no rows from primary source (possible scraper outage, wrong trade date, or empty parse)",
                *done_args,
            )
        else:
            logger.info(done_msg, *done_args)

    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        logger.info("Interrupted")
        sys.exit(130)
    except Exception:
        logger.exception("Daily market sync failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
