from collections.abc import Awaitable, Callable

from starlette.requests import Request
from starlette.responses import Response

from app.core.core_config import get_settings
from app.core.security_config import ANONYMOUS_USER_CONTEXT, PLACEHOLDER_AUTHENTICATED_USER_CONTEXT

PUBLIC_PATH_PREFIXES = (
    "/docs",
    "/redoc",
    "/openapi.json",
    "/api/v1/health",
)


async def auth_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    settings = get_settings()
    auth_header = request.headers.get("Authorization")
    is_public_path = request.url.path.startswith(PUBLIC_PATH_PREFIXES)

    # JWT validation will live here later. For now the middleware guarantees
    # that downstream code can consistently read request.state.user.
    if settings.auth_enabled and auth_header and not is_public_path:
        request.state.user = PLACEHOLDER_AUTHENTICATED_USER_CONTEXT
    else:
        request.state.user = ANONYMOUS_USER_CONTEXT

    return await call_next(request)

