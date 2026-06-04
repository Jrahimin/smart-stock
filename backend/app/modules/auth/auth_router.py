from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies.auth_dependencies import get_current_user
from app.core.response_handler import ApiResponse, success_response
from app.core.security_config import UserContext
from app.modules.auth.auth_schemas import (
    AuthMessage,
    ChangePasswordRequest,
    FacebookLoginRequest,
    GoogleLoginRequest,
    LoginRequest,
    LogoutRequest,
    RefreshTokenRequest,
    RegisterRequest,
    ResendVerificationRequest,
    TokenPair,
    UserRead,
    UserUpdateRequest,
    VerifyEmailRequest,
)
from app.modules.auth.auth_service import AuthService, get_auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=ApiResponse[AuthMessage])
async def register(
    request: RegisterRequest,
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> ApiResponse[AuthMessage]:
    await service.register(
        email=request.email,
        password=request.password,
        display_name=request.display_name,
        mobile_number=request.mobile_number,
        gender=request.gender,
        address=request.address,
        profile_pic_url=request.profile_pic_url,
    )
    return success_response(
        data=AuthMessage(detail="Registration created. Please verify your email before logging in."),
        message="Registration created",
    )


@router.post("/verify-email", response_model=ApiResponse[AuthMessage])
async def verify_email(
    request: VerifyEmailRequest,
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> ApiResponse[AuthMessage]:
    await service.verify_email(request.token)
    return success_response(data=AuthMessage(detail="Email verified"), message="Email verified")


@router.post("/resend-verification", response_model=ApiResponse[AuthMessage])
async def resend_verification(
    request: ResendVerificationRequest,
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> ApiResponse[AuthMessage]:
    await service.resend_verification(request.email)
    return success_response(
        data=AuthMessage(detail="If an unverified account exists, a verification email has been sent."),
        message="Verification email requested",
    )


@router.post("/login", response_model=ApiResponse[TokenPair])
async def login(
    request: LoginRequest,
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> ApiResponse[TokenPair]:
    token_pair = await service.login(email=request.email, password=request.password)
    return success_response(data=token_pair, message="Login successful")


@router.post("/refresh", response_model=ApiResponse[TokenPair])
async def refresh(
    request: RefreshTokenRequest,
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> ApiResponse[TokenPair]:
    token_pair = await service.refresh(request.refresh_token)
    return success_response(data=token_pair, message="Token refreshed")


@router.post("/logout", response_model=ApiResponse[AuthMessage])
async def logout(
    request: LogoutRequest,
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> ApiResponse[AuthMessage]:
    await service.logout(request.refresh_token)
    return success_response(data=AuthMessage(detail="Logged out"), message="Logged out")


@router.get("/me", response_model=ApiResponse[UserRead])
async def get_me(
    service: Annotated[AuthService, Depends(get_auth_service)],
    user_context: Annotated[UserContext, Depends(get_current_user)],
) -> ApiResponse[UserRead]:
    user = await service.get_me(user_context)
    return success_response(data=UserRead.model_validate(user), message="Current user retrieved")


@router.patch("/me", response_model=ApiResponse[UserRead])
async def update_me(
    request: UserUpdateRequest,
    service: Annotated[AuthService, Depends(get_auth_service)],
    user_context: Annotated[UserContext, Depends(get_current_user)],
) -> ApiResponse[UserRead]:
    user = await service.update_profile(user_context, request)
    return success_response(data=UserRead.model_validate(user), message="Profile updated")


@router.patch("/change-password", response_model=ApiResponse[AuthMessage])
async def change_password(
    request: ChangePasswordRequest,
    service: Annotated[AuthService, Depends(get_auth_service)],
    user_context: Annotated[UserContext, Depends(get_current_user)],
) -> ApiResponse[AuthMessage]:
    await service.change_password(
        user_context=user_context,
        current_password=request.current_password,
        new_password=request.new_password,
    )
    return success_response(data=AuthMessage(detail="Password changed"), message="Password changed")


@router.post("/google", response_model=ApiResponse[TokenPair])
async def login_with_google(
    request: GoogleLoginRequest,
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> ApiResponse[TokenPair]:
    token_pair = await service.login_with_google(request.id_token)
    return success_response(data=token_pair, message="Google login successful")


@router.post("/facebook", response_model=ApiResponse[TokenPair])
async def login_with_facebook(
    request: FacebookLoginRequest,
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> ApiResponse[TokenPair]:
    token_pair = await service.login_with_facebook(request.access_token)
    return success_response(data=token_pair, message="Facebook login successful")
