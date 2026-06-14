"""Run an intraday market snapshot (prices + DSEX summary) from the shell.

Usage from the backend directory::

    python -m app.jobs.sync_market_snapshot
    python -m app.jobs.sync_market_snapshot --date 2026-06-11
    python -m app.jobs.sync_market_snapshot --no-validation
"""

import argparse
import asyncio
import logging
import sys
from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.core.logging_config import configure_logging
from app.jobs.ingestion.ingest_daily_market_prices import sync_market_snapshot

logger = logging.getLogger(__name__)
DHAKA_TZ = ZoneInfo("Asia/Dhaka")


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch and upsert intraday market snapshot (prices + DSEX).")
    parser.add_argument("--date", metavar="YYYY-MM-DD", help="Trading date (default: today in Asia/Dhaka)")
    parser.add_argument(
        "--no-validation",
        action="store_true",
        help="Skip StockNow cross-check when validation is enabled in settings",
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
        result = await sync_market_snapshot(trade_date, skip_validation=args.no_validation)
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

    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        logger.info("Interrupted")
        sys.exit(130)
    except Exception:
        logger.exception("Market snapshot sync failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
