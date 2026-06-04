from dataclasses import dataclass

import httpx
from fastapi import Depends
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.core.core_config import Settings, get_settings
from app.core.exception_handlers import AppError, UnauthorizedError


@dataclass(frozen=True)
class SocialUserInfo:
    provider: str
    provider_subject_id: str
    email: str | None
    display_name: str
    profile_pic_url: str | None = None


class SocialVerifier:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def verify_google_id_token(self, raw_token: str) -> SocialUserInfo:
        if not self.settings.google_client_id:
            raise AppError("Google sign-in is not configured")

        try:
            claims = google_id_token.verify_oauth2_token(
                raw_token,
                google_requests.Request(),
                self.settings.google_client_id,
            )
        except ValueError as exc:
            raise UnauthorizedError("Invalid Google token") from exc

        subject = str(claims.get("sub") or "")
        email = claims.get("email")
        display_name = str(claims.get("name") or email or "Google User")
        if not subject or not email:
            raise UnauthorizedError("Google token is missing required account information")

        picture = claims.get("picture")
        profile_pic_url = str(picture) if picture else None

        return SocialUserInfo(
            provider="google",
            provider_subject_id=subject,
            email=str(email).lower(),
            display_name=display_name,
            profile_pic_url=profile_pic_url,
        )

    async def verify_facebook_access_token(self, access_token: str) -> SocialUserInfo:
        if not self.settings.facebook_app_id or not self.settings.facebook_app_secret:
            raise AppError("Facebook sign-in is not configured")

        app_access_token = f"{self.settings.facebook_app_id}|{self.settings.facebook_app_secret}"
        async with httpx.AsyncClient(timeout=10) as client:
            debug_response = await client.get(
                "https://graph.facebook.com/debug_token",
                params={"input_token": access_token, "access_token": app_access_token},
            )
            debug_response.raise_for_status()
            debug_payload = debug_response.json()
            data = debug_payload.get("data", {})
            if not data.get("is_valid"):
                raise UnauthorizedError("Invalid Facebook token")

            profile_response = await client.get(
                "https://graph.facebook.com/me",
                params={"fields": "id,email,name", "access_token": access_token},
            )
            profile_response.raise_for_status()
            profile_payload = profile_response.json()

        subject = str(profile_payload.get("id") or "")
        email = profile_payload.get("email")
        display_name = str(profile_payload.get("name") or email or "Facebook User")
        if not subject:
            raise UnauthorizedError("Facebook token is missing account information")

        return SocialUserInfo(
            provider="facebook",
            provider_subject_id=subject,
            email=str(email).lower() if email else None,
            display_name=display_name,
        )


def get_social_verifier(settings: Settings = Depends(get_settings)) -> SocialVerifier:
    return SocialVerifier(settings)
