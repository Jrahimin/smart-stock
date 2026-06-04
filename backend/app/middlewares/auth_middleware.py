from collections.abc import Awaitable, Callable

from starlette.requests import Request
from starlette.responses import Response

from app.core.security.jwt_service import JwtValidationError, decode_access_token
from app.core.security_config import ANONYMOUS_USER_CONTEXT, UserContext


async def auth_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    auth_header = request.headers.get("Authorization")

    request.state.user = ANONYMOUS_USER_CONTEXT
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        try:
            payload = decode_access_token(token)
            email = str(payload["email"])
            request.state.user = UserContext(
                user_id=str(payload["sub"]),
                display_name=str(payload.get("display_name") or email),
                email=email,
                is_authenticated=True,
            )
        except JwtValidationError:
            request.state.user = ANONYMOUS_USER_CONTEXT

    return await call_next(request)

