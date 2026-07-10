from typing import Annotated
from uuid import UUID

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_repository import BaseRepository
from app.core.database_session import get_db_session
from app.core.enums import OnboardingGuideKey
from app.models import UserOnboardingGuidePreference


class UserPreferencesRepository(BaseRepository[UserOnboardingGuidePreference]):
    model = UserOnboardingGuidePreference

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_onboarding_guide_preference(
        self,
        *,
        user_id: UUID,
        guide_key: OnboardingGuideKey,
    ) -> UserOnboardingGuidePreference | None:
        statement = select(UserOnboardingGuidePreference).where(
            UserOnboardingGuidePreference.user_id == user_id,
            UserOnboardingGuidePreference.guide_key == guide_key,
        )
        return await self.session.scalar(statement)


def get_user_preferences_repository(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> UserPreferencesRepository:
    return UserPreferencesRepository(session)
