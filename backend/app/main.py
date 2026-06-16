from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.api_router import api_router
from app.core.core_config import get_settings
from app.core.exception_handlers import register_exception_handlers
from app.core.logging_config import configure_logging
from app.jobs.email_campaign_scheduler import start_email_campaign_scheduler, stop_email_campaign_scheduler
from app.jobs.market_data_scheduler import daily_market_sync_scheduler, market_snapshot_scheduler
from app.middlewares.auth_middleware import auth_middleware
from app.middlewares.request_logging_middleware import request_logging_middleware


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    _ = app
    settings = get_settings()
    if settings.market_snapshot_scheduler_enabled:
        market_snapshot_scheduler.start()
    if settings.daily_market_sync_scheduler_enabled:
        daily_market_sync_scheduler.start()
    start_email_campaign_scheduler()
    try:
        yield
    finally:
        stop_email_campaign_scheduler()
        await market_snapshot_scheduler.stop()
        await daily_market_sync_scheduler.stop()


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()

    app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.middleware("http")(request_logging_middleware)
    app.middleware("http")(auth_middleware)

    register_exception_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()

