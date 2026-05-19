from app.core.core_config import get_settings
from app.core.database_session import AsyncSessionLocal
from app.core.enums import ExchangeCode, StockDetailsSyncScope, StockDetailsSyncTriggerType
from app.core.security_config import UserContext
from app.modules.stock_details.stock_details_repository import StockDetailsRepository
from app.modules.stock_details.stock_details_schemas import StockDetailsSyncRequest, StockDetailsSyncResult
from app.modules.stock_details.stock_details_service import StockDetailsService


async def ingest_stock_details(
    *,
    exchange: ExchangeCode = ExchangeCode.DSE,
    symbols: list[str] | None = None,
    limit: int | None = 20,
    offset: int = 0,
    historical_window_days: int | None = None,
    force: bool = False,
    trigger_type: StockDetailsSyncTriggerType = StockDetailsSyncTriggerType.SCHEDULED,
    scope: StockDetailsSyncScope = StockDetailsSyncScope.FULL,
) -> StockDetailsSyncResult:
    async with AsyncSessionLocal() as session:
        service = StockDetailsService(
            repository=StockDetailsRepository(session),
            user_context=UserContext(
                user_id="system",
                display_name="System Job",
                is_authenticated=True,
                roles=["system"],
            ),
            settings=get_settings(),
        )
        return await service.sync_stock_details(
            StockDetailsSyncRequest(
                exchange=exchange,
                symbols=symbols,
                limit=limit,
                offset=offset,
                historical_window_days=historical_window_days,
                force=force,
                trigger_type=trigger_type,
                scope=scope,
            )
        )
