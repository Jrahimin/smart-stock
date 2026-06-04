from fastapi import APIRouter

from app.core.response_handler import ApiResponse, success_response
from app.modules.auth.auth_router import router as auth_router
from app.modules.indicators.indicators_router import router as indicators_router
from app.modules.market_data.market_data_router import router as market_data_router
from app.modules.signals.signals_router import router as signals_router
from app.modules.stock_details.stock_details_router import router as stock_details_router
from app.modules.stocks.stocks_router import router as stocks_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(stocks_router)
router.include_router(market_data_router)
router.include_router(indicators_router)
router.include_router(signals_router)
router.include_router(stock_details_router)


@router.get("/health", response_model=ApiResponse[dict[str, str]])
async def health_check() -> ApiResponse[dict[str, str]]:
    return success_response(data={"status": "ok"}, message="API is healthy")

