from dataclasses import replace
from decimal import Decimal

from app.core.enums import TaxPlannerGender, TaxPlannerInsightType, TaxPlannerMode, WealthInsightSeverity
from app.modules.wealth.bangladesh_tax_config import get_enabled_tax_year_config
from app.modules.wealth.formulas.financial_formulas import calculate_investment_rebate, calculate_progressive_tax
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
    def calculate(self, payload: TaxPlannerCalculateRequest) -> TaxPlannerCalculateResponse:
        config = get_enabled_tax_year_config(payload.fiscal_year)
        income = payload.income
        profile = payload.profile
        investments = payload.investments

        total_income = self._calculate_total_income(income).quantize(Decimal("0.01"))
        tax_free_allowance = self._resolve_tax_free_allowance(profile, config.thresholds)
        taxable_income = max(total_income - tax_free_allowance, Decimal("0")).quantize(Decimal("0.01"))
        slabs = (replace(config.slabs[0], amount=tax_free_allowance), *config.slabs[1:])
        gross_tax, slab_breakdown = calculate_progressive_tax(total_income, slabs)
        actual_investment = self._calculate_tax_saving_investments(payload.mode, investments)

        (
            current_eligible_investment,
            maximum_eligible_investment,
            remaining_eligible_investment,
            calculated_rebate,
        ) = calculate_investment_rebate(
            taxable_income=total_income,
            actual_investment=actual_investment,
            max_income_percentage=config.investment_rebate.max_income_percentage,
            max_amount=config.investment_rebate.max_amount,
            rebate_rate=config.investment_rebate.rebate_rate,
        )

        rebate = min(calculated_rebate, gross_tax).quantize(Decimal("0.01"))
        final_tax = max(gross_tax - rebate, Decimal("0")).quantize(Decimal("0.01"))
        potential_additional_tax_saving = min(
            remaining_eligible_investment * config.investment_rebate.rebate_rate / Decimal("100"),
            gross_tax - rebate,
        ).quantize(Decimal("0.01"))

        return TaxPlannerCalculateResponse(
            fiscal_year=config.fiscal_year,
            mode=payload.mode,
            total_income=total_income,
            tax_free_allowance=tax_free_allowance,
            taxable_income=taxable_income,
            gross_tax=gross_tax,
            rebate=rebate,
            final_tax=final_tax,
            current_eligible_investment=current_eligible_investment,
            maximum_eligible_investment=maximum_eligible_investment,
            remaining_eligible_investment=remaining_eligible_investment,
            potential_additional_tax_saving=potential_additional_tax_saving,
            slab_breakdown=[TaxPlannerSlabBreakdown(**item) for item in slab_breakdown],
            insights=self._build_insights(
                income=income,
                profile=profile,
                gross_tax=gross_tax,
                actual_investment=actual_investment,
                maximum_eligible_investment=maximum_eligible_investment,
                remaining_eligible_investment=remaining_eligible_investment,
                potential_additional_tax_saving=potential_additional_tax_saving,
            ),
            assumptions_used={
                "fiscal_year": config.fiscal_year,
                "tax_free_allowance": str(tax_free_allowance),
                "investment_rebate_rate": str(config.investment_rebate.rebate_rate),
                "investment_cap_percentage": str(config.investment_rebate.max_income_percentage),
                "investment_max_amount": str(config.investment_rebate.max_amount),
                "minimum_tax_note": config.minimum_tax_note,
            },
            disclaimer=config.disclaimer,
        )

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
    ) -> Decimal:
        if mode == TaxPlannerMode.QUICK and investments.tax_saving_investments is not None:
            actual_investment = _non_negative(investments.tax_saving_investments)
        else:
            actual_investment = sum(
                (
                    _non_negative(investments.tax_saving_investments),
                    _non_negative(investments.life_insurance),
                    _non_negative(investments.provident_fund),
                    _non_negative(investments.dps_or_savings),
                    _non_negative(investments.sanchayapatra),
                    _non_negative(investments.stock_market),
                    _non_negative(investments.mutual_funds),
                    _non_negative(investments.approved_donations),
                    _non_negative(investments.other_eligible_investment),
                ),
                Decimal("0"),
            )
        return (actual_investment + _non_negative(investments.simulation_additional_investment)).quantize(Decimal("0.01"))

    def _resolve_tax_free_allowance(self, profile: TaxPlannerProfileInput, thresholds) -> Decimal:
        if profile.freedom_fighter:
            return thresholds.freedom_fighter
        if profile.person_with_disability:
            return thresholds.person_with_disability
        if profile.senior_citizen or (profile.age is not None and profile.age >= 65) or profile.gender == TaxPlannerGender.FEMALE:
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

        insights.append(
            TaxPlannerInsight(
                id="minimum-tax-not-modeled",
                type=TaxPlannerInsightType.MINIMUM_TAX_NOT_MODELED,
                title="Some filing details are intentionally left out",
                body="Minimum tax and special filing situations are not fully modeled in this simple planning estimate.",
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


def get_tax_planner_service() -> TaxPlannerService:
    return TaxPlannerService()
