from datetime import date
from decimal import Decimal, localcontext

import pytest
from pydantic import ValidationError

from app.modules.wealth.tax_planner_v2.contracts import TaxCalculationRequest
from app.modules.wealth.tax_planner_v2.engine import calculate_tax
from app.modules.wealth.tax_planner_v2.golden_cases import GOLDEN_AS_OF, golden_cases
from app.modules.wealth.tax_planner_v2.rules import RulePack
from app.modules.wealth.tax_planner_v2.source_packs import PACK_2026_27, PACK_2027_28, SOURCE_PACKS

REVISION = "test-revision"


def _case(case_id="G01", pack=PACK_2026_27):
    return next(case for case in golden_cases(pack, REVISION) if case.id == case_id)


def _payload(case_id="G01", pack=PACK_2026_27):
    return _case(case_id, pack).request.model_dump(mode="json")


def _run(payload, pack=PACK_2026_27):
    return calculate_tax(
        TaxCalculationRequest.model_validate(payload),
        pack,
        revision_id=REVISION,
        as_of=GOLDEN_AS_OF,
    )


def _investment(item_id, category, amount, **facts):
    return {
        "id": item_id,
        "category": category,
        "amount": amount,
        "contributed_on": "2026-05-01",
        "qualification": "yes",
        **facts,
    }


def _filing(day):
    return {
        "filing_date": day,
        "return_from_abroad_exception": "no",
        "extension_or_other_exception": "no",
    }


@pytest.mark.parametrize(
    ("pack", "case"),
    [(pack, case) for pack in SOURCE_PACKS for case in golden_cases(pack, REVISION)],
    ids=[
        f"{pack.assessment_year}-{case.id}"
        for pack in SOURCE_PACKS
        for case in golden_cases(pack, REVISION)
    ],
)
def test_source_golden_cases(pack, case):
    result = calculate_tax(case.request, pack, revision_id=REVISION, as_of=GOLDEN_AS_OF)
    assert case.checkpoints(result) == dict(case.expected)


@pytest.mark.parametrize(
    ("amount", "ordinary_tax"),
    [
        ("399999", "0"),
        ("400000", "0"),
        ("400001", "0.10"),
        ("699999", "29999.90"),
        ("700000", "30000"),
        ("700001", "30000.15"),
        ("1099999", "89999.85"),
        ("1100000", "90000"),
        ("1100001", "90000.20"),
        ("1599999", "189999.80"),
        ("1600000", "190000"),
        ("1600001", "190000.25"),
        ("3599999", "689999.75"),
        ("3600000", "690000"),
        ("3600001", "690000.30"),
    ],
)
def test_allowance_and_each_slab_boundary(amount, ordinary_tax):
    payload = _payload("G04")
    payload["income"][0]["amount"] = amount
    result = _run(payload).base
    assert result.ordinary_tax == Decimal(ordinary_tax)
    assert sum(item.tax for item in result.slabs) == result.ordinary_tax
    assert sum(item.taxable_amount for item in result.slabs) == Decimal(amount)
    assert result.minimum_tax_triggered == (Decimal(amount) > Decimal("400000"))


@pytest.mark.parametrize("pack", SOURCE_PACKS, ids=lambda pack: pack.assessment_year)
@pytest.mark.parametrize(
    ("field", "value", "threshold", "liability"),
    [
        ("woman", True, "450000", "15000"),
        ("senior_qualified_for_year", "yes", "450000", "15000"),
        ("disability", True, "525000", "7500"),
        ("third_gender", True, "525000", "7500"),
        ("gazetted_war_wounded_freedom_fighter", True, "550000", "5000"),
        ("gazetted_injured_july_2024_warrior", True, "550000", "5000"),
    ],
)
def test_each_public_profile_card_changes_threshold_and_tax(pack, field, value, threshold, liability):
    payload = _payload(pack=pack)
    payload["profile"][field] = value
    result = _run(payload, pack).base
    assert result.allowance == Decimal(threshold)
    assert result.annual_liability == Decimal(liability)


