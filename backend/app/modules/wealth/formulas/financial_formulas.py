"""Globally standard financial formulas. Country-specific behavior belongs in assumptions, not here."""

from decimal import Decimal
from typing import Protocol


class ProgressiveTaxSlab(Protocol):
    amount: Decimal | None
    rate: Decimal
    label: str


def _to_decimal(value: Decimal | float | int) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def calculate_lump_sum_growth(
    principal: Decimal | float | int,
    annual_rate: Decimal | float | int,
    years: Decimal | float | int,
    *,
    compounding_periods_per_year: int = 1,
) -> Decimal:
    pv = _to_decimal(principal)
    rate = _to_decimal(annual_rate) / Decimal("100")
    periods = _to_decimal(years) * Decimal(compounding_periods_per_year)
    periodic_rate = rate / Decimal(compounding_periods_per_year)
    if periodic_rate == 0:
        return pv
    growth_factor = (Decimal("1") + periodic_rate) ** periods
    return (pv * growth_factor).quantize(Decimal("0.01"))


def calculate_compound_growth(
    principal: Decimal | float | int,
    annual_rate: Decimal | float | int,
    years: Decimal | float | int,
    *,
    compounding_periods_per_year: int = 12,
) -> Decimal:
    return calculate_lump_sum_growth(
        principal,
        annual_rate,
        years,
        compounding_periods_per_year=compounding_periods_per_year,
    )


def calculate_future_value_annuity(
    payment: Decimal | float | int,
    annual_rate: Decimal | float | int,
    years: Decimal | float | int,
    *,
    payments_per_year: int = 12,
) -> Decimal:
    pmt = _to_decimal(payment)
    rate = _to_decimal(annual_rate) / Decimal("100")
    periods = int(_to_decimal(years) * Decimal(payments_per_year))
    periodic_rate = rate / Decimal(payments_per_year)
    if periodic_rate == 0:
        return (pmt * Decimal(periods)).quantize(Decimal("0.01"))
    future_value = pmt * (((Decimal("1") + periodic_rate) ** periods - Decimal("1")) / periodic_rate)
    return future_value.quantize(Decimal("0.01"))


def calculate_emi(
    principal: Decimal | float | int,
    annual_rate: Decimal | float | int,
    tenure_months: int,
) -> Decimal:
    pv = _to_decimal(principal)
    monthly_rate = _to_decimal(annual_rate) / Decimal("1200")
    months = Decimal(tenure_months)
    if monthly_rate == 0:
        return (pv / months).quantize(Decimal("0.01"))
    factor = (Decimal("1") + monthly_rate) ** months
    emi = pv * monthly_rate * factor / (factor - Decimal("1"))
    return emi.quantize(Decimal("0.01"))


def calculate_cagr(
    beginning_value: Decimal | float | int,
    ending_value: Decimal | float | int,
    years: Decimal | float | int,
) -> Decimal:
    start = _to_decimal(beginning_value)
    end = _to_decimal(ending_value)
    period_years = _to_decimal(years)
    if start <= 0 or period_years <= 0:
        return Decimal("0")
    cagr = (end / start) ** (Decimal("1") / period_years) - Decimal("1")
    return (cagr * Decimal("100")).quantize(Decimal("0.01"))


def calculate_inflation_adjusted_value(
    nominal_value: Decimal | float | int,
    inflation_rate: Decimal | float | int,
    years: Decimal | float | int,
) -> Decimal:
    nominal = _to_decimal(nominal_value)
    inflation = _to_decimal(inflation_rate) / Decimal("100")
    period_years = _to_decimal(years)
    if inflation == 0:
        return nominal.quantize(Decimal("0.01"))
    real_value = nominal / ((Decimal("1") + inflation) ** period_years)
    return real_value.quantize(Decimal("0.01"))


def calculate_zakat_amount(
    eligible_wealth: Decimal | float | int,
    *,
    nisab_threshold: Decimal | float | int,
    zakat_rate: Decimal | float | int = Decimal("2.5"),
) -> Decimal:
    wealth = _to_decimal(eligible_wealth)
    nisab = _to_decimal(nisab_threshold)
    rate = _to_decimal(zakat_rate) / Decimal("100")
    if wealth < nisab:
        return Decimal("0.00")
    return (wealth * rate).quantize(Decimal("0.01"))


def calculate_progressive_tax(
    taxable_base: Decimal | float | int,
    slabs: tuple[ProgressiveTaxSlab, ...],
) -> tuple[Decimal, list[dict[str, Decimal | str]]]:
    remaining_income = max(_to_decimal(taxable_base), Decimal("0"))
    total_tax = Decimal("0")
    breakdown: list[dict[str, Decimal | str]] = []

    for slab in slabs:
        if remaining_income <= 0:
            break
        slab_amount = remaining_income if slab.amount is None else min(remaining_income, slab.amount)
        slab_tax = (slab_amount * slab.rate / Decimal("100")).quantize(Decimal("0.01"))
        total_tax += slab_tax
        remaining_income -= slab_amount
        breakdown.append(
            {
                "label": slab.label,
                "taxable_amount": slab_amount.quantize(Decimal("0.01")),
                "rate": slab.rate,
                "tax": slab_tax,
            }
        )

    return total_tax.quantize(Decimal("0.01")), breakdown


def calculate_investment_rebate(
    *,
    taxable_income: Decimal | float | int,
    actual_investment: Decimal | float | int,
    max_income_percentage: Decimal | float | int,
    max_amount: Decimal | float | int,
    rebate_rate: Decimal | float | int,
) -> tuple[Decimal, Decimal, Decimal, Decimal]:
    income = max(_to_decimal(taxable_income), Decimal("0"))
    investment = max(_to_decimal(actual_investment), Decimal("0"))
    income_based_cap = (income * _to_decimal(max_income_percentage) / Decimal("100")).quantize(Decimal("0.01"))
    maximum_eligible_investment = min(income_based_cap, _to_decimal(max_amount)).quantize(Decimal("0.01"))
    current_eligible_investment = min(investment, maximum_eligible_investment).quantize(Decimal("0.01"))
    remaining_eligible_investment = max(
        maximum_eligible_investment - current_eligible_investment,
        Decimal("0"),
    ).quantize(Decimal("0.01"))
    rebate = (current_eligible_investment * _to_decimal(rebate_rate) / Decimal("100")).quantize(Decimal("0.01"))
    return current_eligible_investment, maximum_eligible_investment, remaining_eligible_investment, rebate
