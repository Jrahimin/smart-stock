from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.api_router import api_router
from app.core.core_config import get_settings
from app.core.exception_handlers import register_exception_handlers
from app.core.logging_config import configure_logging
from app.jobs.scheduler_runtime import start_application_schedulers, stop_application_schedulers
from app.middlewares.auth_middleware import auth_middleware
from app.middlewares.request_logging_middleware import request_logging_middleware


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    _ = app
    settings = get_settings()
    if settings.run_scheduler:
        await start_application_schedulers()
    try:
        yield
    finally:
        if settings.run_scheduler:
            await stop_application_schedulers()


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

