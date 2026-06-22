from decimal import Decimal
from unittest.mock import MagicMock

from app.modules.wealth.formulas.financial_formulas import (
    calculate_cagr,
    calculate_emi,
    calculate_future_value_annuity,
    calculate_inflation_adjusted_value,
    calculate_investment_rebate,
    calculate_lump_sum_growth,
    calculate_progressive_tax,
    calculate_zakat_amount,
)
from app.modules.wealth.bangladesh_tax_config import get_active_tax_config
from app.modules.wealth.tax_config.tax_config_models import ResolvedMinimumTaxRule
from app.modules.wealth.tax_config.tax_config_python_fallback import build_fallback_resolved_config
from app.modules.wealth.tax_planner_service import TaxPlannerService
from app.modules.wealth.wealth_calculation_service import WealthCalculationService
from app.modules.wealth.wealth_comparison_service import WealthComparisonService
from app.modules.wealth.wealth_schemas import (
    TaxPlannerCalculateRequest,
    TaxPlannerIncomeInput,
    TaxPlannerInvestmentInput,
    TaxPlannerProfileInput,
    WealthAssumptionsInput,
    WealthComparisonEvaluateRequest,
)


def _tax_planner_service() -> TaxPlannerService:
    return TaxPlannerService(resolver=MagicMock())


def _calculate_tax_planner(request: TaxPlannerCalculateRequest, *, config=None):
    service = _tax_planner_service()
    resolved_config = config or build_fallback_resolved_config()
    return service.calculate_with_config(request, resolved_config)


def test_lump_sum_growth() -> None:
    result = calculate_lump_sum_growth(100000, 10, 2)
    assert result == Decimal("121000.00")


def test_future_value_annuity() -> None:
    result = calculate_future_value_annuity(10000, 8, 5)
    assert result > Decimal("700000")


def test_emi() -> None:
    result = calculate_emi(1000000, 12, 60)
    assert result > Decimal("20000")


def test_cagr() -> None:
    result = calculate_cagr(100000, 146410, 4)
    assert result == Decimal("10.00")


def test_inflation_adjusted_value() -> None:
    result = calculate_inflation_adjusted_value(1000000, 8, 10)
    assert result < Decimal("1000000")


def test_zakat_below_nisab() -> None:
    result = calculate_zakat_amount(100000, nisab_threshold=650000)
    assert result == Decimal("0.00")


def test_progressive_tax_uses_configured_slabs() -> None:
    config = get_active_tax_config()
    tax, breakdown = calculate_progressive_tax(1300000, config.slabs)
    assert tax == Decimal("135000.00")
    assert breakdown[0]["tax"] == Decimal("0.00")
    assert breakdown[-1]["rate"] == Decimal("20")


def test_investment_rebate_caps_actual_investment() -> None:
    current, maximum, remaining, rebate = calculate_investment_rebate(
        taxable_income=2000000,
        actual_investment=1000000,
        max_income_percentage=20,
        max_amount=1000000,
        rebate_rate=15,
    )
    assert current == Decimal("400000.00")
    assert maximum == Decimal("400000.00")
    assert remaining == Decimal("0.00")
    assert rebate == Decimal("60000.00")


def test_tax_planner_quick_estimate_returns_raw_values() -> None:
    response = _calculate_tax_planner(
        TaxPlannerCalculateRequest(
            income=TaxPlannerIncomeInput(annual_salary=Decimal("1200000"), other_yearly_income=Decimal("100000")),
            investments=TaxPlannerInvestmentInput(tax_saving_investments=Decimal("150000")),
        )
    )

    assert response.mode == "QUICK"
    assert response.total_income == Decimal("1300000.00")
    assert response.tax_free_allowance == Decimal("375000")
    assert response.gross_tax == Decimal("135000.00")
    assert response.rebate == Decimal("22500.00")
    assert response.final_tax == Decimal("112500.00")
    assert response.current_eligible_investment == Decimal("150000.00")
    assert response.maximum_eligible_investment == Decimal("260000.00")
    assert response.remaining_eligible_investment == Decimal("110000.00")
    assert response.potential_additional_tax_saving == Decimal("16500.00")


def test_tax_planner_below_threshold_has_zero_tax() -> None:
    response = _calculate_tax_planner(
        TaxPlannerCalculateRequest(
            income=TaxPlannerIncomeInput(annual_salary=Decimal("300000")),
        )
    )

    assert response.gross_tax == Decimal("0.00")
    assert response.final_tax == Decimal("0.00")


def test_tax_planner_special_threshold_override() -> None:
    response = _calculate_tax_planner(
        TaxPlannerCalculateRequest(
            profile=TaxPlannerProfileInput(gender="FEMALE"),
            income=TaxPlannerIncomeInput(annual_salary=Decimal("400000")),
        )
    )

    assert response.tax_free_allowance == Decimal("425000")
    assert response.final_tax == Decimal("0.00")


