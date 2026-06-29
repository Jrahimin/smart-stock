from uuid import UUID

from fastapi import Depends

from app.core.enums import TaxProfileCode
from app.core.exception_handlers import AppError, NotFoundError
from app.core.security_config import UserContext
from app.modules.wealth.tax_config.tax_config_models import ResolvedTaxPlannerConfig
from app.modules.wealth.tax_config.tax_config_registry import (
    INVESTMENT_CATEGORY_DEFINITIONS,
    LOCATION_TIER_DEFINITIONS,
)
from app.modules.wealth.tax_config.tax_config_repository import TaxConfigRepository, get_tax_config_repository
from app.modules.wealth.tax_config.tax_config_resolver import TaxConfigResolver, get_tax_config_resolver
from app.modules.wealth.tax_config.tax_config_schemas import (
    TaxInvestmentCategoriesUpdateRequest,
    TaxInvestmentCategoryRead,
    TaxPlannerAdminConfigRead,
    TaxPlannerConfigRead,
    TaxPlannerConfigScalarsRead,
    TaxPlannerConfigScalarsWrite,
    TaxPlannerInvestmentCategoryRead,
    TaxPlannerInvestmentRebateConfigRead,
    TaxPlannerLocationTierRead,
    TaxPlannerMinimumTaxSummaryRead,
    TaxPlannerSlabsUpdateRequest,
)
from app.modules.wealth.tax_config.tax_config_validation import (
    SlabInput,
    validate_max_salary_exemption,
    validate_minimum_tax_amounts,
    validate_profile_thresholds,
    validate_rebate_config,
    validate_slabs,
)


