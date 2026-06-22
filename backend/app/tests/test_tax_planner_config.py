from decimal import Decimal

import pytest

from app.core.enums import TaxProfileCode
from app.core.exception_handlers import AppError
from app.modules.wealth.tax_config.tax_config_builder import minimum_tax_rules_from_settings
from app.modules.wealth.tax_config.tax_config_validation import (
    SlabInput,
    validate_minimum_tax_amounts,
    validate_profile_thresholds,
    validate_slabs,
)


class _SettingsStub:
    minimum_tax_national = Decimal("5000")
    minimum_tax_dhaka_ctg = Decimal("5000")
    minimum_tax_other_city = Decimal("4000")
    minimum_tax_rural = Decimal("3000")


def test_minimum_tax_rules_from_settings_maps_location_tiers() -> None:
    rules = minimum_tax_rules_from_settings(_SettingsStub())
    by_code = {rule.rule_code: rule for rule in rules}

    assert by_code["NATIONAL_DEFAULT"].location_code is None
    assert by_code["NATIONAL_DEFAULT"].minimum_amount == Decimal("5000")
    assert by_code["LOCATION_DHAKA_CTG"].location_code == "DHAKA_CHITTAGONG"
    assert by_code["LOCATION_OTHER_CITY"].minimum_amount == Decimal("4000")
    assert by_code["LOCATION_RURAL"].minimum_amount == Decimal("3000")


def test_validate_profile_thresholds_requires_all_profiles() -> None:
    with pytest.raises(AppError, match="Missing profile thresholds"):
        validate_profile_thresholds({TaxProfileCode.GENERAL: Decimal("375000")})

    validate_profile_thresholds(
        {
            TaxProfileCode.GENERAL: Decimal("375000"),
            TaxProfileCode.WOMAN_OR_SENIOR: Decimal("425000"),
            TaxProfileCode.PERSON_WITH_DISABILITY: Decimal("500000"),
            TaxProfileCode.FREEDOM_FIGHTER: Decimal("525000"),
        }
    )


def test_validate_minimum_tax_amounts_rejects_negative_values() -> None:
    with pytest.raises(AppError, match="National minimum tax"):
        validate_minimum_tax_amounts(
            national=Decimal("-1"),
            dhaka_ctg=Decimal("5000"),
            other_city=Decimal("4000"),
            rural=Decimal("3000"),
        )


def test_validate_slabs_enforces_single_allowance_band() -> None:
    with pytest.raises(AppError, match="Exactly one allowance slab"):
        validate_slabs([SlabInput(1, False), SlabInput(2, False)])

    validate_slabs([SlabInput(1, True), SlabInput(2, False)])
