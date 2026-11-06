"""Serve the real tax planner routers against a disposable schema for UI tests."""

import asyncio
import os

import uvicorn
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import JSONResponse, Response

from app.core.enums import UserRole
from app.modules.wealth.tax_planner_v2 import revision_router
from app.modules.wealth.tax_planner_v2.golden_cases import GOLDEN_AS_OF
from app.tests.test_tax_planner_v2_persistence import (
    _ADMIN,
    _DSN,
    _PUBLIC,
    _http_app,
    _migrate,
    _publish_initial,
    isolated_postgres,
)

HOST = "127.0.0.1"
PORT = 8113
_ADMIN_TOKEN = b"Bearer tax-planner-ui-test-super-admin"


async def _serve() -> None:
    dsn = os.getenv(_DSN)
    if not dsn:
        raise SystemExit(f"Set {_DSN} to a disposable loopback PostgreSQL database")

    async with isolated_postgres(dsn) as (engine, sessions):
        async with engine.begin() as connection:
            await connection.run_sync(_migrate)
        await _publish_initial(sessions, "2027-28")
        await _publish_initial(sessions)
        revision_router.dhaka_today = lambda: GOLDEN_AS_OF
        app = _http_app(
            sessions,
            {
                "tax_planner_v2_release_enabled": True,
                "tax_planner_v2_calculations_suspended": False,
            },
        )

        @app.middleware("http")
        async def restrict_harness(request: Request, call_next):
            if request.client is None or request.client.host != HOST:
                return Response(status_code=403)
            if request.url.path == "/tax-planner-ui-test/ready" and request.method == "GET":
                return JSONResponse({"tax_planner_ui_test": True})
            if not request.url.path.startswith((f"{_PUBLIC}/v2/", f"{_ADMIN}/v2/")):
                return Response(status_code=404)
            headers = [
                (key, value) for key, value in request.scope["headers"] if key != b"x-test-role"
            ]
            if (b"authorization", _ADMIN_TOKEN) in headers:
                headers.append((b"x-test-role", UserRole.SUPER_ADMIN.value.encode("ascii")))
            request.scope["headers"] = headers
            return await call_next(request)

        app.add_middleware(
            CORSMiddleware,
            allow_origins=["http://127.0.0.1:3113"],
            allow_methods=["GET", "POST", "PUT"],
            allow_headers=["Authorization", "Content-Type"],
        )
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=[HOST])
        await uvicorn.Server(
            uvicorn.Config(app, host=HOST, port=PORT, proxy_headers=False, access_log=False)
        ).serve()


if __name__ == "__main__":
    asyncio.run(_serve())