def test_highest_profile_plus_one_parent_dependent_addition():
    payload = _payload("G04")
    payload["profile"].update(
        {
            "woman": True,
            "senior_qualified_for_year": "yes",
            "disability": True,
            "third_gender": True,
            "gazetted_injured_july_2024_warrior": True,
            "eligible_disabled_dependents": 2,
            "no_duplicate_dependent_claim": "yes",
        }
    )
    result = _run(payload).base
    assert result.applied_profile == "gazetted_war_wounded_or_injured_july_warrior"
    assert result.dependent_allowance == Decimal("100000")
    assert result.allowance == Decimal("650000")
    payload["profile"]["no_duplicate_dependent_claim"] = "no"
    assert _run(payload).base.allowance == Decimal("550000")
    payload["profile"]["no_duplicate_dependent_claim"] = "unknown"
    assert _run(payload).base.annual_status == "needs_review"


@pytest.mark.parametrize("pack", SOURCE_PACKS, ids=lambda pack: pack.assessment_year)
@pytest.mark.parametrize(
    ("entries", "eligible", "liability"),
    [
        ([("dps", "240000")], "120000", "8000"),
        ([("government_security", "300000"), ("savings_certificate", "300000")], "500000", "5000"),
        ([("life_insurance", "40000"), ("recognized_pf", "20000"), ("listed_security", "10000")], "70000", "13000"),
        ([("fdr_principal", "100000")], "0", "20000"),
    ],
)
def test_amount_only_planning_categories_apply_caps_and_explicit_assumptions(pack, entries, eligible, liability):
    payload = _payload(pack=pack)
    payload["investments"] = {"mode": "planning_category_totals", "entries": [
        {"category": category, "amount": amount} for category, amount in entries
    ]}
    result = _run(payload, pack).base
    assert result.eligible_investment == Decimal(eligible)
    assert result.annual_liability == Decimal(liability)
    assert sum(line.eligible_amount for line in result.investments) == result.eligible_investment
    if eligible != "0":
        assert any(note.message_id == "planning_category_eligible_amount" for note in result.assumptions)


def test_planning_categories_do_not_establish_verified_filing_claims():
    payload = _payload()
    payload["investments"] = {"mode": "planning_category_totals", "entries": [{"category": "dps", "amount": "40000"}]}
    payload["filing"] = _filing("2026-10-01")
    result = _run(payload).base
    assert result.annual_liability == Decimal("16000")
    assert result.settlement_status == "needs_review"
    assert result.estimated_payable is None
    assert any(note.message_id == "planning_investments_need_filing_verification" for note in result.missing_facts)


def test_planning_categories_reject_duplicates_and_incompatible_scenario():
    payload = _payload()
    entry = {"category": "dps", "amount": "10000"}
    payload["investments"] = {"mode": "planning_category_totals", "entries": [entry, entry]}
    with pytest.raises(ValidationError):
        _run(payload)
    payload["investments"]["entries"] = [entry]
    payload["scenario"] = {"mode": "itemized", "entry": _investment("extra", "dps", "5000")}
    with pytest.raises(ValidationError):
        _run(payload)


def test_planning_dps_amount_and_slider_scenario_use_the_same_base():
    payload = _payload()
    payload["investments"] = {"mode": "planning_category_totals", "entries": [{"category": "dps", "amount": "40000"}]}
    payload["scenario"] = {"mode": "confirmed_eligible_total", "amount": "40000", "confirmed_for_year": True, "contributed_on": "2026-06-30"}
    result = _run(payload)
    assert result.base.annual_liability == Decimal("16000")
    assert result.scenario.annual_saving == Decimal("4000")
    assert result.scenario.breakdown.annual_liability == Decimal("12000")


def test_unknown_senior_qualification_is_never_inferred_from_current_age():
    payload = _payload()
    payload["profile"]["senior_qualified_for_year"] = "unknown"
    assert _run(payload).base.annual_liability is None
    payload["profile"]["age"] = 65
    with pytest.raises(ValidationError, match="Extra inputs"):
        _run(payload)


def test_unknown_new_taxpayer_floor_only_blocks_when_liability_can_change():
    payload = _payload("G15.3")
    payload["profile"]["new_taxpayer_floor"] = "unknown"
    result = _run(payload).base
    assert result.annual_liability is None
    assert any(note.message_id == "conditional_minimum_tax" for note in result.guidance)
    high = _payload("G04")
    high["profile"]["new_taxpayer_floor"] = "unknown"
    result = _run(high).base
    assert result.annual_liability == Decimal("33000")
    assert result.minimum_tax_triggered is True
    assert result.minimum_tax_binding is False
    assert result.minimum_tax_top_up == 0


