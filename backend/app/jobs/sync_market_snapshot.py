"""Deprecated CLI alias — use ``python -m app.jobs.sync_market_data`` instead."""

from __future__ import annotations

import logging
import sys

from app.jobs.sync_market_data import main as sync_market_data_main

logger = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> None:
    logger.warning(
        "sync_market_snapshot is deprecated; use python -m app.jobs.sync_market_data instead",
    )
    sync_market_data_main(argv)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main(sys.argv[1:])
