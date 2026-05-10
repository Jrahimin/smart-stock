from uuid import UUID

from fastapi import Depends

from app.api.dependencies.auth_dependencies import get_current_user_context
from app.core.security_config import UserContext
from app.models import TradingSignal
from app.modules.signals.signals_repository import SignalsRepository, get_signals_repository
from app.modules.signals.signals_schemas import TradingSignalCreate


class SignalsService:
    def __init__(self, repository: SignalsRepository, user_context: UserContext) -> None:
        self.repository = repository
        self.user_context = user_context

    async def list_signals(self, *, stock_id: UUID, limit: int, offset: int):
        return await self.repository.list_signals(stock_id=stock_id, limit=limit, offset=offset)

    async def find_signal(self, signal_data: TradingSignalCreate) -> TradingSignal | None:
        return await self.repository.get_signal(
            stock_id=signal_data.stock_id,
            trade_date=signal_data.trade_date,
            strategy_name=signal_data.strategy_name,
        )

    async def create_signal(self, signal_data: TradingSignalCreate) -> TradingSignal:
        signal = await self.repository.create(signal_data.model_dump())
        await self.repository.commit()
        await self.repository.refresh(signal)
        return signal


def get_signals_service(
    repository: SignalsRepository = Depends(get_signals_repository),
    user_context: UserContext = Depends(get_current_user_context),
) -> SignalsService:
    return SignalsService(repository, user_context)