class TaxConfigService:
    def __init__(self, repository: TaxConfigRepository, resolver: TaxConfigResolver) -> None:
        self.repository = repository
        self.resolver = resolver

    async def get_public_config(self, *, country_code: str = "BD") -> TaxPlannerConfigRead:
        config = await self.resolver.resolve(country_code=country_code)
        return self._build_public_config(config)

    def _build_public_config(self, config: ResolvedTaxPlannerConfig) -> TaxPlannerConfigRead:
        enabled_categories = [
            TaxPlannerInvestmentCategoryRead(
                category_key=category.category_key,
                display_label=category.display_label,
                icon=category.icon,
                sort_order=category.sort_order,
            )
            for category in config.investment_categories
            if category.is_enabled
        ]
        national_amount = None
        location_tiers: list[TaxPlannerLocationTierRead] = []
        for rule in config.minimum_tax_rules:
            if not rule.is_active:
                continue
            if rule.rule_type == "NATIONAL_DEFAULT":
                national_amount = rule.minimum_amount
            elif rule.location_code:
                tier = LOCATION_TIER_DEFINITIONS.get(rule.location_code)
                location_tiers.append(
                    TaxPlannerLocationTierRead(
                        location_code=rule.location_code,
                        label=tier.default_label if tier else rule.location_code,
                        minimum_amount=rule.minimum_amount,
                    )
                )
        return TaxPlannerConfigRead(
            tax_year_label=config.tax_year_label,
            display_name=config.display_name,
            disclaimer=config.disclaimer,
            minimum_tax_note=config.minimum_tax_note,
            investment_rebate=TaxPlannerInvestmentRebateConfigRead(
                taxable_income_limit_pct=config.investment_rebate.taxable_income_limit_pct,
                investment_rebate_pct=config.investment_rebate.investment_rebate_pct,
                maximum_rebate_amount=config.investment_rebate.maximum_rebate_amount,
            ),
            investment_categories=enabled_categories,
            location_tiers=location_tiers,
            minimum_tax=TaxPlannerMinimumTaxSummaryRead(
                national_minimum_amount=national_amount,
                location_tiers=location_tiers,
            ),
            config_source=config.source,
        )

    async def get_admin_config(self, *, country_code: str = "BD") -> TaxPlannerAdminConfigRead:
        settings = await self.repository.get_settings(country_code)
        if settings is None:
            raise NotFoundError("Tax planner settings were not found")
        return TaxPlannerAdminConfigRead(
            config=TaxPlannerConfigScalarsRead.model_validate(settings),
            slabs=[
                {
                    "sort_order": row.sort_order,
                    "band_amount": row.band_amount,
                    "rate": row.rate,
                    "label": row.label,
                    "is_allowance_band": row.is_allowance_band,
                }
                for row in await self.repository.list_slabs()
            ],
        )

    async def update_config_scalars(
        self,
        payload: TaxPlannerConfigScalarsWrite,
        *,
        actor: UserContext,
        country_code: str = "BD",
    ) -> TaxPlannerAdminConfigRead:
        validate_profile_thresholds(
            {
                TaxProfileCode.GENERAL: payload.threshold_general,
                TaxProfileCode.WOMAN_OR_SENIOR: payload.threshold_woman_or_senior,
                TaxProfileCode.PERSON_WITH_DISABILITY: payload.threshold_person_with_disability,
                TaxProfileCode.FREEDOM_FIGHTER: payload.threshold_freedom_fighter,
            }
        )
        validate_rebate_config(
            taxable_income_limit_pct=payload.rebate_taxable_income_limit_pct,
            investment_rebate_pct=payload.rebate_investment_pct,
            maximum_rebate_amount=payload.rebate_maximum_amount,
        )
        validate_minimum_tax_amounts(
            national=payload.minimum_tax_national,
            dhaka_ctg=payload.minimum_tax_dhaka_ctg,
            other_city=payload.minimum_tax_other_city,
            rural=payload.minimum_tax_rural,
        )
        validate_max_salary_exemption(payload.max_salary_exemption)

        settings = await self.repository.get_settings(country_code)
        if settings is None:
            raise NotFoundError("Tax planner settings were not found")
        await self.repository.update(
            settings,
            {
                **payload.model_dump(),
                "updated_by_user_id": UUID(actor.user_id) if actor.user_id != "anonymous" else None,
            },
        )
        await self.repository.commit()
        TaxConfigResolver.invalidate_cache()
        return await self.get_admin_config(country_code=country_code)

    async def update_slabs(
        self,
        payload: TaxPlannerSlabsUpdateRequest,
        *,
        actor: UserContext,
    ) -> TaxPlannerAdminConfigRead:
        del actor
        validate_slabs(
            [
                SlabInput(sort_order=row.sort_order, is_allowance_band=row.is_allowance_band)
                for row in payload.slabs
            ]
        )
        await self.repository.replace_slabs(
            [
                {
                    "sort_order": row.sort_order,
                    "band_amount": row.band_amount,
                    "rate": row.rate,
                    "label": row.label,
                    "is_allowance_band": row.is_allowance_band,
                }
                for row in payload.slabs
            ]
        )
        await self.repository.commit()
        TaxConfigResolver.invalidate_cache()
        return await self.get_admin_config()

    async def list_investment_categories(self) -> list[TaxInvestmentCategoryRead]:
        config = await self.resolver.resolve()
        return [
            TaxInvestmentCategoryRead(
                category_key=category.category_key,
                display_label=category.display_label,
                sort_order=category.sort_order,
                is_enabled=category.is_enabled,
            )
            for category in config.investment_categories
        ]

    async def update_investment_categories(
        self,
        payload: TaxInvestmentCategoriesUpdateRequest,
        *,
        actor: UserContext,
    ) -> list[TaxInvestmentCategoryRead]:
        known_keys = set(INVESTMENT_CATEGORY_DEFINITIONS)
        sort_orders = [row.sort_order for row in payload.categories]
        if len(sort_orders) != len(set(sort_orders)):
            raise AppError("Duplicate investment category sort_order values are not allowed")

        for row in payload.categories:
            if row.category_key not in known_keys:
                raise AppError(f"Unknown investment category key: {row.category_key}")

        await self.repository.replace_investment_categories(
            [
                {
                    "category_key": row.category_key,
                    "display_label": row.display_label,
                    "sort_order": row.sort_order,
                    "is_enabled": row.is_enabled,
                    "updated_by_user_id": UUID(actor.user_id) if actor.user_id != "anonymous" else None,
                }
                for row in payload.categories
            ]
        )
        await self.repository.commit()
        TaxConfigResolver.invalidate_cache()
        return await self.list_investment_categories()


def get_tax_config_service(
    repository: TaxConfigRepository = Depends(get_tax_config_repository),
    resolver: TaxConfigResolver = Depends(get_tax_config_resolver),
) -> TaxConfigService:
    return TaxConfigService(repository, resolver)
