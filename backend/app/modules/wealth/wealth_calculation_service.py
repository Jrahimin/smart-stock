from datetime import date
from decimal import Decimal
from typing import Any

from app.core.exception_handlers import AppError
from app.core.enums import WealthInsightSeverity
from app.modules.wealth.formulas.financial_formulas import (
    calculate_cagr,
    calculate_compound_growth,
    calculate_emi,
    calculate_future_value_annuity,
    calculate_inflation_adjusted_value,
    calculate_lump_sum_growth,
    calculate_zakat_amount,
)
from app.modules.wealth.sanchayapatra_config import get_enabled_sanchayapatra_definition
from app.modules.wealth.wealth_assumptions_service import get_country_defaults, resolve_assumption
from app.modules.wealth.wealth_schemas import (
    WealthAssumptionsInput,
    WealthInsightCard,
    WealthTimelinePoint,
    WealthToolCalculateResponse,
)

SUPPORTED_TOOLS = {
    "fdr",
    "dps",
    "sanchayapatra",
    "compound-growth",
    "emi",
    "cagr",
    "zakat",
    "retirement",
    "savings-goal",
}


def _decimal_input(inputs: dict[str, Any], key: str, default: Decimal | int | float = 0) -> Decimal:
    value = inputs.get(key, default)
    return Decimal(str(value))


def _int_input(inputs: dict[str, Any], key: str, default: int = 0) -> int:
    return int(inputs.get(key, default))


def _metric(label: str, value: Decimal | str | None) -> dict[str, str | Decimal | None]:
    return {"label": label, "value": value}


def _date_input(inputs: dict[str, Any], key: str, default: date | None = None) -> date | None:
    value = inputs.get(key)
    if not value:
        return default
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _add_months(start_date: date, months: int) -> date:
    month_index = start_date.month - 1 + months
    year = start_date.year + month_index // 12
    month = month_index % 12 + 1
    day = min(start_date.day, _days_in_month(year, month))
    return date(year, month, day)


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)
    return (next_month - date(year, month, 1)).days


def _next_payout_date(purchase_date: date, frequency_months: int | None, today: date) -> date | None:
    if frequency_months is None:
        return None
    candidate = _add_months(purchase_date, frequency_months)
    while candidate <= today:
        candidate = _add_months(candidate, frequency_months)
    return candidate


def _payout_frequency_months(distribution: str) -> int | None:
    if distribution == "monthly":
        return 1
    if distribution == "quarterly":
        return 3
    if distribution == "yearly":
        return 12
    return None


def _payout_label(frequency_months: int | None) -> str:
    if frequency_months == 1:
        return "Monthly profit"
    if frequency_months == 3:
        return "Quarterly profit"
    if frequency_months == 12:
        return "Yearly profit"
    return "Profit at maturity"


def _tenure_to_years(tenure_value: Decimal, unit: str) -> tuple[Decimal, str]:
    normalized_unit = unit.lower()
    if normalized_unit == "months":
        return tenure_value / Decimal("12"), f"{tenure_value:g} month(s)"
    if normalized_unit == "quarters":
        return tenure_value / Decimal("4"), f"{tenure_value:g} quarter(s)"
    return tenure_value, f"{tenure_value:g} year(s)"


DEFAULT_DEPOSIT_SOURCE_TAX = Decimal("10")


def _resolve_deposit_source_tax_rate(
    inputs: dict[str, Any],
    default: Decimal = DEFAULT_DEPOSIT_SOURCE_TAX,
) -> Decimal:
    preset = str(inputs.get("source_tax_preset") or "").strip().lower()
    if preset == "custom" and inputs.get("source_tax_rate") not in (None, ""):
        return _decimal_input(inputs, "source_tax_rate", default)
    if preset in {"10", "15"}:
        return Decimal(preset)
    if inputs.get("source_tax_rate") not in (None, ""):
        return _decimal_input(inputs, "source_tax_rate", default)
    return default


def _resolve_source_tax_rate(inputs: dict[str, Any], definition) -> Decimal:
    return _resolve_deposit_source_tax_rate(inputs, definition.default_source_tax)


