from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Request

from app.core.enums import UserRole
from app.core.exception_handlers import ForbiddenError, UnauthorizedError
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


def _has_any_role(user_context: UserContext, allowed_roles: set[str]) -> bool:
    return any(role in allowed_roles for role in user_context.roles)


def require_roles(*roles: UserRole) -> Callable[[Request], UserContext]:
    allowed_roles = {role.value for role in roles}

    def dependency(request: Request) -> UserContext:
        user_context = get_current_user(request)
        if not _has_any_role(user_context, allowed_roles):
            raise ForbiddenError("You do not have permission to perform this action")
        return user_context

    return dependency


def require_admin(request: Request) -> UserContext:
    user_context = get_current_user(request)
    if not _has_any_role(user_context, {UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value}):
        raise ForbiddenError("Admin access is required")
    return user_context


def require_super_admin(request: Request) -> UserContext:
    user_context = get_current_user(request)
    if not _has_any_role(user_context, {UserRole.SUPER_ADMIN.value}):
        raise ForbiddenError("Super admin access is required")
    return user_context


CurrentAdmin = Annotated[UserContext, Depends(require_admin)]
CurrentSuperAdmin = Annotated[UserContext, Depends(require_super_admin)]