def test_annual_employment_cap_is_shared_across_gross_jobs():
    payload = _payload()
    payload["income"][0]["amount"] = "1200000"
    payload["income"].append({**payload["income"][0], "id": "salary2"})
    result = _run(payload).base
    assert sum(item.deductible_amount for item in result.income) == Decimal("500000")
    assert result.ordinary_income == Decimal("1900000")
    payload["income"][1]["basis"] = "precomputed_taxable"
    assert _run(payload).base.annual_liability is None


def test_g02_aggregate_and_itemized_scenarios_match():
    aggregate = _payload("G02")
    itemized = _payload()
    itemized["scenario"] = {
        "mode": "itemized",
        "entry": _investment("dps", "dps", "40000"),
    }
    left, right = _run(aggregate).scenario, _run(itemized).scenario
    assert left.breakdown.annual_liability == right.breakdown.annual_liability == Decimal("16000")
    assert left.eligible_increment == right.eligible_increment == Decimal("40000")
    assert left.annual_saving == right.annual_saving == Decimal("4000")


def test_investment_caps_and_visibility_are_independent():
    payload = _payload("G16")
    payload["investments"]["entries"].extend(
        [
            _investment("security", "government_security", "320000"),
            _investment("savings", "savings_certificate", "300000"),
        ]
    )
    payload["scenario"] = {
        "mode": "itemized",
        "entry": _investment("scenario-dps", "dps", "10000"),
    }
    edited = PACK_2026_27.model_dump(mode="json")
    next(item for item in edited["investment_presentation"] if item["category"] == "dps")[
        "visible"
    ] = False
    pack = RulePack.model_validate(edited)
    result = _run(payload, pack)
    assert result.base.eligible_investment == Decimal("620000")
    assert result.base.investments[3].eligible_amount == Decimal("180000")
    assert result.scenario.eligible_increment == result.scenario.annual_saving == 0
    assert result.scenario.limiting_reason == "investment_shared_cap"


def test_life_insurance_caps_all_premiums_for_same_policy():
    payload = _payload("G04")
    facts = {
        "insured_relationship": "minor_child",
        "paid_and_payable_in_bangladesh": "yes",
        "insurance_policy_id": "policy",
        "actual_sum_assured_excluding_bonus": "700000",
    }
    payload["investments"] = {
        "mode": "itemized",
        "entries": [
            _investment("premium_1", "life_insurance", "60000", **facts),
            _investment("premium_2", "life_insurance", "60000", **facts),
        ],
    }
    result = _run(payload).base
    assert result.eligible_investment == Decimal("70000")
    assert result.investments[1].eligible_amount == Decimal("10000")
    assert result.investments[1].reason_codes == ("insurance_sum_assured_cap",)
    payload["investments"]["entries"][0]["insured_relationship"] = "other"
    assert _run(payload).base.eligible_investment == Decimal("60000")


def test_recognized_pf_respects_employer_matching_limit_and_certified_alternative():
    payload = _payload()
    payload["investments"]["entries"] = [
        _investment(
            "pf",
            "recognized_pf",
            "125000",
            recognized_pf_contributions={
                "fund_id": "fund",
                "employee_annual": "50000",
                "employer_annual": "75000",
            },
        ),
        _investment("pf_2", "recognized_pf", "50000", certified_eligible_amount="40000"),
    ]
    result = _run(payload).base
    assert result.eligible_investment == Decimal("140000")
    assert result.investments[0].eligible_amount == Decimal("100000")
    assert result.investments[1].eligible_amount == Decimal("40000")


def test_sro_213_approval_is_date_bound():
    payload = _payload()
    payload["investments"]["entries"] = [
        _investment("donation", "approved_donation", "5000", approval_id="brac"),
    ]
    assert _run(payload).base.annual_status == "needs_review"
    payload = _payload(pack=PACK_2027_28)
    payload["investments"]["entries"] = [
        _investment(
            "donation", "approved_donation", "5000", approval_id="brac", contributed_on="2026-07-01"
        ),
    ]
    assert _run(payload, PACK_2027_28).base.eligible_investment == Decimal("5000")


