"""Export legacy tax settings and stage verified rules on an explicitly selected database."""

import argparse
import asyncio
import os
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.modules.wealth.tax_planner_v2.legacy_archive import (
    LegacyExport,
    archive_and_stage,
    export_legacy,
)
from app.modules.wealth.tax_planner_v2.revision_service import RulesError

DATABASE_VARIABLE = "TAX_PLANNER_MIGRATION_DATABASE_URL"


async def _run(args: argparse.Namespace, dsn: str) -> None:
    url = make_url(dsn)
    if url.get_backend_name() != "postgresql":
        raise ValueError("The tax planner rollout requires a PostgreSQL target")
    engine = create_async_engine(url.set(drivername="postgresql+asyncpg"))
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with sessions() as session:
            if args.action == "export":
                captured = await export_legacy(session)
                with args.output.open("x", encoding="utf-8") as output:
                    output.write(captured.model_dump_json(indent=2))
                    output.write("\n")
                print(f"Exported legacy tax settings. SHA-256 {captured.content_hash()}")
            else:
                manifest = LegacyExport.model_validate_json(args.legacy_export.read_bytes())
                report = await archive_and_stage(session, manifest)
                print(report.model_dump_json(indent=2))
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="action", required=True)
    export = subparsers.add_parser("export", help="Write a new read-only legacy export file")
    export.add_argument("--output", type=Path, required=True)
    stage = subparsers.add_parser(
        "archive-and-stage", help="Reconcile an export and stage source drafts"
    )
    stage.add_argument("--legacy-export", type=Path, required=True)
    args = parser.parse_args()
    dsn = os.environ.get(DATABASE_VARIABLE)
    if not dsn:
        parser.error(f"Set {DATABASE_VARIABLE} to the explicitly authorized target database URL")
    try:
        asyncio.run(_run(args, dsn))
    except RulesError as exc:
        parser.exit(1, f"{exc.error_code}: {exc.message}\n")
    except (OSError, ValidationError, SQLAlchemyError, ValueError) as exc:
        parser.exit(
            1, f"Tax planner rollout failed ({type(exc).__name__}). Check the target and export.\n"
        )


if __name__ == "__main__":
    main()
