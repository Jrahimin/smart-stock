from dataclasses import replace
from decimal import Decimal

from fastapi import Depends

from app.core.enums import TaxPlannerGender, TaxPlannerInsightType, TaxPlannerMode, WealthInsightSeverity
from app.modules.wealth.formulas.financial_formulas import calculate_investment_rebate, calculate_progressive_tax
from app.modules.wealth.tax_config.tax_config_models import ResolvedTaxPlannerConfig
from app.modules.wealth.tax_config.tax_config_resolver import TaxConfigResolver, get_tax_config_resolver
from app.modules.wealth.wealth_schemas import (
    TaxPlannerCalculateRequest,
    TaxPlannerCalculateResponse,
    TaxPlannerIncomeInput,
    TaxPlannerInsight,
    TaxPlannerInvestmentInput,
    TaxPlannerProfileInput,
    TaxPlannerSlabBreakdown,
)


def _non_negative(value: Decimal | None) -> Decimal:
    if value is None:
        return Decimal("0")
    return max(value, Decimal("0"))


class TaxPlannerService:
    def __init__(self, resolver: TaxConfigResolver) -> None:
        self.resolver = resolver

    async def calculate(self, payload: TaxPlannerCalculateRequest) -> TaxPlannerCalculateResponse:
        config = await self.resolver.resolve()
        return self._calculate_with_config(payload, config)

    def calculate_with_config(
        self,
        payload: TaxPlannerCalculateRequest,
        config: ResolvedTaxPlannerConfig,
    ) -> TaxPlannerCalculateResponse:
        return self._calculate_with_config(payload, config)

    def _calculate_with_config(
        self,
        payload: TaxPlannerCalculateRequest,
        config: ResolvedTaxPlannerConfig,
    ) -> TaxPlannerCalculateResponse:
        income = payload.income
        profile = payload.profile
        investments = payload.investments

        total_income = self._calculate_total_income(income).quantize(Decimal("0.01"))
        tax_free_allowance = self._resolve_tax_free_allowance(profile, config.thresholds)
        taxable_income = max(total_income - tax_free_allowance, Decimal("0")).quantize(Decimal("0.01"))

        slabs = config.slabs
        if slabs and slabs[0].is_allowance_band:
            first_slab = replace(slabs[0], amount=tax_free_allowance)
            slab_tuple = (first_slab, *slabs[1:])
        else:
            slab_tuple = slabs

        gross_tax, slab_breakdown = calculate_progressive_tax(total_income, slab_tuple)
        actual_investment = self._calculate_tax_saving_investments(
            payload.mode,
            investments,
            config,
        )

        rebate_config = config.investment_rebate
        (
            current_eligible_investment,
            maximum_eligible_investment,
            remaining_eligible_investment,
            calculated_rebate,
        ) = calculate_investment_rebate(
            taxable_income=total_income,
            actual_investment=actual_investment,
            max_income_percentage=rebate_config.max_income_percentage,
            max_amount=rebate_config.max_amount,
            rebate_rate=rebate_config.rebate_rate,
        )

        rebate = min(calculated_rebate, gross_tax).quantize(Decimal("0.01"))
        if rebate_config.max_rebate_amount is not None:
            rebate = min(rebate, rebate_config.max_rebate_amount).quantize(Decimal("0.01"))

        tax_after_rebate = max(gross_tax - rebate, Decimal("0")).quantize(Decimal("0.01"))
        minimum_tax_applied, minimum_tax_rule_code = self._resolve_minimum_tax(profile, config, tax_after_rebate)
        final_tax = max(tax_after_rebate, minimum_tax_applied).quantize(Decimal("0.01"))

        potential_additional_tax_saving = min(
            remaining_eligible_investment * rebate_config.rebate_rate / Decimal("100"),
            gross_tax - rebate,
        ).quantize(Decimal("0.01"))

        insights = self._build_insights(
            income=income,
            profile=profile,
            gross_tax=gross_tax,
            actual_investment=actual_investment,
            maximum_eligible_investment=maximum_eligible_investment,
            remaining_eligible_investment=remaining_eligible_investment,
            potential_additional_tax_saving=potential_additional_tax_saving,
            minimum_tax_applied=minimum_tax_applied,
            minimum_tax_rule_code=minimum_tax_rule_code,
            config=config,
        )

        return TaxPlannerCalculateResponse(
            tax_year_label=config.tax_year_label,
            mode=payload.mode,
            total_income=total_income,
            tax_free_allowance=tax_free_allowance,
            taxable_income=taxable_income,
            gross_tax=gross_tax,
            rebate=rebate,
            final_tax=final_tax,
            minimum_tax_applied=minimum_tax_applied,
            minimum_tax_rule_code=minimum_tax_rule_code,
            current_eligible_investment=current_eligible_investment,
            maximum_eligible_investment=maximum_eligible_investment,
            remaining_eligible_investment=remaining_eligible_investment,
            potential_additional_tax_saving=potential_additional_tax_saving,
            slab_breakdown=[TaxPlannerSlabBreakdown(**item) for item in slab_breakdown],
            insights=insights,
            assumptions_used={
                "tax_year_label": config.tax_year_label,
                "config_source": config.source,
                "tax_free_allowance": str(tax_free_allowance),
                "investment_rebate_rate": str(rebate_config.rebate_rate),
                "investment_cap_percentage": str(rebate_config.max_income_percentage),
                "investment_max_amount": str(rebate_config.max_amount),
                "minimum_tax_note": config.minimum_tax_note,
                "minimum_tax_applied": str(minimum_tax_applied),
                "minimum_tax_rule_code": minimum_tax_rule_code or "",
            },
            disclaimer=config.disclaimer,
        )

    def _resolve_minimum_tax(
        self,
        profile: TaxPlannerProfileInput,
        config: ResolvedTaxPlannerConfig,
        tax_after_rebate: Decimal,
    ) -> tuple[Decimal, str | None]:
        if tax_after_rebate <= 0 or not config.minimum_tax_rules:
            return Decimal("0"), None

        active_rules = [rule for rule in config.minimum_tax_rules if rule.is_active]
        if not active_rules:
            return Decimal("0"), None

        location_code = profile.location_code
        if location_code:
            for rule in active_rules:
                if rule.location_code == location_code:
                    return rule.minimum_amount.quantize(Decimal("0.01")), rule.rule_code

        for rule in active_rules:
            if rule.rule_type == "NATIONAL_DEFAULT":
                return rule.minimum_amount.quantize(Decimal("0.01")), rule.rule_code

        return Decimal("0"), None

    def _calculate_total_income(self, income: TaxPlannerIncomeInput) -> Decimal:
        return sum(
            (
                _non_negative(income.annual_salary),
                _non_negative(income.other_yearly_income),
                _non_negative(income.festival_bonus),
                _non_negative(income.other_employment_benefits),
                _non_negative(income.self_employment_income),
                _non_negative(income.rental_income),
                _non_negative(income.bank_interest),
                _non_negative(income.fdr_profit),
                _non_negative(income.dps_profit),
                _non_negative(income.sanchayapatra_profit),
                _non_negative(income.dividend_income),
                _non_negative(income.other_income),
            ),
            Decimal("0"),
        )

    def _calculate_tax_saving_investments(
        self,
        mode: TaxPlannerMode,
        investments: TaxPlannerInvestmentInput,
        config: ResolvedTaxPlannerConfig,
    ) -> Decimal:
        enabled_fields = {
            category.request_field
            for category in config.investment_categories
            if category.is_enabled
        }

        if mode == TaxPlannerMode.QUICK and investments.tax_saving_investments is not None:
            actual_investment = _non_negative(investments.tax_saving_investments)
        else:
            field_values = {
                "tax_saving_investments": _non_negative(investments.tax_saving_investments),
                "life_insurance": _non_negative(investments.life_insurance),
                "provident_fund": _non_negative(investments.provident_fund),
                "dps_or_savings": _non_negative(investments.dps_or_savings),
                "sanchayapatra": _non_negative(investments.sanchayapatra),
                "stock_market": _non_negative(investments.stock_market),
                "mutual_funds": _non_negative(investments.mutual_funds),
                "approved_donations": _non_negative(investments.approved_donations),
                "other_eligible_investment": _non_negative(investments.other_eligible_investment),
            }
            actual_investment = sum(
                (
                    value
                    for field_name, value in field_values.items()
                    if field_name == "tax_saving_investments" or field_name in enabled_fields
                ),
                Decimal("0"),
            )

        return (actual_investment + _non_negative(investments.simulation_additional_investment)).quantize(
            Decimal("0.01")
        )

    def _resolve_tax_free_allowance(self, profile: TaxPlannerProfileInput, thresholds) -> Decimal:
        if profile.freedom_fighter:
            return thresholds.freedom_fighter
        if profile.person_with_disability:
            return thresholds.person_with_disability
        if (
            profile.senior_citizen
            or (profile.age is not None and profile.age >= 65)
            or profile.gender == TaxPlannerGender.FEMALE
        ):
            return thresholds.woman_or_senior
        return thresholds.general

    def _build_insights(
        self,
        *,
        income: TaxPlannerIncomeInput,
        profile: TaxPlannerProfileInput,
        gross_tax: Decimal,
        actual_investment: Decimal,
        maximum_eligible_investment: Decimal,
        remaining_eligible_investment: Decimal,
        potential_additional_tax_saving: Decimal,
        minimum_tax_applied: Decimal,
        minimum_tax_rule_code: str | None,
        config: ResolvedTaxPlannerConfig,
    ) -> list[TaxPlannerInsight]:
        insights: list[TaxPlannerInsight] = []

        if remaining_eligible_investment > 0 and potential_additional_tax_saving > 0:
            insights.append(
                TaxPlannerInsight(
                    id="unused-rebate-opportunity",
                    type=TaxPlannerInsightType.UNUSED_REBATE_OPPORTUNITY,
                    title="You still have room for tax saving investments",
                    body="Adding tax saving investments may reduce your estimated tax further.",
                    severity=WealthInsightSeverity.POSITIVE,
                    amount=remaining_eligible_investment,
                )
            )

        if (
            maximum_eligible_investment > 0
            and remaining_eligible_investment >= maximum_eligible_investment * Decimal("0.5")
            and potential_additional_tax_saving > 0
        ):
            insights.append(
                TaxPlannerInsight(
                    id="high-remaining-investment-capacity",
                    type=TaxPlannerInsightType.HIGH_REMAINING_INVESTMENT_CAPACITY,
                    title="A meaningful savings opportunity may remain",
                    body="Your current entry leaves a larger part of the tax saving investment room unused.",
                    severity=WealthInsightSeverity.POSITIVE,
                    amount=potential_additional_tax_saving,
                )
            )

        if actual_investment <= 0 and gross_tax > 0:
            insights.append(
                TaxPlannerInsight(
                    id="no-tax-saving-investments",
                    type=TaxPlannerInsightType.NO_ELIGIBLE_INVESTMENTS,
                    title="Tax saving investments can change the estimate",
                    body="Life insurance, provident fund, stocks, mutual funds, and government savings certificates may affect your rebate.",
                    severity=WealthInsightSeverity.INFO,
                )
            )

        if self._count_income_sources(income) > 1:
            insights.append(
                TaxPlannerInsight(
                    id="multiple-income-sources",
                    type=TaxPlannerInsightType.MULTIPLE_INCOME_SOURCES,
                    title="You have more than one income source",
                    body="Reviewing all yearly earnings together can make the estimate more useful for planning.",
                    severity=WealthInsightSeverity.INFO,
                )
            )

        if not profile.resident_individual:
            insights.append(
                TaxPlannerInsight(
                    id="out-of-scope-profile",
                    type=TaxPlannerInsightType.OUT_OF_SCOPE_PROFILE,
                    title="This estimate is designed for resident individuals",
                    body="If your situation is different, the result can still help planning but may be less accurate.",
                    severity=WealthInsightSeverity.INFO,
                )
            )

        if minimum_tax_applied > 0 and minimum_tax_rule_code:
            insights.append(
                TaxPlannerInsight(
                    id="minimum-tax-applied",
                    type=TaxPlannerInsightType.MINIMUM_TAX_APPLIED,
                    title="A minimum tax floor was applied",
                    body="Your estimated tax reflects the applicable minimum tax rule for your location.",
                    severity=WealthInsightSeverity.INFO,
                    amount=minimum_tax_applied,
                )
            )
        elif not any(rule.is_active for rule in config.minimum_tax_rules):
            insights.append(
                TaxPlannerInsight(
                    id="minimum-tax-not-modeled",
                    type=TaxPlannerInsightType.MINIMUM_TAX_NOT_MODELED,
                    title="Some filing details are intentionally left out",
                    body=config.minimum_tax_note,
                    severity=WealthInsightSeverity.NEUTRAL,
                )
            )

        return insights

    def _count_income_sources(self, income: TaxPlannerIncomeInput) -> int:
        groups = (
            _non_negative(income.annual_salary)
            + _non_negative(income.festival_bonus)
            + _non_negative(income.other_employment_benefits),
            _non_negative(income.other_yearly_income),
            _non_negative(income.self_employment_income),
            _non_negative(income.rental_income),
            _non_negative(income.bank_interest)
            + _non_negative(income.fdr_profit)
            + _non_negative(income.dps_profit)
            + _non_negative(income.sanchayapatra_profit),
            _non_negative(income.dividend_income),
            _non_negative(income.other_income),
        )
        return sum(1 for value in groups if value > 0)


def get_tax_planner_service(
    resolver: TaxConfigResolver = Depends(get_tax_config_resolver),
) -> TaxPlannerService:
    return TaxPlannerService(resolver)
