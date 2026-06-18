"""Audit stock-details data coverage for fundamentals trends and ownership history.

Usage from the ``backend/`` directory::

    python -m app.scripts.audit_stock_details_coverage
    python -m app.scripts.audit_stock_details_coverage --exchange DSE --write-docs
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
os.chdir(BACKEND_ROOT)

from app.core.dotenv_loader import load_backend_dotenv

load_backend_dotenv()

logger = logging.getLogger(__name__)


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audit financial metric, valuation, and ownership history coverage.",
    )
    parser.add_argument("--exchange", default="DSE", help="Exchange code (default: DSE)")
    parser.add_argument(
        "--write-docs",
        action="store_true",
        help="Write backend/docs/stock_details_coverage.md from the audit output",
    )
    return parser.parse_args(argv)


async def _run(exchange_code: str, write_docs: bool) -> int:
    from app.core.database_session import AsyncSessionLocal
    from app.core.enums import ExchangeCode
    from app.modules.stock_details.stock_details_coverage_audit import (
        build_stock_details_coverage_report,
        format_coverage_report_markdown,
    )

    exchange = ExchangeCode(exchange_code.upper())
    async with AsyncSessionLocal() as session:
        report = await build_stock_details_coverage_report(session, exchange=exchange)

    markdown = format_coverage_report_markdown(report)
    print(markdown)

    if write_docs:
        docs_path = BACKEND_ROOT / "docs" / "stock_details_coverage.md"
        docs_path.write_text(markdown, encoding="utf-8")
        logger.info("Wrote %s", docs_path)

    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = _parse_args(argv)
    return asyncio.run(_run(args.exchange, args.write_docs))


if __name__ == "__main__":
    sys.exit(main())
