"""Structured stage timing for market compute pipelines."""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass, field
from typing import AsyncIterator, Iterator

logger = logging.getLogger(__name__)

SLOW_TOTAL_MS = 1000


@dataclass
class PerfReport:
    name: str
    stages: dict[str, float] = field(default_factory=dict)

    @property
    def total_ms(self) -> float:
        return sum(self.stages.values())

    def log_summary(self, *, level: int = logging.INFO) -> None:
        total = self.total_ms
        parts = ", ".join(f"{key}={ms:.1f}ms" for key, ms in self.stages.items())
        message = f"perf {self.name}: total={total:.1f}ms [{parts}]"
        if total >= SLOW_TOTAL_MS:
            logger.log(level, message)
        else:
            logger.debug(message)


@contextmanager
def perf_stage(report: PerfReport, stage: str) -> Iterator[None]:
    started = time.perf_counter()
    try:
        yield
    finally:
        report.stages[stage] = (time.perf_counter() - started) * 1000


@asynccontextmanager
async def async_perf_stage(report: PerfReport, stage: str) -> AsyncIterator[None]:
    started = time.perf_counter()
    try:
        yield
    finally:
        report.stages[stage] = (time.perf_counter() - started) * 1000
