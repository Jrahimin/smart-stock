from __future__ import annotations

import logging

from app.core.perf_timing import PerfReport, async_perf_stage, perf_stage


def test_perf_report_logs_slow_totals(caplog) -> None:
    report = PerfReport("test.pipeline")
    with perf_stage(report, "stage.a"):
        pass
    report.stages["stage.a"] = 1500.0

    with caplog.at_level(logging.INFO):
        report.log_summary()

    assert "test.pipeline" in caplog.text
    assert "1500.0ms" in caplog.text


async def test_async_perf_stage_records_elapsed() -> None:
    report = PerfReport("async.pipeline")
    async with async_perf_stage(report, "db.fetch"):
        pass
    assert "db.fetch" in report.stages
    assert report.stages["db.fetch"] >= 0
