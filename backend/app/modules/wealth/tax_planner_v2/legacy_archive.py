from datetime import UTC, date, datetime
from decimal import Decimal
from hashlib import sha256
from json import dumps
from typing import Any, Literal
from uuid import UUID

from pydantic import Field, model_validator
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    TaxInvestmentCategory,
    TaxPlannerRuleRevision,
    TaxPlannerSettings,
    TaxPlannerSlab,
)

from .contracts import Contract
from .golden_cases import GOLDEN_AS_OF
from .revision_preview import evaluate_preview
from .revision_repository import COUNTRY
from .revision_service import BOOTSTRAP_PACKS, RulesError, TaxPlannerRevisionService
from .rules import Hash

LEGACY_TABLES = tuple(
    model.__table__ for model in (TaxPlannerSettings, TaxPlannerSlab, TaxInvestmentCategory)
)


def _hash(value: Any) -> str:
    return sha256(
        dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()


def _json_value(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, (Decimal, UUID)):
        return str(value)
    return value


class TableCapture(Contract):
    row_count: int = Field(ge=0)
    sha256: Hash
    rows: tuple[dict[str, Any], ...]

    @model_validator(mode="after")
    def verify_content(self) -> "TableCapture":
        if self.row_count != len(self.rows) or self.sha256 != _hash(self.rows):
            raise ValueError("Legacy table count or checksum does not match")
        return self


class LegacyExport(Contract):
    schema_version: Literal[1] = 1
    country_code: Literal["BD"] = "BD"
    captured_at: datetime
    source_alembic_revisions: tuple[str, ...] = Field(min_length=1)
    tables: dict[str, TableCapture]

    @model_validator(mode="after")
    def verify_tables(self) -> "LegacyExport":
        if set(self.tables) != {table.name for table in LEGACY_TABLES}:
            raise ValueError("Export must contain the complete legacy tax table set")
        return self

    def content_hash(self) -> str:
        return _hash(self.model_dump(mode="json", exclude={"captured_at"}))


class StageReport(Contract):
    archive_revision_id: UUID
    archive_hash: Hash
    source_revision_ids: dict[str, UUID]


async def _capture(session: AsyncSession) -> LegacyExport:
    revisions = await session.scalars(
        text("SELECT version_num FROM alembic_version ORDER BY version_num")
    )
    tables = {}
    for table in LEGACY_TABLES:
        result = await session.execute(select(table).order_by(table.c.id))
        rows = tuple(
            {key: _json_value(value) for key, value in row.items()} for row in result.mappings()
        )
        tables[table.name] = TableCapture(row_count=len(rows), sha256=_hash(rows), rows=rows)
    return LegacyExport(
        captured_at=datetime.now(UTC),
        source_alembic_revisions=tuple(revisions),
        tables=tables,
    )


async def export_legacy(session: AsyncSession) -> LegacyExport:
    async with session.begin():
        await session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"))
        return await _capture(session)


async def archive_and_stage(session: AsyncSession, exported: LegacyExport) -> StageReport:
    # Revalidate nested raw rows because the frozen models contain JSON mappings.
    exported = LegacyExport.model_validate(exported.model_dump())
    service = TaxPlannerRevisionService(session)
    repository = service.repository
    async with session.begin():
        await repository.lock_year("legacy-archive")
        await session.execute(
            text(
                "LOCK TABLE tax_planner_settings, tax_slabs, "
                "tax_investment_categories IN SHARE MODE"
            )
        )
        observed = await _capture(session)
        if observed.tables != exported.tables:
            raise RulesError(
                409,
                "LEGACY_EXPORT_CHANGED",
                "Legacy tax rows changed. Capture and reconcile a new export.",
            )
        archive_hash = exported.content_hash()
        archive = await repository.archive_by_hash(archive_hash)
        if archive is None:
            archive = TaxPlannerRuleRevision(
                country_code=COUNTRY,
                assessment_year=None,
                revision_number=await repository.next_number(None),
                status="archived_legacy",
                payload_schema_version=1,
                engine_policy_version="legacy",
                payload=exported.model_dump(mode="json"),
                content_hash=archive_hash,
                edit_version=1,
            )
            session.add(archive)
            await session.flush()

        source_revisions = {}
        for year, pack in BOOTSTRAP_PACKS.items():
            cases, issues = evaluate_preview(
                pack,
                pack,
                candidate_id="source-pack",
                previous_id="source-pack",
                as_of=GOLDEN_AS_OF,
            )
            if issues or any(case.differing_from_source for case in cases):
                raise RulesError(422, "BOOTSTRAP_FIXTURES_FAILED", "Source pack fixtures failed.")
            row = await service.ensure_bootstrap_draft(pack)
            source_revisions[year] = row.id
        return StageReport(
            archive_revision_id=archive.id,
            archive_hash=archive_hash,
            source_revision_ids=source_revisions,
        )
