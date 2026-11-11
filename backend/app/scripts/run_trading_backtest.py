"""Run the practical point-in-time canonical-engine backtest.

Usage from ``backend/``::

    python -m app.scripts.run_trading_backtest --start 2026-01-01 --end 2026-07-14
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from dataclasses import asdict
from datetime import date, datetime
from enum import Enum
from pathlib import Path
from typing import Any
from uuid import UUID

BACKEND_ROOT = Path(__file__).resolve().parents[2]
os.chdir(BACKEND_ROOT)

from app.core.dotenv_loader import load_backend_dotenv  # noqa: E402

load_backend_dotenv()


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Replay the canonical strategy with point-in-time prefixes and modeled costs.",
    )
    parser.add_argument("--exchange", default="DSE", choices=("DSE", "CSE"))
    parser.add_argument("--start", type=date.fromisoformat, required=True)
    parser.add_argument("--end", type=date.fromisoformat, required=True)
    parser.add_argument("--one-way-cost-bps", type=float, default=50)
    parser.add_argument("--order-value-bdt", type=float, default=50_000)
    parser.add_argument(
        "--dataset-input",
        type=Path,
        help="Replay a frozen local archive without a database connection",
    )
    parser.add_argument(
        "--dataset-output", type=Path, help="Write the exact loaded raw input archive"
    )
    parser.add_argument("--maximum-turnover-fraction", type=float, default=0.01)
    parser.add_argument("--execution-price", choices=("open", "close"), default="open")
    parser.add_argument(
        "--walk-forward-mode",
        choices=("expanding", "rolling"),
        default="expanding",
    )
    parser.add_argument(
        "--use-current-category-proxy",
        action="store_true",
        help="Opt in to current (not point-in-time) category as an explicitly disclosed proxy.",
    )
    parser.add_argument("--output", type=Path, help="Optional JSON output path")
    parser.add_argument(
        "--manifest-output",
        type=Path,
        help="Optional path for the compact reproducibility manifest",
    )
    parser.add_argument(
        "--verify-manifest",
        type=Path,
        help="Fail when the current replay does not reproduce a prior manifest/report",
    )
    parser.add_argument("--replay-mode", choices=("reconstructed", "captured", "capture_diagnostic"), default="reconstructed")
    parser.add_argument("--strategy-version", default=None)
    parser.add_argument("--publication-id", action="append", default=[], help="Explicit original/correction vintage for captured replay")
    parser.add_argument("--horizons", default="3,5,10,20", help="Explicit exchange-session horizons; use 10 for primary-only analysis")
    parser.add_argument("--session-open-overrides", type=Path, help="JSON mapping verified session dates to applicable opening times")
    parser.add_argument("--no-sensitivities", action="store_true")
    parser.add_argument("--omit-dataset-in-report", action="store_true", help="Keep the full archive in dataset-output rather than duplicate it in report JSON")
    return parser.parse_args(argv)


def _json_default(value: Any) -> Any:
    if isinstance(value, (date, datetime, Enum)):
        return value.isoformat() if isinstance(value, date) else value.value
    if isinstance(value, UUID):
        return str(value)
    raise TypeError(f"Cannot serialize {type(value).__name__}")


async def _run(args: argparse.Namespace) -> int:
    from app.core.enums import ExchangeCode
    from app.modules.backtesting.backtesting_manifest import replay_manifest_mismatches
    from app.modules.backtesting.backtesting_models import BacktestConfig
    from app.modules.backtesting.backtesting_repository import BacktestingRepository
    from app.modules.backtesting.backtesting_service import BacktestingService

    from app.core.core_config import get_settings
    from app.core.constants.trading_constants import TRADING_STRATEGY_VERSION
    config = BacktestConfig(
        publication_ids=tuple(args.publication_id), replay_mode=args.replay_mode, strategy_version=args.strategy_version or TRADING_STRATEGY_VERSION,
        horizons=tuple(int(value) for value in args.horizons.split(",")),
        session_open_time=get_settings().market_open_time, session_close_time=get_settings().market_close_time,
        session_open_overrides=tuple(sorted(json.loads(args.session_open_overrides.read_text()).items())) if args.session_open_overrides else tuple(sorted(get_settings().market_session_open_overrides.items())),
        exchange=ExchangeCode(args.exchange),
        start_date=args.start,
        end_date=args.end,
        execution_price=args.execution_price,
        one_way_cost_bps=args.one_way_cost_bps,
        order_value_bdt=args.order_value_bdt,
        maximum_turnover_fraction=args.maximum_turnover_fraction,
        walk_forward_mode=args.walk_forward_mode,
        use_current_category_proxy=args.use_current_category_proxy,
    )
    if args.dataset_input:
        from app.modules.backtesting.backtesting_archive import restore_dataset
        from app.modules.backtesting.backtesting_service import run_dataset

        report = run_dataset(
            restore_dataset(json.loads(args.dataset_input.read_text(encoding="utf-8"))), config, sensitivities=not args.no_sensitivities
        )
    else:
        from app.core.database_session import AsyncSessionLocal

        from sqlalchemy import text
        async with AsyncSessionLocal() as session:
            await session.execute(text("SET TRANSACTION READ ONLY"))
            report = await BacktestingService(BacktestingRepository(session)).run(config, sensitivities=not args.no_sensitivities)
    if args.dataset_output:
        args.dataset_output.parent.mkdir(parents=True, exist_ok=True)
        args.dataset_output.write_text(
            json.dumps(report.audit["dataset"], indent=2, sort_keys=True), encoding="utf-8"
        )

    if args.verify_manifest:
        expected_payload = json.loads(args.verify_manifest.read_text(encoding="utf-8"))
        expected_manifest = expected_payload.get("manifest", expected_payload)
        mismatches = replay_manifest_mismatches(expected_manifest, report.manifest)
        if mismatches:
            print(
                "Replay manifest mismatch: " + ", ".join(mismatches),
                file=sys.stderr,
            )
            return 2

    result = asdict(report)
    if args.omit_dataset_in_report:
        result["audit"].pop("dataset", None)
    payload = json.dumps(result, default=_json_default, indent=2, sort_keys=True)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
        print(f"Wrote {args.output}")
    else:
        print(payload)
    if args.manifest_output:
        args.manifest_output.parent.mkdir(parents=True, exist_ok=True)
        args.manifest_output.write_text(
            json.dumps(
                asdict(report.manifest),
                default=_json_default,
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"Wrote {args.manifest_output}")
    return 0


def main(argv: list[str] | None = None) -> int:
    return asyncio.run(_run(_parse_args(argv)))


if __name__ == "__main__":
    sys.exit(main())