def test_duplicate_deduction_and_investment_payment_is_rejected():
    payload = _payload("G06")
    payload["investments"]["entries"][0]["id"] = payload["income_deductions"][0]["id"]
    with pytest.raises(ValidationError, match="payment cannot be entered more than once"):
        _run(payload)


@pytest.mark.parametrize("pack", SOURCE_PACKS, ids=lambda pack: pack.assessment_year)
def test_czm_limit_applies_to_aggregate_pre_donation_total(pack):
    payload = _payload("G06", pack)
    payload["income"][0]["amount"] = "900000"
    first = payload["income_deductions"][0]
    first["amount"] = "50000"
    second = {**first, "id": "czm_2", "amount": "40000"}
    payload["income_deductions"].append(second)
    at_limit = _run(payload, pack).base
    assert at_limit.annual_status == "complete"
    assert at_limit.rebate_income_base == Decimal("810000")

    second["amount"] = "40000.01"
    above_limit = _run(payload, pack).base
    assert above_limit.annual_status == "needs_review"
    assert above_limit.annual_liability is None
    assert {note.message_id for note in above_limit.missing_facts} == {
        "part2_donation_limit_exceeded"
    }

    second["amount"] = "40000"
    payload["coverage"]["other_part2_donation_claims"] = "yes"
    mixed_claims = _run(payload, pack).base
    assert mixed_claims.annual_liability is None
    assert mixed_claims.missing_facts[0].message_id == "part2_other_donation_claims_review"


def test_listed_gain_exemption_is_shared_and_unrealized_values_are_excluded():
    payload = _payload("G13")
    gain = payload["income"][1]
    gain["amount"] = "3000000"
    payload["income"].extend(
        [
            {**gain, "id": "gain_two"},
            {**gain, "id": "unrealized", "realized": "no", "amount": "9000000"},
        ]
    )
    result = _run(payload).base
    assert result.special_rate_income == Decimal("1000000")
    assert result.special_tax == Decimal("150000")
    assert result.rebate_income_base == Decimal("1500000")
    assert result.income[3].reason_codes == ("unrealized_gain_excluded",)
    payload["income"][2]["sponsor_director_or_placement_holder"] = "yes"
    result = _run(payload).base
    assert result.annual_liability is None
    assert result.income[2].classification == "unresolved"


def test_fund_exemption_does_not_establish_special_rate_for_taxable_excess():
    payload = _payload("G13", PACK_2027_28)
    gain = payload["income"][1]
    gain["instrument"] = "eligible_listed_fund"
    gain["amount"] = "5000000"
    exempt = _run(payload, PACK_2027_28).base
    assert exempt.annual_status == "complete"
    assert exempt.special_tax == 0
    payload["income"].append(
        {
            **gain,
            "id": "additional_listed_company",
            "instrument": "listed_share",
            "amount": "1000000",
        }
    )
    unresolved = _run(payload, PACK_2027_28).base
    assert unresolved.annual_liability is None
    assert unresolved.missing_facts[0].message_id == "fund_gain_excess_rate_review"
    gain["fund_excess_special_rate_confirmed"] = "yes"
    confirmed = _run(payload, PACK_2027_28).base
    assert confirmed.annual_status == "complete"
    assert confirmed.special_tax == Decimal("150000")


def test_dividend_liability_is_separate_from_actual_credit():
    payload = _payload("G14")
    payload["coverage"]["wealth_surcharge"] = "no"
    result = _run(payload).base
    assert result.rebate_income_base == Decimal("1162000")
    assert result.special_tax == Decimal("22500")
    assert result.credits[1].allowed_amount == Decimal("15000")
    assert result.annual_liability == Decimal("83900")
    assert result.estimated_payable == Decimal("21900")


def _expense(kind, amount, qualification="yes", *, id_="expense"):
    return {"id": id_, "kind": kind, "amount": amount, "qualification": qualification}


def test_verified_financial_expenses_reduce_taxable_profit_once_not_the_withholding_credit():
    payload = _payload("G10")
    payload["income"][0]["expenses"] = [
        _expense("bank_or_finance_charge", "5000"),
        _expense("borrowing_interest", "12000", id_="interest"),
        _expense("direct_expense", "8000", id_="cost"),
        _expense("direct_expense", "9999", "no", id_="unqualified"),
    ]
    base = _run(payload).base
    source = base.income[0]
    assert source.entered_amount == Decimal("900000")
    assert source.deductible_amount == Decimal("25000")
    assert source.taxable_amount == base.rebate_income_base == Decimal("875000")
    assert base.annual_liability == Decimal("56250")
    assert base.allowed_credits == Decimal("15000")
    assert base.section_173_balance == Decimal("41250")
    assert base.estimated_payable == Decimal("39187.50")
    assert any(note.message_id == "financial_expense_not_eligible" for note in base.exclusions)


