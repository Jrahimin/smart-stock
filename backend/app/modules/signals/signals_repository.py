from datetime import date
from uuid import UUID

from fastapi import Depends
from sqlalchemy import func, select
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

    async def list_latest_active_signals(self, *, limit: int, offset: int) -> list[TradingSignal]:
        ranked_signals = (
            select(
                TradingSignal.id.label("signal_id"),
                func.row_number()
                .over(
                    partition_by=TradingSignal.stock_id,
                    order_by=(
                        TradingSignal.trade_date.desc(),
                        TradingSignal.strategy_name.asc(),
                        TradingSignal.id.desc(),
                    ),
                )
                .label("rank"),
            )
            .where(TradingSignal.is_active.is_(True))
            .subquery()
        )
        statement = (
            select(TradingSignal)
            .join(ranked_signals, ranked_signals.c.signal_id == TradingSignal.id)
            .where(ranked_signals.c.rank == 1)
            .order_by(TradingSignal.trade_date.desc(), TradingSignal.stock_id, TradingSignal.strategy_name, TradingSignal.id.desc())
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

