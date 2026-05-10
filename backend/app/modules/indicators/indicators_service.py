from uuid import UUID

from fastapi import Depends

from app.api.dependencies.auth_dependencies import get_current_user_context
from app.core.security_config import UserContext
from app.models import TechnicalIndicator
from app.modules.indicators.indicators_repository import IndicatorsRepository, get_indicators_repository
from app.modules.indicators.indicators_schemas import TechnicalIndicatorCreate


class IndicatorsService:
    def __init__(self, repository: IndicatorsRepository, user_context: UserContext) -> None:
        self.repository = repository
        self.user_context = user_context

    async def list_indicators(self, *, stock_id: UUID, limit: int, offset: int):
        return await self.repository.list_indicators(stock_id=stock_id, limit=limit, offset=offset)

    async def find_indicator(
        self,
        indicator_data: TechnicalIndicatorCreate,
    ) -> TechnicalIndicator | None:
        return await self.repository.get_indicator(
            stock_id=indicator_data.stock_id,
            trade_date=indicator_data.trade_date,
            indicator_type=indicator_data.indicator_type,
            period=indicator_data.period,
        )

    async def create_indicator(self, indicator_data: TechnicalIndicatorCreate) -> TechnicalIndicator:
        indicator = await self.repository.create(indicator_data.model_dump())
        await self.repository.commit()
        await self.repository.refresh(indicator)
        return indicator


def get_indicators_service(
    repository: IndicatorsRepository = Depends(get_indicators_repository),
    user_context: UserContext = Depends(get_current_user_context),
) -> IndicatorsService:
    return IndicatorsService(repository, user_context)