def _apply_source_tax_to_profit(gross_profit: Decimal, source_tax_rate: Decimal) -> tuple[Decimal, Decimal]:
    source_tax_deduction = (gross_profit * source_tax_rate / Decimal("100")).quantize(Decimal("0.01"))
    net_profit = (gross_profit - source_tax_deduction).quantize(Decimal("0.01"))
    return net_profit, source_tax_deduction


def _resolve_certificate_rate(inputs: dict[str, Any], definition) -> Decimal:
    if inputs.get("annual_rate") not in (None, ""):
        return _decimal_input(inputs, "annual_rate", definition.default_profit_rate)
    return definition.default_profit_rate


def _resolve_tenure_years(inputs: dict[str, Any], default_years: Decimal | int | float = 1) -> tuple[Decimal, str]:
    if inputs.get("tenure_value") is not None:
        tenure_value = _decimal_input(inputs, "tenure_value", default_years)
        unit = str(inputs.get("tenure_unit") or "years")
        return _tenure_to_years(tenure_value, unit)

    years = _decimal_input(inputs, "years", default_years)
    return years, f"{years:g} year(s)"


def _build_timeline(
    *,
    start_label: str,
    end_label: str,
    start_value: Decimal,
    end_value: Decimal,
    inflation_rate: Decimal,
    years: Decimal,
) -> list[WealthTimelinePoint]:
    return [
        WealthTimelinePoint(label=start_label, value=start_value, real_value=start_value),
        WealthTimelinePoint(
            label=end_label,
            value=end_value,
            real_value=calculate_inflation_adjusted_value(end_value, inflation_rate, years),
        ),
    ]


