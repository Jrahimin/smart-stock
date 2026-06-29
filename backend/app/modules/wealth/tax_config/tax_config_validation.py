from decimal import Decimal

from app.core.exception_handlers import AppError
from app.core.enums import TaxProfileCode


def validate_non_negative_amount(value: Decimal, *, field_name: str) -> None:
    if value < 0:
        raise AppError(f"{field_name} must be zero or greater")


def validate_profile_thresholds(thresholds: dict[TaxProfileCode, Decimal]) -> None:
    required = {
        TaxProfileCode.GENERAL,
        TaxProfileCode.WOMAN_OR_SENIOR,
        TaxProfileCode.PERSON_WITH_DISABILITY,
        TaxProfileCode.FREEDOM_FIGHTER,
    }
    missing = required - set(thresholds)
    if missing:
        labels = ", ".join(sorted(code.value for code in missing))
        raise AppError(f"Missing profile thresholds: {labels}")
    for code, amount in thresholds.items():
        validate_non_negative_amount(amount, field_name=f"{code.value} threshold")


def validate_rebate_config(
    *,
    taxable_income_limit_pct: Decimal,
    investment_rebate_pct: Decimal,
    maximum_rebate_amount: Decimal,
) -> None:
    validate_non_negative_amount(taxable_income_limit_pct, field_name="Taxable income limit percentage")
    validate_non_negative_amount(investment_rebate_pct, field_name="Investment rebate percentage")
    validate_non_negative_amount(maximum_rebate_amount, field_name="Maximum rebate amount")


def validate_minimum_tax_amounts(
    *,
    national: Decimal,
    dhaka_ctg: Decimal,
    other_city: Decimal,
    rural: Decimal,
) -> None:
    validate_non_negative_amount(national, field_name="National minimum tax")
    validate_non_negative_amount(dhaka_ctg, field_name="Dhaka/Chittagong minimum tax")
    validate_non_negative_amount(other_city, field_name="Other city minimum tax")
    validate_non_negative_amount(rural, field_name="Rural minimum tax")


def validate_max_salary_exemption(max_exemption: Decimal) -> None:
    validate_non_negative_amount(max_exemption, field_name="Max salary exemption")


class SlabInput:
    __slots__ = ("sort_order", "is_allowance_band")

    def __init__(self, sort_order: int, is_allowance_band: bool) -> None:
        self.sort_order = sort_order
        self.is_allowance_band = is_allowance_band


def validate_slabs(slabs: list[SlabInput]) -> None:
    if not slabs:
        raise AppError("At least one tax slab is required")

    allowance_count = sum(1 for slab in slabs if slab.is_allowance_band)
    if allowance_count != 1:
        raise AppError("Exactly one allowance slab is required")

    sort_orders = [slab.sort_order for slab in slabs]
    if len(sort_orders) != len(set(sort_orders)):
        raise AppError("Duplicate slab sort_order values are not allowed")
