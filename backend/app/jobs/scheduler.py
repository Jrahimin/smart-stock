"""Standalone scheduler process. Invoke: python -m app.jobs.scheduler"""

from __future__ import annotations

import asyncio
import logging
import signal
import sys

from app.core.core_config import get_settings
from app.core.logging_config import configure_logging
from app.jobs.scheduler_runtime import start_application_schedulers, stop_application_schedulers

logger = logging.getLogger(__name__)


async def _run_scheduler_process() -> None:
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop_event.set)

    await start_application_schedulers()
    logger.info("Scheduler process ready — waiting for shutdown signal")

    await stop_event.wait()
    logger.info("Scheduler shutdown signal received")
    await stop_application_schedulers()
    logger.info("Scheduler process stopped cleanly")


def main() -> None:
    configure_logging()
    settings = get_settings()

    if not settings.run_scheduler:
        logger.error(
            "RUN_SCHEDULER is false — this process must not start without RUN_SCHEDULER=true. Exiting."
        )
        sys.exit(1)

    logger.info("Scheduler process starting (RUN_SCHEDULER=true)")

    try:
        asyncio.run(_run_scheduler_process())
    except Exception:
        logger.exception("Scheduler initialization or runtime failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