class WealthCalculationService:
    def calculate(self, tool_slug: str, payload_inputs: dict[str, Any], assumptions: WealthAssumptionsInput) -> WealthToolCalculateResponse:
        normalized_slug = tool_slug.lower().strip()
        if normalized_slug not in SUPPORTED_TOOLS:
            raise AppError(f"Unsupported wealth tool: {tool_slug}")

        handler = getattr(self, f"_calculate_{normalized_slug.replace('-', '_')}")
        return handler(payload_inputs, assumptions)

    def _calculate_fdr(self, inputs: dict[str, Any], assumptions: WealthAssumptionsInput) -> WealthToolCalculateResponse:
        defaults = get_country_defaults(assumptions.country_code)
        principal = _decimal_input(inputs, "principal")
        years, tenure_label = _resolve_tenure_years(inputs, 1)
        annual_rate = resolve_assumption(country_code=assumptions.country_code, key="fdr_rate", override=assumptions.annual_rate or inputs.get("annual_rate"))
        inflation_rate = resolve_assumption(country_code=assumptions.country_code, key="inflation_rate", override=assumptions.inflation_rate)
        source_tax_rate = _resolve_deposit_source_tax_rate(inputs)
        distribution = str(inputs.get("profit_distribution_type") or "maturity").lower()
        payout_frequency_months = _payout_frequency_months(distribution)

        compounding_periods = assumptions.compounding_periods_per_year or 1
        if payout_frequency_months is None:
            gross_maturity_value = calculate_lump_sum_growth(
                principal,
                annual_rate,
                years,
                compounding_periods_per_year=compounding_periods,
            )
            gross_interest_earned = (gross_maturity_value - principal).quantize(Decimal("0.01"))
            net_interest_earned, source_tax_deduction = _apply_source_tax_to_profit(gross_interest_earned, source_tax_rate)
            maturity_value = (principal + net_interest_earned).quantize(Decimal("0.01"))
            periodic_profit = None
            headline_value = maturity_value
            headline_label = "Net maturity value"
            summary = (
                f"After an estimated {source_tax_rate:g}% source tax on interest, a {defaults.currency_symbol}{principal:,.0f} "
                f"{defaults.deposit_label} could grow to about {defaults.currency_symbol}{maturity_value:,.0f} over {tenure_label}."
            )
        else:
            gross_periodic_profit = (
                principal * annual_rate * Decimal(payout_frequency_months) / Decimal("1200")
            ).quantize(Decimal("0.01"))
            periodic_profit, _ = _apply_source_tax_to_profit(gross_periodic_profit, source_tax_rate)
            maturity_value = principal
            headline_value = periodic_profit
            headline_label = _payout_label(payout_frequency_months)
            summary = (
                f"After an estimated {source_tax_rate:g}% source tax on profit, a {defaults.currency_symbol}{principal:,.0f} "
                f"{defaults.deposit_label} can show about {defaults.currency_symbol}{periodic_profit:,.0f} as "
                f"{headline_label.lower()} under this rate."
            )
            gross_interest_earned = (
                gross_periodic_profit * years * Decimal("12") / Decimal(payout_frequency_months)
            ).quantize(Decimal("0.01"))
            net_interest_earned, source_tax_deduction = _apply_source_tax_to_profit(gross_interest_earned, source_tax_rate)
        interest_earned = net_interest_earned
        real_value = calculate_inflation_adjusted_value(principal + interest_earned, inflation_rate, years)
        gross_monthly_income_equiv = (principal * annual_rate / Decimal("1200")).quantize(Decimal("0.01"))
        monthly_income_equiv, _ = _apply_source_tax_to_profit(gross_monthly_income_equiv, source_tax_rate)
        metrics = [
            _metric("Principal", principal),
            _metric("Gross interest earned", gross_interest_earned),
            _metric("Source tax deduction", source_tax_deduction),
            _metric("Net interest earned", net_interest_earned),
            _metric("Inflation-adjusted value", real_value),
        ]
        if periodic_profit is not None:
            metrics.append(_metric(_payout_label(payout_frequency_months), periodic_profit))
            metrics.append(_metric("Maturity value", maturity_value))
        else:
            metrics.append(_metric("Monthly income equivalent", monthly_income_equiv))

        return WealthToolCalculateResponse(
            tool_slug="fdr",
            headline_value=headline_value,
            headline_label=headline_label,
            summary=summary,
            metrics=metrics,
            timeline=_build_timeline(
                start_label="Today",
                end_label=f"In {tenure_label}",
                start_value=principal,
                end_value=maturity_value,
                inflation_rate=inflation_rate,
                years=years,
            ),
            insights=[
                WealthInsightCard(
                    id="fdr-source-tax",
                    title="Source tax is applied to interest only",
                    body="Principal stays intact. Only earned interest is reduced by the source tax assumption you choose.",
                    severity=WealthInsightSeverity.INFO,
                ),
                WealthInsightCard(
                    id="fdr-inflation",
                    title="Purchasing power matters",
                    body=f"At {inflation_rate}% inflation, the maturity value may feel closer to {defaults.currency_symbol}{real_value:,.0f} in today's money.",
                    severity=WealthInsightSeverity.INFO,
                ),
                WealthInsightCard(
                    id="fdr-liquidity",
                    title="Liquidity trade-off",
                    body=f"{defaults.deposit_label} usually trades flexibility for a steadier return.",
                    severity=WealthInsightSeverity.NEUTRAL,
                ),
            ],
            next_steps=[
                {"label": "Compare with DPS", "href": "/wealth/compare/dps-vs-fdr"},
                {"label": "Compare with stocks", "href": "/wealth/compare/fdr-vs-stocks"},
                {"label": "Save scenario", "href": "/wealth/snapshot"},
            ],
            assumptions_used={
                "annual_rate": str(annual_rate),
                "inflation_rate": str(inflation_rate),
                "source_tax_rate": str(source_tax_rate),
                "source_tax_deduction": str(source_tax_deduction),
                "compounding_periods_per_year": compounding_periods,
                "profit_distribution_type": distribution,
                "payout_frequency_months": payout_frequency_months,
                "country_code": defaults.country_code,
            },
        )

    def _calculate_dps(self, inputs: dict[str, Any], assumptions: WealthAssumptionsInput) -> WealthToolCalculateResponse:
        defaults = get_country_defaults(assumptions.country_code)
        monthly_payment = _decimal_input(inputs, "monthly_payment")
        years, tenure_label = _resolve_tenure_years(inputs, 5)
        annual_rate = resolve_assumption(country_code=assumptions.country_code, key="dps_rate", override=assumptions.annual_rate or inputs.get("annual_rate"))
        inflation_rate = resolve_assumption(country_code=assumptions.country_code, key="inflation_rate", override=assumptions.inflation_rate)
        source_tax_rate = _resolve_deposit_source_tax_rate(inputs)

        gross_maturity_value = calculate_future_value_annuity(monthly_payment, annual_rate, years)
        total_contributed = (monthly_payment * Decimal("12") * years).quantize(Decimal("0.01"))
        gross_growth_from_returns = (gross_maturity_value - total_contributed).quantize(Decimal("0.01"))
        net_growth_from_returns, source_tax_deduction = _apply_source_tax_to_profit(gross_growth_from_returns, source_tax_rate)
        maturity_value = (total_contributed + net_growth_from_returns).quantize(Decimal("0.01"))
        real_value = calculate_inflation_adjusted_value(maturity_value, inflation_rate, years)

        return WealthToolCalculateResponse(
            tool_slug="dps",
            headline_value=maturity_value,
            headline_label="Projected maturity",
            summary=(
                f"After an estimated {source_tax_rate:g}% source tax on returns, saving "
                f"{defaults.currency_symbol}{monthly_payment:,.0f}/month could build about "
                f"{defaults.currency_symbol}{maturity_value:,.0f} over {tenure_label}."
            ),
            metrics=[
                _metric("Total contributed", total_contributed),
                _metric("Gross growth from returns", gross_growth_from_returns),
                _metric("Source tax deduction", source_tax_deduction),
                _metric("Net growth from returns", net_growth_from_returns),
                _metric("Inflation-adjusted value", real_value),
            ],
            timeline=_build_timeline(
                start_label="Today",
                end_label=f"In {tenure_label}",
                start_value=total_contributed,
                end_value=maturity_value,
                inflation_rate=inflation_rate,
                years=years,
            ),
            insights=[
                WealthInsightCard(
                    id="dps-source-tax",
                    title="Source tax is applied to returns only",
                    body="Your deposits stay intact. Only accumulated returns are reduced by the source tax assumption you choose.",
                    severity=WealthInsightSeverity.INFO,
                ),
                WealthInsightCard(
                    id="dps-discipline",
                    title="Monthly discipline compounds quietly",
                    body="Regular contributions can matter as much as the headline interest rate over long horizons.",
                    severity=WealthInsightSeverity.POSITIVE,
                ),
            ],
            next_steps=[
                {"label": "Compare with FDR", "href": "/wealth/compare/dps-vs-fdr"},
                {"label": "Save scenario", "href": "/wealth/snapshot"},
            ],
            assumptions_used={
                "annual_rate": str(annual_rate),
                "inflation_rate": str(inflation_rate),
                "source_tax_rate": str(source_tax_rate),
                "source_tax_deduction": str(source_tax_deduction),
            },
        )

    def _calculate_sanchayapatra(
        self,
        inputs: dict[str, Any],
        assumptions: WealthAssumptionsInput,
    ) -> WealthToolCalculateResponse:
        defaults = get_country_defaults(assumptions.country_code)
        definition = get_enabled_sanchayapatra_definition(str(inputs.get("certificate_type") or "family-savings"))
        principal = _decimal_input(inputs, "principal")
        annual_rate = _resolve_certificate_rate(inputs, definition)
        source_tax_rate = _resolve_source_tax_rate(inputs, definition)
        distribution_override = str(inputs.get("profit_distribution_type") or "configured")
        payout_frequency_months = (
            definition.payout_frequency_months
            if distribution_override == "configured"
            else _payout_frequency_months(distribution_override)
        )
        inflation_rate = resolve_assumption(
            country_code=assumptions.country_code,
            key="inflation_rate",
            override=assumptions.inflation_rate,
        )
        purchase_date = _date_input(inputs, "purchase_date", date.today()) or date.today()
        duration_years = definition.duration_years
        maturity_date = _add_months(purchase_date, definition.duration_months)
        total_profit = (principal * annual_rate * duration_years / Decimal("100")).quantize(Decimal("0.01"))
        gross_maturity_value = (principal + total_profit).quantize(Decimal("0.01"))
        source_tax_deduction = (total_profit * source_tax_rate / Decimal("100")).quantize(Decimal("0.01"))
        net_maturity_value = (gross_maturity_value - source_tax_deduction).quantize(Decimal("0.01"))
        inflation_adjusted_value = calculate_inflation_adjusted_value(
            net_maturity_value,
            inflation_rate,
            duration_years,
        )

        payout_value: Decimal | None = None
        payout_label = "Profit at maturity"
        if payout_frequency_months:
            payout_value = (
                principal * annual_rate * Decimal(payout_frequency_months) / Decimal("1200")
            ).quantize(Decimal("0.01"))
            payout_label = _payout_label(payout_frequency_months)

        next_payment = _next_payout_date(
            purchase_date,
            payout_frequency_months,
            date.today(),
        )

        metrics = [
            _metric("Current investment", principal),
            _metric(payout_label, payout_value or total_profit),
            _metric("Next payment date", next_payment.isoformat() if next_payment else "On maturity"),
            _metric("Gross maturity value", gross_maturity_value),
            _metric("Total profit", total_profit),
            _metric("Source tax deduction", source_tax_deduction),
            _metric("Net maturity value", net_maturity_value),
            _metric("Inflation-adjusted value", inflation_adjusted_value),
            _metric("Final maturity date", maturity_date.isoformat()),
        ]

        timeline = [
            WealthTimelinePoint(label="Current investment", value=principal, real_value=principal),
        ]
        if payout_value and next_payment:
            timeline.append(
                WealthTimelinePoint(
                    label=f"Next {payout_label.lower()} ({next_payment:%d %b %Y})",
                    value=payout_value,
                )
            )
        timeline.append(
            WealthTimelinePoint(
                label=f"Certificate matures ({maturity_date:%d %b %Y})",
                value=net_maturity_value,
                real_value=inflation_adjusted_value,
            )
        )

        return WealthToolCalculateResponse(
            tool_slug="sanchayapatra",
            headline_value=net_maturity_value,
            headline_label="Net maturity value",
            summary=(
                f"After an estimated {source_tax_rate:g}% source tax on profit, "
                f"{definition.display_name} could return about {defaults.currency_symbol}{net_maturity_value:,.0f} "
                f"by {maturity_date:%B %Y}."
            ),
            metrics=metrics,
            timeline=timeline,
            insights=[
                WealthInsightCard(
                    id="sanchayapatra-first-class",
                    title="A separate savings picture",
                    body="Sanchayapatra behaves differently from FDR, so it is tracked as its own asset class.",
                    severity=WealthInsightSeverity.INFO,
                ),
                WealthInsightCard(
                    id="sanchayapatra-source-tax",
                    title="Source tax is applied to profit only",
                    body="Principal stays intact. Only earned profit is reduced by the source tax assumption you choose.",
                    severity=WealthInsightSeverity.INFO,
                ),
                WealthInsightCard(
                    id="sanchayapatra-rate-updates",
                    title="Rules can change",
                    body="Certificate definitions come from configuration so rates, tax defaults, and payout rules can be updated without rewriting the calculator.",
                    severity=WealthInsightSeverity.NEUTRAL,
                ),
            ],
            next_steps=[
                {"label": "Compare with FDR", "href": "/wealth/compare/fdr-vs-stocks"},
                {"label": "Compare with DPS", "href": "/wealth/compare/dps-vs-fdr"},
                {"label": "Open Money Snapshot", "href": "/wealth/snapshot"},
            ],
            assumptions_used={
                "certificate_type": definition.internal_key,
                "display_name": definition.display_name,
                "government_default_rate": str(definition.default_profit_rate),
                "annual_rate": str(annual_rate),
                "source_tax_rate": str(source_tax_rate),
                "inflation_rate": str(inflation_rate),
                "purchase_date": purchase_date.isoformat(),
                "maturity_date": maturity_date.isoformat(),
                "gross_maturity_value": str(gross_maturity_value),
                "total_profit": str(total_profit),
                "source_tax_deduction": str(source_tax_deduction),
                "profit_style": definition.profit_style,
                "profit_distribution_type": distribution_override,
                "payout_frequency_months": payout_frequency_months,
                "maturity_calculation_method": definition.maturity_calculation_method,
                "next_payment_date": next_payment.isoformat() if next_payment else None,
                "next_payment_amount": str(payout_value) if payout_value else None,
            },
        )

    def _calculate_compound_growth(self, inputs: dict[str, Any], assumptions: WealthAssumptionsInput) -> WealthToolCalculateResponse:
        defaults = get_country_defaults(assumptions.country_code)
        principal = _decimal_input(inputs, "principal")
        monthly_contribution = _decimal_input(inputs, "monthly_contribution")
        years, tenure_label = _resolve_tenure_years(inputs, 10)
        annual_rate = resolve_assumption(country_code=assumptions.country_code, key="stock_return", override=assumptions.annual_rate or inputs.get("annual_rate"))
        inflation_rate = resolve_assumption(country_code=assumptions.country_code, key="inflation_rate", override=assumptions.inflation_rate)

        lump_sum_value = calculate_compound_growth(principal, annual_rate, years) if principal > 0 else Decimal("0")
        annuity_value = calculate_future_value_annuity(monthly_contribution, annual_rate, years) if monthly_contribution > 0 else Decimal("0")
        total_value = (lump_sum_value + annuity_value).quantize(Decimal("0.01"))
        real_value = calculate_inflation_adjusted_value(total_value, inflation_rate, years)

        return WealthToolCalculateResponse(
            tool_slug="compound-growth",
            headline_value=total_value,
            headline_label="Projected value",
            summary=f"Your money could grow to about {defaults.currency_symbol}{total_value:,.0f} over {tenure_label} if assumptions hold.",
            metrics=[
                _metric("Starting amount growth", lump_sum_value),
                _metric("Recurring contribution growth", annuity_value),
                _metric("Inflation-adjusted value", real_value),
            ],
            timeline=_build_timeline(
                start_label="Today",
                end_label=f"In {tenure_label}",
                start_value=principal + monthly_contribution,
                end_value=total_value,
                inflation_rate=inflation_rate,
                years=years,
            ),
            insights=[
                WealthInsightCard(
                    id="compound-time",
                    title="Time is doing quiet work",
                    body="Longer horizons give compounding more room to matter.",
                    severity=WealthInsightSeverity.INFO,
                ),
            ],
            next_steps=[
                {"label": "Compare with FDR", "href": "/wealth/compare/fdr-vs-stocks"},
                {"label": "Save scenario", "href": "/wealth/snapshot"},
            ],
            assumptions_used={"annual_rate": str(annual_rate), "inflation_rate": str(inflation_rate)},
        )

    def _calculate_emi(self, inputs: dict[str, Any], assumptions: WealthAssumptionsInput) -> WealthToolCalculateResponse:
        defaults = get_country_defaults(assumptions.country_code)
        principal = _decimal_input(inputs, "principal")
        annual_rate = _decimal_input(inputs, "annual_rate", resolve_assumption(country_code=assumptions.country_code, key="annual_rate", override=assumptions.annual_rate))
        tenure_months = _int_input(inputs, "tenure_months", 60)
        loan_start_date = _date_input(inputs, "loan_start_date")
        amount_repaid = _decimal_input(inputs, "amount_repaid") if inputs.get("amount_repaid") not in (None, "") else None

        emi = calculate_emi(principal, annual_rate, tenure_months)
        total_payment = (emi * Decimal(tenure_months)).quantize(Decimal("0.01"))
        total_interest = total_payment - principal

        metrics = [
            _metric("Total payment", total_payment),
            _metric("Total interest", total_interest),
            _metric("Tenure (months)", Decimal(tenure_months)),
        ]
        timeline: list[WealthTimelinePoint] = []

        if loan_start_date:
            payoff_date = _add_months(loan_start_date, tenure_months)
            metrics.append(_metric("Payoff date", payoff_date.isoformat()))
            timeline.append(
                WealthTimelinePoint(
                    label=f"Loan starts ({loan_start_date:%d %b %Y})",
                    value=principal,
                )
            )
            timeline.append(
                WealthTimelinePoint(
                    label=f"Loan paid off ({payoff_date:%d %b %Y})",
                    value=Decimal("0"),
                )
            )

        if amount_repaid is not None:
            remaining_to_pay = max(Decimal("0"), total_payment - amount_repaid).quantize(Decimal("0.01"))
            repayment_progress = (
                (amount_repaid / total_payment * Decimal("100")).quantize(Decimal("0.01"))
                if total_payment > 0
                else Decimal("0")
            )
            metrics.append(_metric("Amount repaid so far", amount_repaid))
            metrics.append(_metric("Remaining to pay", remaining_to_pay))
            metrics.append(_metric("Repayment progress", f"{repayment_progress}%"))

        return WealthToolCalculateResponse(
            tool_slug="emi",
            headline_value=emi,
            headline_label="Monthly EMI",
            summary=f"A loan of {defaults.currency_symbol}{principal:,.0f} may require about {defaults.currency_symbol}{emi:,.0f}/month for {tenure_months} months.",
            metrics=metrics,
            timeline=timeline,
            insights=[
                WealthInsightCard(
                    id="emi-prepay",
                    title="Prepaying can change the picture",
                    body="Extra payments reduce interest over time, but may reduce cash flexibility.",
                    severity=WealthInsightSeverity.NEUTRAL,
                    action_label="Compare prepayment vs investing",
                    action_href="/wealth/compare/loan-prepayment-vs-investing",
                ),
            ],
            next_steps=[
                {"label": "Compare prepayment vs investing", "href": "/wealth/compare/loan-prepayment-vs-investing"},
                {"label": "Add to Money Snapshot", "href": "/wealth/snapshot"},
            ],
            assumptions_used={"annual_rate": str(annual_rate)},
        )

    def _calculate_cagr(self, inputs: dict[str, Any], assumptions: WealthAssumptionsInput) -> WealthToolCalculateResponse:
        beginning_value = _decimal_input(inputs, "beginning_value")
        ending_value = _decimal_input(inputs, "ending_value")
        years = _decimal_input(inputs, "years", 1)
        cagr = calculate_cagr(beginning_value, ending_value, years)

        return WealthToolCalculateResponse(
            tool_slug="cagr",
            headline_value=cagr,
            headline_label="CAGR",
            summary=f"Growth from {beginning_value:,.0f} to {ending_value:,.0f} over {years:g} year(s) implies about {cagr}% CAGR.",
            metrics=[
                _metric("Beginning value", beginning_value),
                _metric("Ending value", ending_value),
                _metric("Period (years)", years),
            ],
            timeline=[
                WealthTimelinePoint(label="Start", value=beginning_value),
                WealthTimelinePoint(label="End", value=ending_value),
            ],
            insights=[
                WealthInsightCard(
                    id="cagr-context",
                    title="CAGR smooths the journey",
                    body="It describes average growth, not the volatility you may have felt along the way.",
                    severity=WealthInsightSeverity.INFO,
                ),
            ],
            next_steps=[{"label": "Explore compound growth", "href": "/wealth/tools/compound-growth"}],
            assumptions_used={},
        )

    def _calculate_zakat(self, inputs: dict[str, Any], assumptions: WealthAssumptionsInput) -> WealthToolCalculateResponse:
        defaults = get_country_defaults(assumptions.country_code)
        cash = _decimal_input(inputs, "cash")
        gold = _decimal_input(inputs, "gold")
        investments = _decimal_input(inputs, "investments")
        receivables = _decimal_input(inputs, "receivables")
        liabilities = _decimal_input(inputs, "liabilities")
        nisab = resolve_assumption(country_code=assumptions.country_code, key="nisab_amount", override=inputs.get("nisab_amount"))
        zakat_rate = resolve_assumption(country_code=assumptions.country_code, key="zakat_rate", override=inputs.get("zakat_rate"))

        eligible_wealth = cash + gold + investments + receivables - liabilities
        zakat_amount = calculate_zakat_amount(eligible_wealth, nisab_threshold=nisab, zakat_rate=zakat_rate)

        return WealthToolCalculateResponse(
            tool_slug="zakat",
            headline_value=zakat_amount,
            headline_label="Estimated Zakat",
            summary=f"Based on your inputs, eligible wealth is about {defaults.currency_symbol}{eligible_wealth:,.0f}.",
            metrics=[
                _metric("Eligible wealth", eligible_wealth),
                _metric("Nisab threshold", nisab),
                _metric("Zakat rate", zakat_rate),
            ],
            timeline=[
                WealthTimelinePoint(label="Eligible wealth", value=eligible_wealth),
                WealthTimelinePoint(label="Estimated Zakat", value=zakat_amount),
            ],
            insights=[
                WealthInsightCard(
                    id="zakat-disclaimer",
                    title="Educational estimate only",
                    body="Complex holdings, business assets, and timing rules may need scholarly guidance.",
                    severity=WealthInsightSeverity.WARNING,
                ),
            ],
            next_steps=[
                {"label": "Add gold to Money Snapshot", "href": "/wealth/snapshot"},
                {"label": "Compare save vs spend", "href": "/wealth/compare/save-vs-spend"},
            ],
            assumptions_used={"nisab_amount": str(nisab), "zakat_rate": str(zakat_rate)},
        )

    def _calculate_retirement(self, inputs: dict[str, Any], assumptions: WealthAssumptionsInput) -> WealthToolCalculateResponse:
        return self._calculate_savings_goal(inputs, assumptions, default_slug="retirement", default_title="Retirement fund")

    def _calculate_savings_goal(self, inputs: dict[str, Any], assumptions: WealthAssumptionsInput, *, default_slug: str = "savings-goal", default_title: str = "Savings goal") -> WealthToolCalculateResponse:
        defaults = get_country_defaults(assumptions.country_code)
        target_amount = _decimal_input(inputs, "target_amount")
        current_amount = _decimal_input(inputs, "current_amount")
        monthly_contribution = _decimal_input(inputs, "monthly_contribution")
        years, tenure_label = _resolve_tenure_years(inputs, 10)
        annual_rate = resolve_assumption(country_code=assumptions.country_code, key="stock_return", override=assumptions.annual_rate or inputs.get("annual_rate"))
        inflation_rate = resolve_assumption(country_code=assumptions.country_code, key="inflation_rate", override=assumptions.inflation_rate)

        projected_value = calculate_compound_growth(current_amount, annual_rate, years)
        if monthly_contribution > 0:
            projected_value += calculate_future_value_annuity(monthly_contribution, annual_rate, years)
        projected_value = projected_value.quantize(Decimal("0.01"))
        gap = (target_amount - projected_value).quantize(Decimal("0.01"))
        progress_percent = ((projected_value / target_amount) * Decimal("100")).quantize(Decimal("0.01")) if target_amount > 0 else Decimal("0")
        real_target = calculate_inflation_adjusted_value(target_amount, inflation_rate, years)

        return WealthToolCalculateResponse(
            tool_slug=default_slug,
            headline_value=projected_value,
            headline_label=default_title,
            summary=f"At this pace, you may reach about {defaults.currency_symbol}{projected_value:,.0f} of a {defaults.currency_symbol}{target_amount:,.0f} goal.",
            metrics=[
                _metric("Target amount", target_amount),
                _metric("Projected value", projected_value),
                _metric("Gap remaining", gap if gap > 0 else Decimal("0")),
                _metric("Progress", progress_percent),
                _metric("Inflation-adjusted target", real_target),
            ],
            timeline=_build_timeline(
                start_label="Today",
                end_label=f"In {tenure_label}",
                start_value=current_amount,
                end_value=projected_value,
                inflation_rate=inflation_rate,
                years=years,
            ),
            insights=[
                WealthInsightCard(
                    id="goal-progress",
                    title="Progress is visible",
                    body=f"You are about {progress_percent}% of the way there under current assumptions.",
                    severity=WealthInsightSeverity.POSITIVE if projected_value >= target_amount else WealthInsightSeverity.INFO,
                ),
            ],
            next_steps=[
                {"label": "Adjust monthly savings", "href": f"/wealth/tools/{default_slug}"},
                {"label": "Save scenario", "href": "/wealth/snapshot"},
            ],
            assumptions_used={"annual_rate": str(annual_rate), "inflation_rate": str(inflation_rate)},
        )
