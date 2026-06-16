from uuid import UUID

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_repository import BaseRepository
from app.core.constants.admin_operational_settings import SAFE_OPERATIONAL_SETTING_KEYS
from app.core.database_session import get_db_session
from app.core.enums import AdminConfigCategory, ConfigValueType
from app.models import AdminConfigSetting


class AdminConfigurationRepository(BaseRepository[AdminConfigSetting]):
    model = AdminConfigSetting

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_by_key(self, setting_key: str) -> AdminConfigSetting | None:
        statement = select(AdminConfigSetting).where(
            AdminConfigSetting.setting_key == setting_key,
            AdminConfigSetting.is_active.is_(True),
        )
        return await self.session.scalar(statement)

    async def list_active(self) -> list[AdminConfigSetting]:
        statement = (
            select(AdminConfigSetting)
            .where(AdminConfigSetting.is_active.is_(True))
            .order_by(AdminConfigSetting.setting_key.asc())
        )
        result = await self.session.scalars(statement)
        return list(result.all())

    async def upsert_setting(
        self,
        *,
        setting_key: str,
        setting_value: str,
        value_type: ConfigValueType,
        category: AdminConfigCategory,
        requires_restart: bool,
        description: str | None,
        updated_by_user_id: UUID,
    ) -> AdminConfigSetting:
        existing = await self.get_by_key(setting_key)
        if existing is None:
            return await self.create(
                {
                    "setting_key": setting_key,
                    "setting_value": setting_value,
                    "value_type": value_type,
                    "category": category,
                    "requires_restart": requires_restart,
                    "description": description,
                    "updated_by_user_id": updated_by_user_id,
                    "is_active": True,
                }
            )
        return await self.update(
            existing,
            {
                "setting_value": setting_value,
                "value_type": value_type,
                "category": category,
                "requires_restart": requires_restart,
                "description": description,
                "updated_by_user_id": updated_by_user_id,
            },
        )

    def is_safe_key(self, setting_key: str) -> bool:
        return setting_key in SAFE_OPERATIONAL_SETTING_KEYS


def get_admin_configuration_repository(
    session: AsyncSession = Depends(get_db_session),
) -> AdminConfigurationRepository:
    return AdminConfigurationRepository(session)
