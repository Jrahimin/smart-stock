from datetime import date
from uuid import UUID

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_repository import BaseRepository
from app.core.database_session import get_db_session
from app.models import TradingSignal


class SignalsRepository(BaseRepository[TradingSignal]):
    model = TradingSignal

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def list_signals(self, *, stock_id: UUID, limit: int, offset: int) -> list[TradingSignal]:
        statement = (
            select(TradingSignal)
            .where(TradingSignal.stock_id == stock_id)
            .order_by(TradingSignal.trade_date.desc(), TradingSignal.strategy_name, TradingSignal.id.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.scalars(statement)
        return list(result.all())

    async def get_signal(
        self,
        *,
        stock_id: UUID,
        trade_date: date,
        strategy_name: str,
    ) -> TradingSignal | None:
        statement = select(TradingSignal).where(
            TradingSignal.stock_id == stock_id,
            TradingSignal.trade_date == trade_date,
            TradingSignal.strategy_name == strategy_name,
        )
        return await self.session.scalar(statement)

def get_signals_repository(session: AsyncSession = Depends(get_db_session)) -> SignalsRepository:
    return SignalsRepository(session)