def test_tax_planner_generates_structured_insights() -> None:
    response = _calculate_tax_planner(
        TaxPlannerCalculateRequest(
            income=TaxPlannerIncomeInput(
                annual_salary=Decimal("1200000"),
                rental_income=Decimal("240000"),
            ),
            investments=TaxPlannerInvestmentInput(tax_saving_investments=Decimal("0")),
        )
    )
    insight_types = {insight.type for insight in response.insights}

    assert "NO_ELIGIBLE_INVESTMENTS" in insight_types
    assert "MULTIPLE_INCOME_SOURCES" in insight_types
    assert "MINIMUM_TAX_NOT_MODELED" in insight_types
    assert response.assumptions_used["minimum_tax_note"]


def test_tax_planner_simulation_does_not_require_saved_state() -> None:
    response = _calculate_tax_planner(
        TaxPlannerCalculateRequest(
            income=TaxPlannerIncomeInput(annual_salary=Decimal("1200000")),
            investments=TaxPlannerInvestmentInput(
                tax_saving_investments=Decimal("100000"),
                simulation_additional_investment=Decimal("50000"),
            ),
        )
    )

    assert response.current_eligible_investment == Decimal("150000.00")
    assert response.rebate == Decimal("22500.00")


def test_tax_planner_minimum_tax_floor_applies_when_configured() -> None:
    from dataclasses import replace

    config = replace(
        build_fallback_resolved_config(),
        minimum_tax_rules=(
            ResolvedMinimumTaxRule(
                rule_code="NATIONAL_DEFAULT",
                rule_type="NATIONAL_DEFAULT",
                location_code=None,
                minimum_amount=Decimal("5000"),
                is_active=True,
            ),
        ),
    )
    response = _calculate_tax_planner(
        TaxPlannerCalculateRequest(
            income=TaxPlannerIncomeInput(annual_salary=Decimal("400000")),
        ),
        config=config,
    )

    assert response.gross_tax == Decimal("2500.00")
    assert response.minimum_tax_applied == Decimal("5000.00")
    assert response.final_tax == Decimal("5000.00")
    assert response.minimum_tax_rule_code == "NATIONAL_DEFAULT"


def test_tax_planner_disabled_investment_category_excluded() -> None:
    from dataclasses import replace

    config = build_fallback_resolved_config()
    categories = tuple(
        replace(category, is_enabled=category.category_key != "life_insurance")
        for category in config.investment_categories
    )
    config = replace(config, investment_categories=categories)
    response = _calculate_tax_planner(
        TaxPlannerCalculateRequest(
            mode="DETAILED",
            income=TaxPlannerIncomeInput(annual_salary=Decimal("1200000")),
            investments=TaxPlannerInvestmentInput(
                life_insurance=Decimal("100000"),
                provident_fund=Decimal("50000"),
            ),
        ),
        config=config,
    )

    assert response.current_eligible_investment == Decimal("50000.00")


def test_fdr_tool_calculation() -> None:
    service = WealthCalculationService()
    response = service.calculate(
        "fdr",
        {"principal": 500000, "years": 3},
        WealthAssumptionsInput(),
    )
    assert response.tool_slug == "fdr"
    assert response.headline_value > Decimal("500000")
    assert response.next_steps


def test_fdr_monthly_income_uses_principal_not_maturity_value() -> None:
    service = WealthCalculationService()
    response = service.calculate(
        "fdr",
        {"principal": 500000, "years": 3},
        WealthAssumptionsInput(annual_rate=Decimal("9")),
    )

    monthly_income = next(metric["value"] for metric in response.metrics if metric["label"] == "Monthly income equivalent")
    assert monthly_income == Decimal("3375.00")


def test_fdr_tenure_supports_months_and_quarters() -> None:
    service = WealthCalculationService()
    monthly_response = service.calculate(
        "fdr",
        {"principal": 500000, "tenure_value": 6, "tenure_unit": "months"},
        WealthAssumptionsInput(annual_rate=Decimal("9")),
    )
    quarterly_response = service.calculate(
        "fdr",
        {"principal": 500000, "tenure_value": 4, "tenure_unit": "quarters"},
        WealthAssumptionsInput(annual_rate=Decimal("9")),
    )

    assert "6 month(s)" in monthly_response.summary
    assert "4 quarter(s)" in quarterly_response.summary
    assert monthly_response.timeline[-1].label == "In 6 month(s)"
    assert quarterly_response.timeline[-1].label == "In 4 quarter(s)"


def test_fdr_monthly_profit_distribution_changes_headline() -> None:
    service = WealthCalculationService()
    response = service.calculate(
        "fdr",
        {"principal": 500000, "years": 3, "profit_distribution_type": "monthly"},
        WealthAssumptionsInput(annual_rate=Decimal("9")),
    )

    monthly_profit = next(metric["value"] for metric in response.metrics if metric["label"] == "Monthly profit")
    maturity_value = next(metric["value"] for metric in response.metrics if metric["label"] == "Maturity value")
    assert response.headline_label == "Monthly profit"
    assert response.headline_value == Decimal("3375.00")
    assert monthly_profit == Decimal("3375.00")
    assert maturity_value == Decimal("500000")