def test_dividend_uses_net_financial_income_but_not_bank_interest_charges():
    payload = _payload("G14")
    payload["coverage"]["wealth_surcharge"] = "no"
    payload["income"][3]["expenses"] = [
        _expense("direct_expense", "10000"),
        _expense("bank_or_finance_charge", "1234", id_="interest-charge"),
    ]
    base = _run(payload).base
    dividend = base.income[3]
    assert dividend.deductible_amount == Decimal("10000")
    assert dividend.taxable_amount == Decimal("140000")
    assert base.special_tax == Decimal("21000")
    assert base.credits[1].allowed_amount == Decimal("15000")
    assert base.rebate_income_base == Decimal("1162000")
    assert base.estimated_payable == Decimal("20400")


@pytest.mark.parametrize(
    ("amount", "qualification", "message", "path"),
    [
        (
            "100",
            "unknown",
            "financial_expense_qualification_needed",
            "income.0.expenses.0.qualification",
        ),
        ("900001", "yes", "financial_expense_loss_review", "income.0.expenses"),
    ],
)
def test_uncertain_financial_deductions_or_potential_loss_cannot_produce_complete_tax(
    amount, qualification, message, path
):
    payload = _payload("G10")
    payload["income"][0]["expenses"] = [_expense("direct_expense", amount, qualification)]
    base = _run(payload).base
    assert base.annual_status == base.settlement_status == "needs_review"
    assert base.annual_liability is base.estimated_payable is None
    assert any(
        note.message_id == message and note.field_path == path for note in base.missing_facts
    )


def test_public_pdf_mapping_does_not_inherit_audit_edition_pages():
    for pack in SOURCE_PACKS:
        guide, press = [doc for doc in pack.sources if doc.id.startswith("nirdeshika")]
        assert guide.public_url == press.public_url and guide.sha256 != press.sha256
        assert guide.public_edition == press.edition
        refs = [ref for item in pack.rule_references for ref in item.references]
        assert all(not ref.public_pdf_pages for ref in refs if ref.document_id == guide.id)
        mapped = {ref.public_pdf_pages for ref in refs if ref.document_id == press.id}
        assert (61,) in mapped and (69,) in mapped


@pytest.mark.parametrize(
    ("day", "payable", "status"),
    [
        ("2026-06-30", None, "needs_review"),
        ("2026-07-01", "42750", "complete"),
        ("2026-09-30", "42750", "complete"),
        ("2026-10-01", "45000", "complete"),
        ("2026-12-31", "45000", "complete"),
        ("2027-01-01", "48000", "complete"),
        ("2027-03-31", "48000", "complete"),
        ("2027-04-01", "50000", "complete"),
        ("2027-06-30", "50000", "complete"),
        ("2027-07-01", None, "needs_review"),
    ],
)
def test_filing_window_boundaries(day, payable, status):
    payload = _payload("G10")
    payload["filing"] = _filing(day)
    result = _run(payload).base
    assert result.annual_liability == Decimal("60000")
    assert result.estimated_payable == (Decimal(payable) if payable is not None else None)
    assert result.settlement_status == status


def test_filing_credits_are_assessment_specific_and_can_be_paid_after_income_period():
    payload = _payload("G11")
    payload["credits"][0]["paid_on"] = "2026-10-01"
    assert _run(payload).base.estimated_payable == Decimal("48000")
    payload["credits"][0]["assessment_year"] = "2027-28"
    result = _run(payload).base
    assert result.allowed_credits == 0
    assert result.restricted_credits == Decimal("15000")
    assert result.estimated_payable == Decimal("63000")


def test_zero_or_excess_credits_get_no_unsupported_window_adjustment():
    payload = _payload("G11")
    payload["credits"][0]["amount"] = "65000"
    payload["filing"] = _filing("2026-10-15")
    neutral = _run(payload).base
    assert neutral.estimated_payable == 0
    assert neutral.excess_credits == Decimal("5000")
    payload["filing"] = _filing("2026-09-30")
    early = _run(payload).base
    assert early.settlement_status == "needs_review"
    assert early.estimated_payable is None


