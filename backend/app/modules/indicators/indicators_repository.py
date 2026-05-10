from datetime import date
from uuid import UUID

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_repository import BaseRepository
from app.core.database_session import get_db_session
from app.core.enums import IndicatorType
from app.models import TechnicalIndicator


class IndicatorsRepository(BaseRepository[TechnicalIndicator]):
    model = TechnicalIndicator

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def list_indicators(self, *, stock_id: UUID, limit: int, offset: int) -> list[TechnicalIndicator]:
        statement = (
            select(TechnicalIndicator)
            .where(TechnicalIndicator.stock_id == stock_id)
            .order_by(TechnicalIndicator.trade_date.desc(), TechnicalIndicator.indicator_type, TechnicalIndicator.id.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.scalars(statement)
        return list(result.all())

    async def get_indicator(
        self,
        *,
        stock_id: UUID,
        trade_date: date,
        indicator_type: IndicatorType,
        period: int,
    ) -> TechnicalIndicator | None:
        statement = select(TechnicalIndicator).where(
            TechnicalIndicator.stock_id == stock_id,
            TechnicalIndicator.trade_date == trade_date,
            TechnicalIndicator.indicator_type == indicator_type,
            TechnicalIndicator.period == period,
        )
        return await self.session.scalar(statement)

def get_indicators_repository(session: AsyncSession = Depends(get_db_session)) -> IndicatorsRepository:
    return IndicatorsRepository(session)

