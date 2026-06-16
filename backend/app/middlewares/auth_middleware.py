from collections.abc import Awaitable, Callable

from starlette.requests import Request
from starlette.responses import Response

from app.core.security.jwt_service import JwtValidationError, decode_access_token
from app.core.security_config import ANONYMOUS_USER_CONTEXT, UserContext


def _extract_roles(payload: dict[str, object]) -> list[str]:
    roles = payload.get("roles")
    if isinstance(roles, list):
        return [str(role) for role in roles if role]
    role = payload.get("role")
    if role:
        return [str(role)]
    return []


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
            session_id = payload.get("session_id")
            request.state.user = UserContext(
                user_id=str(payload["sub"]),
                display_name=str(payload.get("display_name") or email),
                email=email,
                is_authenticated=True,
                roles=_extract_roles(payload),
                session_id=str(session_id) if session_id else None,
            )
        except JwtValidationError:
            request.state.user = ANONYMOUS_USER_CONTEXT

    return await call_next(request)
