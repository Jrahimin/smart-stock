from hashlib import sha256
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TaxPlannerRuleRevision

COUNTRY = "BD"


class RevisionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def lock_year(self, year: str) -> None:
        # The key also exists for the first publication, when there is no row to lock.
        digest = sha256(f"stockwealth:tax-planner:{COUNTRY}:{year}".encode()).digest()
        key = int.from_bytes(digest[:8], "big", signed=True)
        await self.session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})

    async def assessment_year(self, row_id: UUID) -> str | None:
        return await self.session.scalar(
            select(TaxPlannerRuleRevision.assessment_year).where(
                TaxPlannerRuleRevision.id == row_id
            )
        )

    async def get(self, row_id: UUID, *, for_update: bool = False) -> TaxPlannerRuleRevision | None:
        statement = select(TaxPlannerRuleRevision).where(TaxPlannerRuleRevision.id == row_id)
        if for_update:
            statement = statement.with_for_update()
        return await self.session.scalar(statement.execution_options(populate_existing=True))

    async def active(
        self,
        year: str,
        status: str,
        *,
        for_update: bool = False,
    ) -> TaxPlannerRuleRevision | None:
        statement = select(TaxPlannerRuleRevision).where(
            TaxPlannerRuleRevision.country_code == COUNTRY,
            TaxPlannerRuleRevision.assessment_year == year,
            TaxPlannerRuleRevision.status == status,
        )
        if for_update:
            statement = statement.with_for_update()
        return await self.session.scalar(statement.execution_options(populate_existing=True))

    async def list(
        self,
        *,
        year: str | None = None,
        status: str | None = None,
    ) -> list[TaxPlannerRuleRevision]:
        statement = select(TaxPlannerRuleRevision).where(
            TaxPlannerRuleRevision.country_code == COUNTRY
        )
        if year is not None:
            statement = statement.where(TaxPlannerRuleRevision.assessment_year == year)
        if status is not None:
            statement = statement.where(TaxPlannerRuleRevision.status == status)
        statement = statement.order_by(
            TaxPlannerRuleRevision.assessment_year.desc().nulls_last(),
            TaxPlannerRuleRevision.revision_number.desc(),
        )
        rows = await self.session.scalars(statement.execution_options(populate_existing=True))
        return list(rows)

    async def next_number(self, year: str | None) -> int:
        latest = await self.session.scalar(
            select(func.max(TaxPlannerRuleRevision.revision_number)).where(
                TaxPlannerRuleRevision.country_code == COUNTRY,
                TaxPlannerRuleRevision.assessment_year == year,
            )
        )
        return (latest or 0) + 1

    async def archive_by_hash(self, content_hash: str) -> TaxPlannerRuleRevision | None:
        return await self.session.scalar(
            select(TaxPlannerRuleRevision).where(
                TaxPlannerRuleRevision.country_code == COUNTRY,
                TaxPlannerRuleRevision.status == "archived_legacy",
                TaxPlannerRuleRevision.content_hash == content_hash,
            )
        )
