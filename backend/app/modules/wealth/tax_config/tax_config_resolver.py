from dataclasses import replace

from fastapi import Depends

from app.models import TaxInvestmentCategory, TaxPlannerSettings
from app.modules.wealth.tax_config.tax_config_builder import (
    minimum_tax_rules_from_settings,
    rebate_from_settings,
    thresholds_from_settings,
)
from app.modules.wealth.tax_config.tax_config_python_fallback import build_fallback_resolved_config
from app.modules.wealth.tax_config.tax_config_models import (
    ResolvedInvestmentCategory,
    ResolvedTaxPlannerConfig,
    ResolvedTaxSlab,
)
from app.modules.wealth.tax_config.tax_config_registry import (
    INVESTMENT_CATEGORY_DEFINITIONS,
    INVESTMENT_CATEGORY_SEED_ORDER,
)
from app.modules.wealth.tax_config.tax_config_repository import TaxConfigRepository, get_tax_config_repository


class TaxConfigResolver:
    _config_cache: dict[str, ResolvedTaxPlannerConfig] = {}

    def __init__(self, repository: TaxConfigRepository) -> None:
        self.repository = repository

    @classmethod
    def invalidate_cache(cls) -> None:
        cls._config_cache.clear()

    async def resolve(self, *, country_code: str = "BD") -> ResolvedTaxPlannerConfig:
        cached = self._config_cache.get(country_code)
        if cached is not None:
            return cached

        settings = await self.repository.get_settings(country_code)
        slabs = await self.repository.list_slabs()
        categories = await self._load_investment_categories()

        if settings is None or not slabs:
            fallback = build_fallback_resolved_config()
            config = replace(fallback, investment_categories=categories) if categories else fallback
            self._config_cache[country_code] = config
            return config

        config = self._from_database(settings=settings, slabs=slabs, categories=categories)
        self._config_cache[country_code] = config
        return config

    async def _load_investment_categories(self) -> tuple[ResolvedInvestmentCategory, ...]:
        rows = await self.repository.list_investment_categories()
        if not rows:
            return self._default_investment_categories()
        return self._merge_investment_categories(rows)

    def _merge_investment_categories(
        self,
        rows: list[TaxInvestmentCategory],
    ) -> tuple[ResolvedInvestmentCategory, ...]:
        row_by_key = {row.category_key: row for row in rows}
        merged: list[ResolvedInvestmentCategory] = []
        for category_key in INVESTMENT_CATEGORY_SEED_ORDER:
            definition = INVESTMENT_CATEGORY_DEFINITIONS.get(category_key)
            if definition is None:
                continue
            row = row_by_key.get(category_key)
            if row is None:
                merged.append(
                    ResolvedInvestmentCategory(
                        category_key=definition.category_key,
                        request_field=definition.request_field,
                        display_label=definition.default_label,
                        icon=definition.default_icon,
                        sort_order=len(merged) + 1,
                        is_enabled=True,
                    )
                )
                continue
            merged.append(
                ResolvedInvestmentCategory(
                    category_key=definition.category_key,
                    request_field=definition.request_field,
                    display_label=row.display_label or definition.default_label,
                    icon=definition.default_icon,
                    sort_order=row.sort_order,
                    is_enabled=row.is_enabled,
                )
            )
        merged.sort(key=lambda item: item.sort_order)
        return tuple(merged)

    def _default_investment_categories(self) -> tuple[ResolvedInvestmentCategory, ...]:
        return tuple(
            ResolvedInvestmentCategory(
                category_key=definition.category_key,
                request_field=definition.request_field,
                display_label=definition.default_label,
                icon=definition.default_icon,
                sort_order=index + 1,
                is_enabled=True,
            )
            for index, category_key in enumerate(INVESTMENT_CATEGORY_SEED_ORDER)
            if (definition := INVESTMENT_CATEGORY_DEFINITIONS.get(category_key)) is not None
        )

    def _from_database(
        self,
        *,
        settings: TaxPlannerSettings,
        slabs: list,
        categories: tuple[ResolvedInvestmentCategory, ...],
    ) -> ResolvedTaxPlannerConfig:
        return ResolvedTaxPlannerConfig(
            tax_year_label=settings.tax_year_label,
            display_name=settings.display_name,
            country_code=settings.country_code,
            thresholds=thresholds_from_settings(settings),
            slabs=tuple(
                ResolvedTaxSlab(
                    amount=row.band_amount,
                    rate=row.rate,
                    label=row.label,
                    is_allowance_band=row.is_allowance_band,
                )
                for row in slabs
            ),
            investment_rebate=rebate_from_settings(settings),
            max_salary_exemption=settings.max_salary_exemption,
            minimum_tax_rules=minimum_tax_rules_from_settings(settings),
            investment_categories=categories,
            disclaimer=settings.disclaimer,
            minimum_tax_note=settings.minimum_tax_note,
            source="database",
        )


def get_tax_config_resolver(
    repository: TaxConfigRepository = Depends(get_tax_config_repository),
) -> TaxConfigResolver:
    return TaxConfigResolver(repository)
