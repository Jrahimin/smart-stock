from typing import Annotated

from fastapi import Depends, Request

from app.core.core_config import get_settings
from app.core.exception_handlers import UnauthorizedError
from app.core.security_config import UserContext


def get_current_user_context(request: Request) -> UserContext:
    return request.state.user


CurrentUserContext = Annotated[UserContext, Depends(get_current_user_context)]


def allow_public_access(request: Request) -> UserContext:
    return request.state.user


def require_authenticated_user(request: Request) -> UserContext:
    user_context: UserContext = request.state.user
    settings = get_settings()

    if settings.auth_enabled and not user_context.is_authenticated:
        raise UnauthorizedError()

    return user_context

