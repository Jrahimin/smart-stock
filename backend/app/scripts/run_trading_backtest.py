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
from datetime import date
from enum import Enum
from pathlib import Path
from typing import Any

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
    parser.add_argument("--order-value-bdt", type=float, default=100_000)
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
    return parser.parse_args(argv)


def _json_default(value: Any) -> Any:
    if isinstance(value, (date, Enum)):
        return value.isoformat() if isinstance(value, date) else value.value
    raise TypeError(f"Cannot serialize {type(value).__name__}")


async def _run(args: argparse.Namespace) -> int:
    from app.core.database_session import AsyncSessionLocal
    from app.core.enums import ExchangeCode
    from app.modules.backtesting.backtesting_manifest import replay_manifest_mismatches
    from app.modules.backtesting.backtesting_models import BacktestConfig
    from app.modules.backtesting.backtesting_repository import BacktestingRepository
    from app.modules.backtesting.backtesting_service import BacktestingService

    config = BacktestConfig(
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
    async with AsyncSessionLocal() as session:
        report = await BacktestingService(BacktestingRepository(session)).run(config)

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

    payload = json.dumps(asdict(report), default=_json_default, indent=2, sort_keys=True)
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
