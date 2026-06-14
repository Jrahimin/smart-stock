"""Backfill historical daily OHLCV from the DSE day-end archive.

Usage from the backend directory::

    python -m app.jobs.backfill_daily_prices --date 2026-05-15
    python -m app.jobs.backfill_daily_prices --from 2026-05-01 --to 2026-05-15
    python -m app.jobs.backfill_daily_prices --date 2026-05-15 --overwrite
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import date

from app.core.logging_config import configure_logging
from app.jobs.ingestion.ingest_daily_market_prices import backfill_daily_prices

logger = logging.getLogger(__name__)


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill historical daily prices from the DSE day-end archive.",
    )
    parser.add_argument("--date", metavar="YYYY-MM-DD", help="Single trading date to backfill")
    parser.add_argument("--from", dest="from_date", metavar="YYYY-MM-DD", help="Range start (inclusive)")
    parser.add_argument("--to", dest="to_date", metavar="YYYY-MM-DD", help="Range end (inclusive)")
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Upsert rows (default: insert only when stock_id+trade_date is missing)",
    )
    return parser.parse_args(argv)


def _resolve_dates(args: argparse.Namespace) -> tuple[date, date | None]:
    if args.date and (args.from_date or args.to_date):
        raise ValueError("Use either --date or --from/--to, not both")

    if args.date:
        trade_date = date.fromisoformat(args.date)
        return trade_date, None

    if args.from_date and args.to_date:
        start = date.fromisoformat(args.from_date)
        end = date.fromisoformat(args.to_date)
        return start, end

    raise ValueError("Provide --date YYYY-MM-DD or --from YYYY-MM-DD --to YYYY-MM-DD")


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)
    configure_logging()

    try:
        start_date, end_date = _resolve_dates(args)
    except ValueError as exc:
        logger.error("%s", exc)
        sys.exit(2)

    async def _run() -> None:
        result = await backfill_daily_prices(
            start_date,
            end_date=end_date,
            insert_only=not args.overwrite,
        )
        logger.info(
            "Backfill complete: source=%s fetched=%s inserted=%s skipped_existing=%s skipped_unknown=%s",
            result.source,
            result.fetched_count,
            result.created_count,
            result.skipped_existing_count,
            result.skipped_unknown_symbol_count,
        )
        if result.fetched_count == 0:
            logger.error("No prices fetched — check dates (weekends/holidays) or DSE archive availability")

    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        logger.info("Interrupted")
        sys.exit(130)
    except Exception:
        logger.exception("Daily price backfill failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
