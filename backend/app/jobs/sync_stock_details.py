import argparse
import asyncio
import logging

from app.core.enums import ExchangeCode, StockDetailsSyncScope, StockDetailsSyncTriggerType
from app.jobs.ingest_stock_details import ingest_stock_details

logger = logging.getLogger(__name__)


def _parse_symbols(value: str | None) -> list[str] | None:
    if value is None:
        return None
    symbols = [symbol.strip().upper() for symbol in value.split(",") if symbol.strip()]
    return symbols or None


async def _run(args: argparse.Namespace) -> int:
    try:
        result = await ingest_stock_details(
            exchange=args.exchange,
            symbols=_parse_symbols(args.symbols),
            limit=args.limit,
            offset=args.offset,
            historical_window_days=args.historical_window_days,
            force=args.force,
            trigger_type=StockDetailsSyncTriggerType.MANUAL,
            scope=args.scope,
        )
    except KeyboardInterrupt:
        return 130
    except Exception:
        logger.exception("Stock details sync failed")
        return 1

    logger.info(
        "Stock details sync completed: scope=%s selected=%s synced=%s partial=%s failed=%s skipped=%s "
        "profiles=%s prices=%s prices_skipped=%s metrics=%s valuations=%s shareholding=%s events=%s",
        result.scope.value,
        result.selected_count,
        result.synced_count,
        result.partial_count,
        result.failed_count,
        result.skipped_count,
        result.stock_profile_count,
        result.daily_price_count,
        result.daily_price_skipped_count,
        result.metric_count,
        result.valuation_count,
        result.shareholding_count,
        result.event_count,
    )
    return 0 if result.failed_count == 0 else 1


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync AmarStock API stock details.")
    parser.add_argument("--symbols", help="Comma-separated symbols, e.g. EBL,GP")
    parser.add_argument("--exchange", type=ExchangeCode, default=ExchangeCode.DSE)
    parser.add_argument("--limit", type=int, default=30)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument(
        "--historical-window-days",
        type=int,
        help="Override the configured historical price backfill window for this run",
    )
    parser.add_argument("--force", action="store_true", help="Ignore cadence for scheduled/API runs (manual CLI always skips cadence)")
    parser.add_argument(
        "--scope",
        type=StockDetailsSyncScope,
        choices=list(StockDetailsSyncScope),
        default=StockDetailsSyncScope.FULL,
        help="full: persist prices, fundamentals, snapshots, events (default). "
        "stocks: only fill empty columns on stocks from snapshot + LatestPrice profile merge; skip other tables; "
        "ignore cadence for stock selection (still requires active + should_fetch_details).",
    )
    args = parser.parse_args()
    raise SystemExit(asyncio.run(_run(args)))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
