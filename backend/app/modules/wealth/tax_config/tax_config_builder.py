from decimal import Decimal

from app.models import TaxPlannerSettings
from app.modules.wealth.tax_config.tax_config_models import (
    ResolvedInvestmentRebateConfig,
    ResolvedMinimumTaxRule,
    ResolvedTaxFreeThresholds,
)
from app.modules.wealth.tax_config.tax_config_registry import MINIMUM_TAX_AMOUNT_FIELDS, MINIMUM_TAX_DEFINITIONS


def thresholds_from_settings(settings: TaxPlannerSettings) -> ResolvedTaxFreeThresholds:
    return ResolvedTaxFreeThresholds(
        general=settings.threshold_general,
        woman_or_senior=settings.threshold_woman_or_senior,
        person_with_disability=settings.threshold_person_with_disability,
        freedom_fighter=settings.threshold_freedom_fighter,
    )


def rebate_from_settings(settings: TaxPlannerSettings) -> ResolvedInvestmentRebateConfig:
    return ResolvedInvestmentRebateConfig(
        taxable_income_limit_pct=settings.rebate_taxable_income_limit_pct,
        investment_rebate_pct=settings.rebate_investment_pct,
        maximum_rebate_amount=settings.rebate_maximum_amount,
    )


def minimum_tax_rules_from_settings(settings: TaxPlannerSettings) -> tuple[ResolvedMinimumTaxRule, ...]:
    rules: list[ResolvedMinimumTaxRule] = []
    for rule_code, rule_type, location_code in MINIMUM_TAX_DEFINITIONS:
        field_name = MINIMUM_TAX_AMOUNT_FIELDS[rule_code]
        amount: Decimal = getattr(settings, field_name)
        rules.append(
            ResolvedMinimumTaxRule(
                rule_code=rule_code,
                rule_type=rule_type,
                location_code=location_code or None,
                minimum_amount=amount,
                is_active=amount > 0,
            )
        )
    return tuple(rules)