@pytest.mark.parametrize(
    "exception", ["credits_unknown", "first_return", "return_from_abroad", "extension"]
)
def test_annual_can_complete_when_settlement_requires_review(exception):
    payload = _payload("G11")
    if exception == "credits_unknown":
        payload["credits_completeness"] = "unknown"
    elif exception == "first_return":
        payload["profile"]["first_return"] = "yes"
    elif exception == "return_from_abroad":
        payload["filing"]["return_from_abroad_exception"] = "yes"
    else:
        payload["filing"]["extension_or_other_exception"] = "yes"
    result = _run(payload).base
    assert result.annual_liability == Decimal("60000")
    assert result.settlement_status == "needs_review"
    assert result.estimated_payable is None


def test_no_filing_request_and_forward_settlement_status_are_distinct():
    current = _run(_payload()).base
    assert current.settlement_status == "not_requested"
    forward = _payload(pack=PACK_2027_28)
    forward["filing"] = _filing("2027-10-01")
    result = _run(forward, PACK_2027_28)
    assert result.income_period_status == "open"
    assert result.base.annual_liability == Decimal("20000")
    assert result.base.settlement_status == "not_available_for_year"


def test_scenario_uses_selected_period_and_never_rewrites_actuals():
    payload = _payload("G02")
    payload["scenario"]["contributed_on"] = "2026-11-05"
    closed = _run(payload)
    assert closed.income_period_status == "closed"
    assert closed.base.eligible_investment == closed.scenario.eligible_increment == 0
    assert closed.scenario.limiting_reason == "contribution_outside_period"
    assert _run(_payload("G02")).scenario.is_historical is True
    forward = _payload("G02", pack=PACK_2027_28)
    forward["scenario"]["contributed_on"] = "2026-11-05"
    result = _run(forward, PACK_2027_28)
    assert result.scenario.is_historical is False
    assert result.base.eligible_investment == 0
    assert result.scenario.eligible_increment == Decimal("40000")


def test_existing_floor_removes_additional_usable_savings_target():
    payload = _payload("G03")
    payload["investments"]["entries"] = [payload["scenario"]["entry"]]
    payload["scenario"] = {
        "mode": "itemized",
        "entry": _investment("additional_dps", "dps", "30000"),
    }
    result = _run(payload)
    assert result.base.annual_liability == Decimal("5000")
    assert result.base.rebate.additional_eligible_investment_for_lowest_usable_liability is None
    assert result.scenario.annual_saving == 0
    assert result.scenario.limiting_reason == "minimum_tax_binding"


@pytest.mark.parametrize(
    "coverage_field",
    [
        "wealth_surcharge",
        "environmental_surcharge",
        "personal_vehicle_advance_tax",
        "commercial_vehicle_or_vessel",
        "foreign_or_treaty_income",
        "unresolved_special_income",
        "losses_or_setoff",
        "turnover_or_special_sector",
        "prior_rebate_recovery",
    ],
)
@pytest.mark.parametrize("answer", ["yes", "unknown"])
def test_unresolved_scope_never_produces_complete_total(coverage_field, answer):
    payload = _payload("G11")
    payload["coverage"][coverage_field] = answer
    result = _run(payload).base
    assert result.annual_status != "complete"
    assert result.annual_liability is result.estimated_payable is None
    assert any(item.field_path == f"coverage.{coverage_field}" for item in result.missing_facts)


def test_nonresident_and_unclassified_incomes_are_never_folded_into_ordinary():
    payload = _payload()
    payload["profile"]["residence"] = "non_resident"
    payload["income"].append(
        {
            "id": "old-other",
            "kind": "unclassified",
            "basis": "gross",
            "amount": "100000",
        }
    )
    result = _run(payload).base
    assert result.annual_status == "unsupported"
    assert result.annual_liability is None
    assert result.income[1].entered_amount == Decimal("100000")
    assert result.income[1].taxable_amount == 0


