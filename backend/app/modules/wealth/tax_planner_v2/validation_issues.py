from pydantic_core import PydanticCustomError

# Public validation messages contain no submitted values. Paths are assigned in code.
ISSUE_MESSAGES = {
    "tax_money_string": "Use a decimal string",
    "tax_money_format": "Use plain decimal notation",
    "tax_money_precision": "Use at most two decimal places",
    "tax_date_iso": "Use an ISO calendar date",
    "tax_salary_exclusion": "Employment exclusion cannot exceed entered income",
    "tax_salary_basis": "Already taxable employment cannot receive a further exclusion",
    "tax_business_profit": "Precomputed ordinary profit cannot exceed the confirmed gross receipts",
    "tax_insurance_category": "Sum assured and policy ID require the life_insurance category",
    "tax_insurance_facts": "Relationship and location require insurance or deferred annuity",
    "tax_pf_certified": "Certified eligible amount must be within recognized PF contributions",
    "tax_pf_split": "Recognized PF requires certified eligibility or a matching annual split",
    "tax_donation_category": "Approval ID requires a supported donation category",
    "tax_explicit_confirmation": "An eligible total requires explicit confirmation",
    "tax_discard_confirmation": "Confirm that the saved draft should be discarded",
    "tax_withholding_source": "Withholding requires an income source",
    "tax_income_duplicate": "Income IDs must be unique",
    "tax_category_duplicate": "Enter one annual amount per investment category",
    "tax_payment_duplicate": "A payment cannot be entered more than once",
    "tax_pf_duplicate": "Enter one annual contribution split per recognized provident fund",
    "tax_insurance_sum": "Premiums for one policy require a consistent sum assured",
    "tax_scenario_base": "Category scenarios require itemized base amounts to check shared caps",
    "tax_no_credits": "Confirmed no credits cannot include credit entries",
    "tax_credit_source": "Each linked credit must refer to an entered income ID",
    "tax_source_url": "Use a public HTTPS source from a Bangladesh government domain",
    "tax_threshold_order": "Profile thresholds must follow the statutory ordering",
    "tax_minimum_order": "New taxpayer floor cannot exceed the ordinary floor",
    "tax_approval_dates": "Approval expiry cannot precede its effective date",
    "tax_window_dates": "Filing window end cannot precede start",
    "tax_neutral_window": "Neutral filing window cannot have an adjustment",
    "tax_income_period": "Income period does not match the assessment year",
    "tax_band_terminal": "Taxable schedule requires exactly one terminal unbounded band",
    "tax_band_rate_order": "Progressive rates must be ordered",
    "tax_presentation": "Use complete investment categories, with unique codes and display order",
    "tax_rule_coverage": "Rules require complete source references and unique IDs",
    "tax_rule_reference": "Rule reference uses an unknown policy or document",
    "tax_approval_duplicate": "Donation approvals require unique IDs",
    "tax_approval_reference": "Donation approval uses an unknown document",
    "tax_filing_unsupported": "The 2027-28 filing calendar is outside this engine policy",
    "tax_filing_contiguous": "Filing windows must cover the whole year without overlaps or gaps",
    "tax_filing_complete": "Filing windows must cover the complete assessment year",
}


def validation_issue(code: str, *path: str | int) -> PydanticCustomError:
    return PydanticCustomError(code, ISSUE_MESSAGES[code], {"tax_path": path})
