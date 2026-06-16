import asyncio
import smtplib
from email.message import EmailMessage
from urllib.parse import urlencode

from fastapi import Depends

from app.core.core_config import Settings, get_settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)


class MailService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def send_verification_email(self, *, email: str, display_name: str, token: str) -> None:
        verification_url = _build_verification_url(self.settings.frontend_base_url, token)
        subject = "Verify your Smart Stock account"
        body = (
            f"Hi {display_name},\n\n"
            "Please verify your Smart Stock account by opening this link:\n"
            f"{verification_url}\n\n"
            "If you did not create this account, you can ignore this email.\n"
        )
        await self._send_email(to_email=email, subject=subject, body=body)

    async def send_email(
        self,
        *,
        to_email: str,
        subject: str,
        body: str,
        body_html: str | None = None,
    ) -> None:
        await self._send_email(to_email=to_email, subject=subject, body=body, body_html=body_html)

    async def _send_email(
        self,
        *,
        to_email: str,
        subject: str,
        body: str,
        body_html: str | None = None,
    ) -> None:
        if not self.settings.smtp_host:
            logger.info("SMTP is not configured; verification email body follows:\n%s", body)
            return

        await asyncio.to_thread(
            self._send_email_sync,
            to_email=to_email,
            subject=subject,
            body=body,
            body_html=body_html,
        )

    def _send_email_sync(
        self,
        *,
        to_email: str,
        subject: str,
        body: str,
        body_html: str | None = None,
    ) -> None:
        message = EmailMessage()
        message["From"] = self.settings.mail_from
        message["To"] = to_email
        message["Subject"] = subject
        message.set_content(body)
        if body_html:
            message.add_alternative(body_html, subtype="html")

        with smtplib.SMTP(self.settings.smtp_host, self.settings.smtp_port) as smtp:
            smtp.starttls()
            if self.settings.smtp_user and self.settings.smtp_password:
                smtp.login(self.settings.smtp_user, self.settings.smtp_password)
            smtp.send_message(message)


def _build_verification_url(frontend_base_url: str, token: str) -> str:
    base_url = frontend_base_url.rstrip("/")
    query = urlencode({"token": token})
    return f"{base_url}/verify-email?{query}"


def get_mail_service(settings: Settings = Depends(get_settings)) -> MailService:
    return MailService(settings)