def test_fdr_source_tax_preset_changes_net_interest() -> None:
    service = WealthCalculationService()
    taxed_response = service.calculate(
        "fdr",
        {"principal": 500000, "years": 3, "source_tax_preset": "15"},
        WealthAssumptionsInput(annual_rate=Decimal("9")),
    )
    net_interest = next(metric["value"] for metric in taxed_response.metrics if metric["label"] == "Net interest earned")
    source_tax = next(metric["value"] for metric in taxed_response.metrics if metric["label"] == "Source tax deduction")
    assert taxed_response.assumptions_used["source_tax_rate"] == "15"
    assert source_tax > Decimal("0")
    assert net_interest == taxed_response.headline_value - Decimal("500000")


def test_dps_applies_source_tax_to_returns_only() -> None:
    service = WealthCalculationService()
    response = service.calculate(
        "dps",
        {"monthly_payment": 10000, "years": 5, "source_tax_preset": "10"},
        WealthAssumptionsInput(annual_rate=Decimal("8")),
    )
    contributed = next(metric["value"] for metric in response.metrics if metric["label"] == "Total contributed")
    source_tax = next(metric["value"] for metric in response.metrics if metric["label"] == "Source tax deduction")
    assert response.headline_value > contributed
    assert source_tax > Decimal("0")
    assert "source tax" in response.summary.lower()


def test_sanchayapatra_tool_uses_certificate_configuration() -> None:
    service = WealthCalculationService()
    response = service.calculate(
        "sanchayapatra",
        {
            "certificate_type": "family-savings",
            "principal": 1000000,
            "purchase_date": "2026-06-08",
        },
        WealthAssumptionsInput(inflation_rate=Decimal("8")),
    )

    monthly_profit = next(metric["value"] for metric in response.metrics if metric["label"] == "Monthly profit")
    maturity_date = next(metric["value"] for metric in response.metrics if metric["label"] == "Final maturity date")
    source_tax = next(metric["value"] for metric in response.metrics if metric["label"] == "Source tax deduction")
    assert response.tool_slug == "sanchayapatra"
    assert response.headline_value == Decimal("1474300.00")
    assert monthly_profit == Decimal("8783.33")
    assert source_tax == Decimal("52700.00")
    assert maturity_date == "2031-06-08"
    assert response.assumptions_used["certificate_type"] == "family-savings"
    assert response.assumptions_used["government_default_rate"] == "10.54"


def test_emi_projection_details_add_timeline_and_remaining_balance() -> None:
    service = WealthCalculationService()
    response = service.calculate(
        "emi",
        {
            "principal": 1000000,
            "annual_rate": 12,
            "tenure_months": 60,
            "loan_start_date": "2026-01-01",
            "amount_repaid": 200000,
        },
        WealthAssumptionsInput(),
    )

    assert response.timeline
    assert response.timeline[0].label.startswith("Loan starts (")
    assert response.timeline[-1].label.startswith("Loan paid off (")
    assert any(metric["label"] == "Payoff date" for metric in response.metrics)
    assert any(metric["label"] == "Remaining to pay" for metric in response.metrics)


def test_emi_without_projection_details_has_no_timeline() -> None:
    service = WealthCalculationService()
    response = service.calculate(
        "emi",
        {"principal": 1000000, "annual_rate": 12, "tenure_months": 60},
        WealthAssumptionsInput(),
    )

    assert response.timeline == []


def test_loan_prepayment_comparison_uses_gain_not_full_principal_value() -> None:
    service = WealthComparisonService()
    response = service.evaluate(
        "loan-prepayment-vs-investing",
        WealthComparisonEvaluateRequest(
            left_inputs={"extra_amount": 100000, "loan_rate": 12, "years": 5},
            right_inputs={"extra_amount": 100000, "years": 5},
            assumptions=WealthAssumptionsInput(annual_rate=Decimal("12")),
        ),
    )

    assert response.left.final_value == Decimal("76234.17")
    assert response.right.final_value == Decimal("76234.17")
    assert response.difference_value == Decimal("0.00")


def test_validate_slabs_requires_exactly_one_allowance_band() -> None:
    import pytest

    from app.core.exception_handlers import AppError
    from app.modules.wealth.tax_config.tax_config_validation import SlabInput, validate_slabs

    with pytest.raises(AppError, match="Exactly one allowance slab"):
        validate_slabs([SlabInput(1, False), SlabInput(2, False)])

    with pytest.raises(AppError, match="Exactly one allowance slab"):
        validate_slabs([SlabInput(1, True), SlabInput(2, True)])

    with pytest.raises(AppError, match="Duplicate slab sort_order"):
        validate_slabs([SlabInput(1, True), SlabInput(1, False)])

    validate_slabs([SlabInput(1, True), SlabInput(2, False)])
