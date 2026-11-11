"""Check the current canonical universe cache and immutable snapshot identities.

Usage from ``backend/``::

    python -m app.scripts.check_trading_intelligence --exchange DSE
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from dataclasses import asdict
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
os.chdir(BACKEND_ROOT)

from app.core.dotenv_loader import load_backend_dotenv  # noqa: E402

load_backend_dotenv()


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check universe lineage, freshness, snapshots, and cross-surface identity.",
    )
    parser.add_argument("--exchange", default="DSE", choices=("DSE", "CSE"))
    parser.add_argument(
        "--inspect-only",
        action="store_true",
        default=True,
        help="Read-only inspection; never schedules a rebuild (default).",
    )
    parser.add_argument("--capture-inventory", action="store_true", help="Inspect durable inputs and matching-version parity without Redis")
    parser.add_argument("--all-members", action="store_true", help="Check every published member rather than eligible/blocked examples")
    parser.add_argument("--start", type=__import__("datetime").date.fromisoformat)
    parser.add_argument("--end", type=__import__("datetime").date.fromisoformat)
    parser.add_argument("--output", type=Path)
    return parser.parse_args(argv)


async def _run(args: argparse.Namespace) -> int:
    if args.capture_inventory:
        return await _run_inventory(args)
    from app.core.constants.trading_constants import TRADING_STRATEGY_VERSION
    from app.core.core_config import get_settings
    from app.core.database_session import AsyncSessionLocal
    from app.core.enums import ExchangeCode
    from app.core.redis_client import build_redis_client
    from app.modules.market_data.market_data_repository import MarketDataRepository
    from app.modules.market_universe.market_universe_service import (
        MarketUniverseService,
        UniverseCacheUnavailableError,
    )
    from app.modules.stocks.stocks_repository import StocksRepository
    from app.modules.stock_details.stock_details_schemas import CanonicalDecisionResultRead
    from app.modules.trading_intelligence.decision_snapshot_repository import (
        DecisionSnapshotRepository,
    )
    from app.modules.trading_intelligence.monitoring import (
        build_decision_funnel,
        monitor_universe_payload,
    )

    exchange = ExchangeCode(args.exchange)
    redis = build_redis_client(get_settings())
    async with AsyncSessionLocal() as session:
        market_repository = MarketDataRepository(session)
        snapshot_repository = DecisionSnapshotRepository(session)
        universe_service = MarketUniverseService(
            market_repository,
            StocksRepository(session),
            redis,
            get_settings(),
            snapshot_repository,
        )
        try:
            canonical = await universe_service.get_canonical_universe(
                exchange=exchange, allow_rebuild=False
            )
        except UniverseCacheUnavailableError as exc:
            print(
                json.dumps(
                    {"healthy": False, "error": "UNIVERSE_CACHE_UNAVAILABLE", "detail": str(exc)}
                )
            )
            return 2
        payload = canonical.payload
        session_date = canonical.generation.trade_date
        last_synced_at = canonical.generation.source_last_synced_at
        previous_payload = await universe_service.previous_finalized_publication(
            exchange=exchange, before_date=session_date
        )
        snapshots = []
        if session_date is not None:
            snapshots = await snapshot_repository.list_for_session(
                exchange=exchange,
                as_of_date=session_date,
                strategy_version=TRADING_STRATEGY_VERSION,
            )

    cross_surface_results = tuple(
        CanonicalDecisionResultRead.model_validate(snapshot.result_payload)
        for snapshot in snapshots
        if snapshot.shared_decision_id
        in {
            row.decision.canonical.shared_decision_id
            for row in payload.rows
            if row.decision and row.decision.canonical
        }
    )
    report = monitor_universe_payload(
        payload,
        expected_session_date=session_date,
        expected_source_last_synced_at=last_synced_at,
        cross_surface_results=cross_surface_results,
        previous_payload=previous_payload,
    )
    funnel = build_decision_funnel(payload.rows)
    print(
        json.dumps(
            {
                "healthy": report.is_healthy,
                "decision_generation_id": canonical.generation.sync_id,
                "decision_status": "UPDATING" if canonical.updating else "CURRENT",
                "previous_finalized_session": str(previous_payload.decision_session_date)
                if previous_payload
                else None,
                "has_errors": report.has_errors,
                "issues": [asdict(issue) for issue in report.issues],
                "snapshot_count": len(snapshots),
                "decision_funnel": {
                    **asdict(funnel),
                    "reconciles": funnel.reconciles,
                },
            },
            sort_keys=True,
        )
    )
    return 1 if report.has_errors else 0


async def _run_inventory(args):
    from datetime import datetime, time
    from zoneinfo import ZoneInfo
    from sqlalchemy import func, select, text
    from app.core.database_session import AsyncSessionLocal
    from app.core.enums import ExchangeCode
    from app.core.core_config import get_settings
    from app.models import TradingSourceObservation
    from app.modules.market_data.market_data_repository import MarketDataRepository
    from app.modules.trading_intelligence.decision_snapshot_repository import DecisionSnapshotRepository
    from app.modules.trading_intelligence.capture_inventory import capture_inventory
    exchange = ExchangeCode(args.exchange)
    async with AsyncSessionLocal() as session:
        await session.execute(text("SET TRANSACTION READ ONLY"))
        repository = MarketDataRepository(session)
        restore_end = await repository.get_latest_finalized_session_date(exchange=exchange)
        end = args.end or restore_end
        captures = await DecisionSnapshotRepository(session).list_captures(exchange=exchange, start_date=args.start, end_date=end)
        expected = await repository.list_recent_exchange_session_dates(exchange=exchange, limit=5000, end_date=end)
        expected = [day for day in expected if (args.start is None or day >= args.start)]
        report = capture_inventory(captures, expected_sessions=expected, all_members=args.all_members)
        report["restore_end_date"] = str(restore_end)
        report["report_observed_at"] = datetime.now(ZoneInfo("UTC")).isoformat()
        close_time = time.fromisoformat(get_settings().market_close_time)
        for capture, item in zip(captures, report["captures"], strict=True):
            close = datetime.combine(capture.session_date, close_time, tzinfo=ZoneInfo("Asia/Dhaka"))
            item["observation_lag_after_configured_close_seconds"] = (capture.observed_at - close).total_seconds()
        counts = (await session.execute(select(TradingSourceObservation.source_table,
            func.date(TradingSourceObservation.observed_at), func.count()).group_by(
                TradingSourceObservation.source_table, func.date(TradingSourceObservation.observed_at),
            ).order_by(TradingSourceObservation.source_table, func.date(TradingSourceObservation.observed_at)))).all()
        report["journal_coverage"] = [{"source_table": table, "observed_date": str(day), "count": count} for table, day, count in counts]
        await session.rollback()
    rendered = json.dumps(report, sort_keys=True, indent=2, default=str)
    if args.output:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0 if report["healthy"] else 1


def main(argv: list[str] | None = None) -> int:
    return asyncio.run(_run(_parse_args(argv)))


if __name__ == "__main__":
    sys.exit(main())
