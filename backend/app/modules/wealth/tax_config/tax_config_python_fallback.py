from app.modules.wealth.bangladesh_tax_config import get_active_tax_config
from app.modules.wealth.tax_config.tax_config_models import (
    ResolvedInvestmentCategory,
    ResolvedInvestmentRebateConfig,
    ResolvedTaxFreeThresholds,
    ResolvedTaxPlannerConfig,
    ResolvedTaxSlab,
)
from app.modules.wealth.tax_config.tax_config_registry import (
    INVESTMENT_CATEGORY_DEFINITIONS,
    INVESTMENT_CATEGORY_SEED_ORDER,
)


def build_fallback_resolved_config() -> ResolvedTaxPlannerConfig:
    python_config = get_active_tax_config()
    categories = tuple(
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
    return ResolvedTaxPlannerConfig(
        tax_year_label=python_config.tax_year_label,
        display_name=python_config.display_name,
        country_code="BD",
        thresholds=ResolvedTaxFreeThresholds(
            general=python_config.thresholds.general,
            woman_or_senior=python_config.thresholds.woman_or_senior,
            person_with_disability=python_config.thresholds.person_with_disability,
            freedom_fighter=python_config.thresholds.freedom_fighter,
        ),
        slabs=tuple(
            ResolvedTaxSlab(
                amount=slab.amount,
                rate=slab.rate,
                label=slab.label,
                is_allowance_band=index == 0,
            )
            for index, slab in enumerate(python_config.slabs)
        ),
        investment_rebate=ResolvedInvestmentRebateConfig(
            taxable_income_limit_pct=python_config.investment_rebate.taxable_income_limit_pct,
            investment_rebate_pct=python_config.investment_rebate.investment_rebate_pct,
            maximum_rebate_amount=python_config.investment_rebate.maximum_rebate_amount,
        ),
        max_salary_exemption=python_config.max_salary_exemption,
        minimum_tax_rules=(),
        investment_categories=categories,
        disclaimer=python_config.disclaimer,
        minimum_tax_note=python_config.minimum_tax_note,
        source="python_fallback",
    )
