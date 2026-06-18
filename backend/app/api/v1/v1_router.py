from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from app.core.core_config import get_settings
from app.core.database_session import async_engine
from app.core.response_handler import ApiResponse, success_response
from app.schemas.system_version import SystemVersionData
from app.modules.auth.auth_router import router as auth_router
from app.modules.admin_dashboard.admin_dashboard_router import router as admin_dashboard_router
from app.modules.admin_configuration.admin_configuration_router import router as admin_configuration_router
from app.modules.admin_email_campaigns.admin_email_campaigns_router import router as admin_email_campaigns_router
from app.modules.admin_jobs.admin_jobs_router import router as admin_jobs_router
from app.modules.admin_users.admin_users_router import router as admin_users_router
from app.modules.indicators.indicators_router import router as indicators_router
from app.modules.market_data.market_data_router import router as market_data_router
from app.modules.market_dashboard.market_dashboard_router import router as market_dashboard_router
from app.modules.market_pulse.market_pulse_router import router as market_pulse_router
from app.modules.market_universe.market_universe_router import router as market_universe_router
from app.modules.signals.signals_router import router as signals_router
from app.modules.stock_details.stock_details_router import router as stock_details_router
from app.modules.stocks.stocks_router import router as stocks_router
from app.modules.watchlists.watchlists_router import router as watchlists_router
from app.modules.wealth.wealth_router import router as wealth_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(admin_dashboard_router)
router.include_router(admin_users_router)
router.include_router(admin_configuration_router)
router.include_router(admin_jobs_router)
router.include_router(admin_email_campaigns_router)
router.include_router(stocks_router)
router.include_router(watchlists_router)
router.include_router(wealth_router)
router.include_router(market_data_router)
router.include_router(market_dashboard_router)
router.include_router(market_pulse_router)
router.include_router(market_universe_router)
router.include_router(indicators_router)
router.include_router(signals_router)
router.include_router(stock_details_router)


@router.get("/system", response_model=ApiResponse[SystemVersionData])
async def system_version() -> ApiResponse[SystemVersionData]:
    settings = get_settings()
    return success_response(
        data=SystemVersionData(
            version=settings.app_version,
            git_sha=settings.git_sha,
            build_time=settings.build_time,
        ),
        message="System version",
    )


@router.get("/health", response_model=ApiResponse[dict[str, str]])
async def health_check() -> ApiResponse[dict[str, str]]:
    return success_response(data={"status": "ok"}, message="API is healthy")


@router.get("/health/ready", response_model=ApiResponse[dict[str, str]])
async def health_ready() -> ApiResponse[dict[str, str]]:
    try:
        async with async_engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not ready",
        ) from exc
    return success_response(data={"status": "ready"}, message="API is ready")

