import json
from uuid import UUID

from fastapi import Depends
from pydantic import BaseModel, Field

from app.core.constants.admin_operational_settings import SAFE_OPERATIONAL_SETTINGS
from app.core.core_config import Settings, get_settings
from app.core.enums import AdminConfigCategory, ConfigValueType
from app.core.exception_handlers import AppError, NotFoundError
from app.core.security_config import UserContext
from app.modules.admin_configuration.admin_configuration_repository import (
    AdminConfigurationRepository,
    get_admin_configuration_repository,
)


class AdminConfigSettingRead(BaseModel):
    key: str
    value: str
    value_type: ConfigValueType
    category: AdminConfigCategory
    requires_restart: bool
    description: str | None
    source: str


class AdminConfigSettingUpdateRequest(BaseModel):
    value: str = Field(min_length=1)


class AdminConfigurationService:
    def __init__(self, repository: AdminConfigurationRepository, settings: Settings) -> None:
        self.repository = repository
        self.settings = settings

    async def list_settings(self) -> list[AdminConfigSettingRead]:
        overrides = {item.setting_key: item for item in await self.repository.list_active()}
        items: list[AdminConfigSettingRead] = []
        for definition in SAFE_OPERATIONAL_SETTINGS:
            override = overrides.get(definition.key)
            if override is not None:
                items.append(
                    AdminConfigSettingRead(
                        key=definition.key,
                        value=override.setting_value,
                        value_type=override.value_type,
                        category=override.category,
                        requires_restart=override.requires_restart,
                        description=override.description or definition.description,
                        source="database",
                    )
                )
            else:
                items.append(
                    AdminConfigSettingRead(
                        key=definition.key,
                        value=str(getattr(self.settings, definition.default_attr)),
                        value_type=definition.value_type,
                        category=definition.category,
                        requires_restart=definition.requires_restart,
                        description=definition.description,
                        source="environment",
                    )
                )
        return items

    async def update_setting(
        self,
        *,
        setting_key: str,
        payload: AdminConfigSettingUpdateRequest,
        actor: UserContext,
    ) -> AdminConfigSettingRead:
        definition = next((item for item in SAFE_OPERATIONAL_SETTINGS if item.key == setting_key), None)
        if definition is None:
            raise NotFoundError("Configuration setting was not found")
        normalized_value = self._normalize_value(definition.value_type, payload.value)
        saved = await self.repository.upsert_setting(
            setting_key=setting_key,
            setting_value=normalized_value,
            value_type=definition.value_type,
            category=definition.category,
            requires_restart=definition.requires_restart,
            description=definition.description,
            updated_by_user_id=UUID(actor.user_id),
        )
        await self.repository.commit()
        return AdminConfigSettingRead(
            key=saved.setting_key,
            value=saved.setting_value,
            value_type=saved.value_type,
            category=saved.category,
            requires_restart=saved.requires_restart,
            description=saved.description,
            source="database",
        )

    @staticmethod
    def _normalize_value(value_type: ConfigValueType, raw_value: str) -> str:
        if value_type == ConfigValueType.BOOLEAN:
            normalized = raw_value.strip().lower()
            if normalized not in {"true", "false", "1", "0", "yes", "no"}:
                raise AppError("Boolean settings must be true or false")
            return "true" if normalized in {"true", "1", "yes"} else "false"
        if value_type == ConfigValueType.INTEGER:
            try:
                return str(int(raw_value))
            except ValueError as exc:
                raise AppError("Integer settings must be valid numbers") from exc
        if value_type == ConfigValueType.FLOAT:
            try:
                return str(float(raw_value))
            except ValueError as exc:
                raise AppError("Float settings must be valid numbers") from exc
        if value_type == ConfigValueType.JSON:
            try:
                json.loads(raw_value)
            except json.JSONDecodeError as exc:
                raise AppError("JSON settings must be valid JSON") from exc
            return raw_value.strip()
        return raw_value.strip()


def get_admin_configuration_service(
    repository: AdminConfigurationRepository = Depends(get_admin_configuration_repository),
    settings: Settings = Depends(get_settings),
) -> AdminConfigurationService:
    return AdminConfigurationService(repository, settings)
