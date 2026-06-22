from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_repository import BaseRepository
from app.core.database_session import get_db_session
from app.models import TaxInvestmentCategory, TaxPlannerSettings, TaxPlannerSlab


class TaxConfigRepository(BaseRepository[TaxPlannerSettings]):
    model = TaxPlannerSettings

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_settings(self, country_code: str = "BD") -> TaxPlannerSettings | None:
        return await self.session.scalar(
            select(TaxPlannerSettings).where(TaxPlannerSettings.country_code == country_code)
        )

    async def list_slabs(self) -> list[TaxPlannerSlab]:
        result = await self.session.scalars(select(TaxPlannerSlab).order_by(TaxPlannerSlab.sort_order.asc()))
        return list(result.all())

    async def list_investment_categories(self) -> list[TaxInvestmentCategory]:
        statement = (
            select(TaxInvestmentCategory)
            .order_by(TaxInvestmentCategory.sort_order.asc(), TaxInvestmentCategory.category_key.asc())
        )
        result = await self.session.scalars(statement)
        return list(result.all())

    async def replace_slabs(self, rows: list[dict[str, object]]) -> None:
        existing = await self.session.scalars(select(TaxPlannerSlab))
        for row in existing.all():
            await self.session.delete(row)
        for row in rows:
            await self.create_model(TaxPlannerSlab, row)

    async def replace_investment_categories(self, rows: list[dict[str, object]]) -> None:
        existing = await self.session.scalars(select(TaxInvestmentCategory))
        for row in existing.all():
            await self.session.delete(row)
        for row in rows:
            await self.create_model(TaxInvestmentCategory, row)


def get_tax_config_repository(session: AsyncSession = Depends(get_db_session)) -> TaxConfigRepository:
    return TaxConfigRepository(session)
