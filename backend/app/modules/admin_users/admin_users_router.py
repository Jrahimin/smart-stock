from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.dependencies.auth_dependencies import CurrentAdmin, CurrentSuperAdmin
from app.core.enums import UserRole
from app.core.response_handler import ApiResponse, success_response
from app.modules.admin_users.admin_users_schemas import (
    AdminUserActiveUpdateRequest,
    AdminUserCreateRequest,
    AdminUserListQuery,
    AdminUserRead,
    AdminUserRoleUpdateRequest,
    AdminUserSessionRead,
)
from app.modules.admin_users.admin_users_service import AdminUsersService, get_admin_users_service

router = APIRouter(prefix="/admin/users", tags=["admin users"])


@router.get("", response_model=ApiResponse[list[AdminUserRead]])
async def list_users(
    service: Annotated[AdminUsersService, Depends(get_admin_users_service)],
    _: CurrentAdmin,
    search: str | None = Query(default=None, max_length=120),
    is_active: bool | None = None,
    role: UserRole | None = None,
    include_deleted: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> ApiResponse[list[AdminUserRead]]:
    users = await service.list_users(
        AdminUserListQuery(
            search=search,
            is_active=is_active,
            role=role,
            include_deleted=include_deleted,
            limit=limit,
            offset=offset,
        )
    )
    return success_response(
        data=[AdminUserRead.model_validate(user) for user in users],
        message="Users retrieved",
    )


@router.post("", response_model=ApiResponse[AdminUserRead])
async def create_admin_user(
    payload: AdminUserCreateRequest,
    service: Annotated[AdminUsersService, Depends(get_admin_users_service)],
    actor: CurrentSuperAdmin,
) -> ApiResponse[AdminUserRead]:
    user = await service.create_admin_user(payload, actor=actor)
    return success_response(data=AdminUserRead.model_validate(user), message="Admin user created")


@router.get("/{user_id}", response_model=ApiResponse[AdminUserRead])
async def get_user(
    user_id: UUID,
    service: Annotated[AdminUsersService, Depends(get_admin_users_service)],
    _: CurrentAdmin,
    include_deleted: bool = False,
) -> ApiResponse[AdminUserRead]:
    user = await service.get_user(user_id, include_deleted=include_deleted)
    return success_response(data=AdminUserRead.model_validate(user), message="User retrieved")


@router.get("/{user_id}/sessions", response_model=ApiResponse[list[AdminUserSessionRead]])
async def list_user_sessions(
    user_id: UUID,
    service: Annotated[AdminUsersService, Depends(get_admin_users_service)],
    _: CurrentAdmin,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> ApiResponse[list[AdminUserSessionRead]]:
    sessions = await service.list_user_sessions(user_id, limit=limit, offset=offset)
    return success_response(
        data=[AdminUserSessionRead.model_validate(item) for item in sessions],
        message="User sessions retrieved",
    )


@router.patch("/{user_id}/active", response_model=ApiResponse[AdminUserRead])
async def update_user_active_status(
    user_id: UUID,
    payload: AdminUserActiveUpdateRequest,
    service: Annotated[AdminUsersService, Depends(get_admin_users_service)],
    _: CurrentAdmin,
) -> ApiResponse[AdminUserRead]:
    user = await service.set_active_status(user_id, is_active=payload.is_active)
    return success_response(data=AdminUserRead.model_validate(user), message="User status updated")


@router.patch("/{user_id}/role", response_model=ApiResponse[AdminUserRead])
async def update_user_role(
    user_id: UUID,
    payload: AdminUserRoleUpdateRequest,
    service: Annotated[AdminUsersService, Depends(get_admin_users_service)],
    actor: CurrentSuperAdmin,
) -> ApiResponse[AdminUserRead]:
    user = await service.update_role(user_id, payload, actor=actor)
    return success_response(data=AdminUserRead.model_validate(user), message="User role updated")


@router.delete("/{user_id}", response_model=ApiResponse[AdminUserRead])
async def soft_delete_user(
    user_id: UUID,
    service: Annotated[AdminUsersService, Depends(get_admin_users_service)],
    actor: CurrentSuperAdmin,
) -> ApiResponse[AdminUserRead]:
    user = await service.soft_delete_user(user_id, actor=actor)
    return success_response(data=AdminUserRead.model_validate(user), message="User soft deleted")


@router.post("/{user_id}/revoke-sessions", response_model=ApiResponse[dict[str, str]])
async def revoke_user_sessions(
    user_id: UUID,
    service: Annotated[AdminUsersService, Depends(get_admin_users_service)],
    _: CurrentAdmin,
) -> ApiResponse[dict[str, str]]:
    await service.revoke_sessions(user_id)
    return success_response(data={"detail": "Sessions revoked"}, message="User sessions revoked")
