"""Create or update the initial super admin account.

Usage from the ``backend/`` directory::

    python -m app.scripts.seed_super_admin

Environment variables (read from ``backend/.env`` or the process environment):

    SUPER_ADMIN_EMAIL (required)
    SUPER_ADMIN_PASSWORD (required)
    SUPER_ADMIN_DISPLAY_NAME (optional, default: Super Admin)
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
os.chdir(BACKEND_ROOT)

from app.core.dotenv_loader import load_backend_dotenv

load_backend_dotenv()

logger = logging.getLogger(__name__)
LOCAL_PROVIDER = "local"


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed or update the super admin user.")
    return parser.parse_args(argv)


async def seed_super_admin() -> None:
    from app.core.database_session import AsyncSessionLocal
    from app.core.enums import UserRole
    from app.core.security.password_service import hash_password
    from app.modules.auth.auth_repository import AuthRepository

    email = os.environ.get("SUPER_ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("SUPER_ADMIN_PASSWORD", "")
    display_name = os.environ.get("SUPER_ADMIN_DISPLAY_NAME", "Super Admin").strip() or "Super Admin"

    if not email or not password:
        raise SystemExit("SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD environment variables are required")

    async with AsyncSessionLocal() as session:
        repository = AuthRepository(session)
        user = await repository.get_user_by_email(email)
        password_hash = hash_password(password)
        now = datetime.now(UTC)

        if user is None:
            user = await repository.create_user(
                email=email,
                display_name=display_name,
                password_hash=password_hash,
                email_verified_at=now,
            )
            await repository.create_identity(
                user_id=user.id,
                provider=LOCAL_PROVIDER,
                provider_subject_id=email,
            )
            user.role = UserRole.SUPER_ADMIN
            logger.info("Created super admin user for %s", email)
        else:
            user.display_name = display_name
            user.password_hash = password_hash
            user.role = UserRole.SUPER_ADMIN
            user.is_active = True
            user.deleted_at = None
            user.deleted_by_user_id = None
            if user.email_verified_at is None:
                user.email_verified_at = now
            logger.info("Updated super admin user for %s", email)

        await repository.commit()


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    _parse_args(argv)
    asyncio.run(seed_super_admin())


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except KeyboardInterrupt:
        raise SystemExit(130) from None
