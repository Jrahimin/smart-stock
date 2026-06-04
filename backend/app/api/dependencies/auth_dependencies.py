from typing import Annotated

from fastapi import Depends, Request

from app.core.exception_handlers import UnauthorizedError
from app.core.security_config import UserContext


def get_current_user_context(request: Request) -> UserContext:
    return request.state.user


CurrentUserContext = Annotated[UserContext, Depends(get_current_user_context)]


def allow_public_access(request: Request) -> UserContext:
    return request.state.user


def get_current_user(request: Request) -> UserContext:
    user_context: UserContext = request.state.user

    if not user_context.is_authenticated:
        raise UnauthorizedError()

    return user_context


CurrentUser = Annotated[UserContext, Depends(get_current_user)]

