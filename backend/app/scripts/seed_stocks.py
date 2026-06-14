"""Seed the stocks table from AmarStock latest-share-price symbols.

Usage from the ``backend/`` directory::

    python -m app.scripts.seed_stocks
    python -m app.scripts.seed_stocks --date 2026-05-03
"""

import argparse
import asyncio
import logging
import os
import sys
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

BACKEND_ROOT = Path(__file__).resolve().parents[2]
os.chdir(BACKEND_ROOT)

logger = logging.getLogger(__name__)

DHAKA_TIMEZONE = ZoneInfo("Asia/Dhaka")


@dataclass(frozen=True)
class SeedStocksResult:
    total_symbols_fetched: int
    existing_count: int
    newly_inserted_count: int


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed missing DSE stocks from AmarStock parsed latest-share-price data.",
    )
    parser.add_argument(
        "--date",
        metavar="YYYY-MM-DD",
        help="Trade date used for AmarStock parsing metadata (default: calendar date in Asia/Dhaka)",
    )
    return parser.parse_args(argv)


def _normalize_symbols(raw_symbols: list[str]) -> set[str]:
    """Strip and uppercase; keep tickers that may include punctuation (e.g. BRK-B)."""
    symbols: set[str] = set()
    for s in raw_symbols:
        if not s:
            continue
        sym = s.strip().upper()
        if not sym or any(ch.isspace() for ch in sym):
            continue
        symbols.add(sym)
    return symbols


async def seed_stocks_from_amarstock(trade_date: date) -> SeedStocksResult:
    from app.core.database_session import AsyncSessionLocal
    from app.core.enums import ExchangeCode
    from app.core.core_config import get_settings
    from app.jobs.ingestion.market_data_source_factory import build_primary_market_data_source
    from app.modules.market_data.market_data_repository import MarketDataRepository

    source = build_primary_market_data_source(get_settings())
    parsed_prices = await source.fetch_daily_prices(trade_date)
    if not parsed_prices:
        raise RuntimeError("AmarStock returned no data")

    symbols = _normalize_symbols([price.symbol for price in parsed_prices])
    if not symbols:
        raise RuntimeError("AmarStock returned no valid symbols after normalization")

    async with AsyncSessionLocal() as session:
        try:
            repository = MarketDataRepository(session)
            existing_stocks = await repository.get_stocks_by_symbols(
                exchange=ExchangeCode.DSE,
                symbols=symbols,
            )
            missing_symbols = sorted(symbols - set(existing_stocks))

            if missing_symbols:
                logger.info("Sample missing symbols: %s", missing_symbols[:10])

            for symbol in missing_symbols:
                await repository.create_stock(
                    symbol=symbol,
                    name=symbol,
                    exchange=ExchangeCode.DSE,
                    is_active=True,
                )

            if missing_symbols:
                await repository.commit()
        except Exception:
            await session.rollback()
            raise

    return SeedStocksResult(
        total_symbols_fetched=len(symbols),
        existing_count=len(existing_stocks),
        newly_inserted_count=len(missing_symbols),
    )


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)

    from app.core.logging_config import configure_logging

    configure_logging()

    if args.date:
        try:
            trade_date = date.fromisoformat(args.date)
        except ValueError:
            logger.error("Invalid --date %r (use YYYY-MM-DD)", args.date)
            sys.exit(2)
    else:
        trade_date = datetime.now(DHAKA_TIMEZONE).date()

    async def _run() -> None:
        result = await seed_stocks_from_amarstock(trade_date)
        logger.info(
            "Stock seed complete: exchange=%s trade_date=%s total_symbols_fetched=%s "
            "existing_count=%s newly_inserted_count=%s",
            "DSE",
            trade_date,
            result.total_symbols_fetched,
            result.existing_count,
            result.newly_inserted_count,
        )

    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        logger.info("Interrupted")
        sys.exit(130)
    except RuntimeError as exc:
        logger.error("%s", exc)
        sys.exit(1)
    except Exception:
        logger.exception("Stock seed failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