def test_turnover_threshold_is_on_aggregate_gross_receipts():
    payload = _payload("G13")
    business = payload["income"][0]
    payload["income"].append({**business, "id": "business_two", "gross_receipts": "10000001"})
    result = _run(payload).base
    assert result.annual_liability is None
    assert result.ordinary_tax == 0
    assert result.special_tax == Decimal("150000")


def test_prior_rebate_recovery_remains_a_guard_for_past_investment():
    payload = _payload()
    payload["investments"]["entries"] = [
        _investment(
            "old_fund",
            "fund_unit_etf",
            "50000",
            contributed_on="2025-06-01",
            premature_encashment="yes",
        ),
    ]
    assert _run(payload).base.annual_status == "needs_review"


@pytest.mark.parametrize(
    "invalid", [12, True, "1.001", "1e3", "-1", "NaN", "Infinity", "1000000000000000"]
)
def test_rejects_invalid_money(invalid):
    payload = _payload()
    payload["income"][0]["amount"] = invalid
    with pytest.raises(ValidationError):
        _run(payload)


@pytest.mark.parametrize(
    "invalid",
    [
        {"mode": "itemized", "amount": "10"},
        {"mode": "confirmed_eligible_total", "amount": "10", "confirmed_for_year": 1},
        {"mode": "confirmed_eligible_total", "amount": "10", "confirmed_for_year": False},
        {
            "mode": "confirmed_eligible_total",
            "amount": "10",
            "confirmed_for_year": True,
            "entries": [],
        },
    ],
)
def test_rejects_ambiguous_or_unconfirmed_investment_mode(invalid):
    payload = _payload()
    payload["investments"] = invalid
    with pytest.raises(ValidationError):
        _run(payload)


def test_duplicate_income_or_withholding_ids_rejected():
    payload = _payload("G05")
    payload["income"].append(payload["income"][0])
    with pytest.raises(ValidationError, match="Income IDs must be unique"):
        _run(payload)
    payload = _payload("G05")
    payload["credits"].append(payload["credits"][0])
    with pytest.raises(ValidationError, match="payment cannot be entered more than once"):
        _run(payload)


@pytest.mark.parametrize(
    "bands",
    [
        [{"width": None, "rate": "0"}],
        [{"width": "300000", "rate": "10"}],
        [{"width": None, "rate": "10"}, {"width": None, "rate": "15"}],
        [{"width": "300000", "rate": "15"}, {"width": None, "rate": "10"}],
        [{"width": "0", "rate": "10"}, {"width": None, "rate": "15"}],
        [{"width": None, "rate": "100.01"}],
    ],
)
def test_rejects_invalid_tax_schedule(bands):
    payload = PACK_2026_27.model_dump(mode="json")
    payload["taxable_bands"] = bands
    with pytest.raises(ValidationError):
        RulePack.model_validate(payload)


def test_hash_is_stable_after_json_roundtrip_and_covers_sources_and_year():
    payload = PACK_2026_27.model_dump(mode="json")
    original = PACK_2026_27.content_hash()
    payload["thresholds"]["general"] = "400000.00"
    assert RulePack.model_validate(payload).content_hash() == original
    assert PACK_2027_28.content_hash() != original
    payload["sources"][0]["sha256"] = "1" * 64
    assert RulePack.model_validate(payload).content_hash() != original


def test_calculation_rounding_is_context_independent_and_display_reconciles():
    payload = _payload("G04")
    payload["income"][0]["amount"] = "900000.05"
    payload["investments"]["amount"] = "0.04"
    with localcontext() as context:
        context.prec = 12
        first = _run(payload)
    with localcontext() as context:
        context.prec = 35
        second = _run(payload)
    assert first == second
    result = first.base
    assert result.gross_tax == Decimal("60000.01")
    assert result.annual_liability == Decimal("60000.00")
    assert result.rebate.effective_tax_reduction == Decimal("0.00")
    assert result.rebate.liability_rounding_adjustment == Decimal("-0.01")
    assert result.rebate.unused_entitlement == 0


def test_engine_rejects_different_revision_or_assessment_year():
    with pytest.raises(ValueError, match="requested assessment year and revision"):
        calculate_tax(_case().request, PACK_2026_27, revision_id="other", as_of=date(2026, 11, 5))
    with pytest.raises(ValueError, match="requested assessment year and revision"):
        calculate_tax(_case().request, PACK_2027_28, revision_id=REVISION, as_of=date(2026, 11, 5))
