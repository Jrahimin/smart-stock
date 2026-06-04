from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
from jwt import InvalidTokenError

from app.core.core_config import get_settings

ACCESS_TOKEN_TYPE = "access"


class JwtValidationError(Exception):
    pass


def create_access_token(
    *,
    user_id: UUID,
    email: str,
    display_name: str,
) -> tuple[str, int]:
    settings = get_settings()
    expires_delta = timedelta(minutes=settings.jwt_access_token_expire_minutes)
    expires_at = datetime.now(UTC) + expires_delta
    issued_at = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "email": email,
        "display_name": display_name,
        "type": ACCESS_TOKEN_TYPE,
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, int(expires_delta.total_seconds())


def decode_access_token(token: str) -> dict[str, object]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except InvalidTokenError as exc:
        raise JwtValidationError("Invalid access token") from exc

    if payload.get("type") != ACCESS_TOKEN_TYPE:
        raise JwtValidationError("Invalid token type")

    if not payload.get("sub") or not payload.get("email"):
        raise JwtValidationError("Access token is missing required claims")

    return payload
