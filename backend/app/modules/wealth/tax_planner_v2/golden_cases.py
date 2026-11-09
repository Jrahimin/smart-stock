"""Source-derived synthetic cases for bootstrap validation and admin comparisons."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from .contracts import Coverage, TaxCalculationRequest, TaxCalculationResponse
from .rules import RulePack

Scalar = Decimal | str | bool | None


@dataclass(frozen=True)
class GoldenCase:
    id: str
    source: str
    request: TaxCalculationRequest
    expected: tuple[tuple[str, Scalar], ...]

    def checkpoints(self, result: TaxCalculationResponse) -> dict[str, Scalar]:
        return {path: _read_path(result, path) for path, _ in self.expected}


def _read_path(value, path: str) -> Scalar:
    for part in path.split("."):
        value = value[int(part)] if part.isdigit() else getattr(value, part)
    return value


def golden_cases(pack: RulePack, revision_id: str) -> tuple[GoldenCase, ...]:
    cases: list[GoldenCase] = []
    contribution_day = pack.income_period_end.isoformat()

    def add(case_id: str, source: str, checkpoints: dict[str, Scalar], **changes) -> None:
        payload = {
            "schema_version": 2,
            "assessment_year": pack.assessment_year,
            "expected_ruleset_revision": revision_id,
            "purpose": "filing" if pack.assessment_year == "2026-27" else "forward_planning",
            "profile": {
                "residence": "resident",
                "entity": "individual",
                "new_taxpayer_floor": "no",
                "first_return": "no",
            },
            "coverage": dict.fromkeys(Coverage.model_fields, "no"),
            "investments": {"mode": "itemized"},
            "credits_completeness": "confirmed_none",
            **changes,
        }
        if "profile" in changes:
            payload["profile"] = {
                "residence": "resident",
                "entity": "individual",
                "new_taxpayer_floor": "no",
                "first_return": "no",
                **changes["profile"],
            }
        if "coverage" in changes:
            payload["coverage"] = {
                **dict.fromkeys(Coverage.model_fields, "no"),
                **changes["coverage"],
            }
        cases.append(
            GoldenCase(
                id=case_id,
                source=source,
                request=TaxCalculationRequest.model_validate(payload),
                expected=tuple(checkpoints.items()),
            )
        )

    def ordinary(amount: str, kind: str = "ordinary_other", item_id: str = "ordinary") -> dict:
        return {
            "id": item_id,
            "kind": kind,
            "basis": "precomputed_taxable",
            "amount": amount,
            "ordinary_treatment_confirmed": "yes",
        }

    def salary(amount: str, excluded: str = "0") -> dict:
        return {
            "id": "salary",
            "kind": "private_employment",
            "basis": "gross",
            "amount": amount,
            "excluded_group_insurance_benefit": excluded,
            "benefits_valuation_complete": "yes",
        }

    def financial(item_id: str, kind: str, amount: str) -> dict:
        return {
            "id": item_id,
            "kind": kind,
            "basis": "gross",
            "amount": amount,
            "eligible_treatment_confirmed": "yes",
        }

    def investment(item_id: str, category: str, amount: str, **facts) -> dict:
        return {
            "id": item_id,
            "category": category,
            "amount": amount,
            "contributed_on": contribution_day,
            "qualification": "yes",
            **facts,
        }

    def policy(premium: str, sum_assured: str) -> dict:
        # The published examples give the eligible premium. A qualifying sum
        # assured is supplied here to demonstrate the underlying cap explicitly.
        return investment(
            "insurance",
            "life_insurance",
            premium,
            insurance_policy_id="policy",
            actual_sum_assured_excluding_bonus=sum_assured,
            insured_relationship="self",
            paid_and_payable_in_bangladesh="yes",
        )

    def total(amount: str) -> dict:
        return {"mode": "confirmed_eligible_total", "amount": amount, "confirmed_for_year": True}

    def items(*entries: dict) -> dict:
        return {"mode": "itemized", "entries": entries}

    def credit(item_id: str, amount: str, income_id: str | None = None) -> dict:
        return {
            "id": item_id,
            "amount": amount,
            "income_id": income_id,
            "kind": "withholding" if income_id else "ordinary_advance",
            "assessment_year": pack.assessment_year,
            "paid_on": contribution_day,
            "qualifying_claim_confirmed": "yes",
        }

    def filing(day: str) -> dict:
        return {
            "filing_date": day,
            "return_from_abroad_exception": "no",
            "extension_or_other_exception": "no",
        }

    add(
        "G01",
        "Plan ordinary salary scenario",
        {
            "base.income.0.deductible_amount": Decimal("300000"),
            "base.rebate_income_base": Decimal("600000"),
            "base.allowance": Decimal("400000"),
            "base.gross_tax": Decimal("20000"),
            "base.annual_liability": Decimal("20000"),
            "base.rebate.income_limit": Decimal("18000"),
            "base.rebate.additional_eligible_investment_for_statutory_limit": Decimal("180000"),
            "base.rebate.additional_eligible_investment_for_lowest_usable_liability": Decimal(
                "150000"
            ),
        },
        income=(salary("900000"),),
    )
    add(
        "G02",
        "Plan ordinary salary scenario with additional eligible investment",
        {
            "base.annual_liability": Decimal("20000"),
            "scenario.eligible_increment": Decimal("40000"),
            "scenario.annual_saving": Decimal("4000"),
            "scenario.breakdown.annual_liability": Decimal("16000"),
        },
        income=(salary("900000"),),
        investments=total("0"),
        scenario={**total("40000"), "contributed_on": contribution_day},
    )
    add(
        "G03",
        "Plan ordinary salary scenario constrained by floor",
        {
            "scenario.annual_saving": Decimal("15000"),
            "scenario.breakdown.annual_liability": Decimal("5000"),
            "scenario.breakdown.minimum_tax_amount": Decimal("5000"),
        },
        income=(salary("900000"),),
        scenario={
            "mode": "itemized",
            "entry": investment("savings", "savings_certificate", "150000"),
        },
    )
    add(
        "G04",
        "Plan rebate-income regression",
        {
            "base.gross_tax": Decimal("60000"),
            "base.rebate.entitlement": Decimal("27000"),
            "base.annual_liability": Decimal("33000"),
        },
        income=(ordinary("900000"),),
        investments=total("300000"),
    )
    g05 = {
        "base.gross_tax": Decimal("64500"),
        "base.rebate.entitlement": Decimal("29400"),
        "base.annual_liability": Decimal("35100"),
        "base.allowed_credits": Decimal("6400"),
    }
    g05_filing = {}
    if pack.assessment_year == "2026-27":
        g05["base.estimated_payable"] = Decimal("28700")
        g05_filing = {"filing": filing("2026-10-01")}
    add(
        "G05",
        "Nirdeshika 2026-27 PDF 62-63, example 18",
        g05,
        profile={"woman": True},
        income=(
            ordinary("791000", "government_employment", "govt"),
            ordinary("125000", "ordinary_rent", "rent"),
            financial("savings_profit", "savings_certificate_profit", "50000"),
            financial("bank", "bank_interest", "14000"),
        ),
        investments=items(
            investment("gpf", "government_pf", "96000"),
            investment("welfare", "approved_welfare_or_group_insurance", "3000"),
            investment("savings", "savings_certificate", "150000"),
            policy("18000", "180000"),
            investment("shares", "listed_security", "50000", new_investment="yes"),
        ),
        credits=(
            credit("wht_savings", "5000", "savings_profit"),
            credit("wht_bank", "1400", "bank"),
        ),
        credits_completeness="complete",
        **g05_filing,
    )
    add(
        "G06",
        "Nirdeshika 2026-27 PDF 65-66, example 20",
        {
            "base.rebate_income_base": Decimal("2850000"),
            "base.eligible_investment": Decimal("1080000"),
            "base.gross_tax": Decimal("502500"),
            "base.rebate.entitlement": Decimal("85500"),
            "base.annual_liability": Decimal("417000"),
            "base.income_deductions.0.allowed_amount": Decimal("70000"),
            "base.investments.4.eligible_amount": Decimal("0"),
            "base.investments.5.eligible_amount": Decimal("0"),
        },
        income=(ordinary("2920000"),),
        investments=items(
            policy("60000", "600000"),
            investment("dps", "dps", "240000"),
            investment("savings", "savings_certificate", "150000"),
            investment("zakat", "zakat", "50000", approval_id="statutory_zakat_fund"),
            investment("laptop", "ineligible_expenditure", "100000"),
            investment("fdr", "fdr_principal", "300000"),
            investment("fund", "fund_unit_etf", "700000", new_investment="yes"),
        ),
        income_deductions=(
            {
                "id": "czm",
                "kind": "czm_donation",
                "amount": "70000",
                "paid_on": contribution_day,
                "qualified_bank_transfer": "yes",
            },
        ),
    )
    add(
        "G07",
        "Nirdeshika 2026-27 PDF 67-68, example 22",
        {
            "base.gross_tax": Decimal("3000"),
            "base.rebate.entitlement": Decimal("9600"),
            "base.minimum_tax_binding": True,
            "base.annual_liability": Decimal("1000"),
        },
        profile={"new_taxpayer_floor": "yes", "first_return": "yes"},
        income=(ordinary("430000"),),
        investments=items(investment("dps", "dps", "96000")),
    )
    g08_inputs = {
        "income": (salary("1320000", "60000"),),
        "investments": items(
            policy("50000", "500000"),
            investment("dps", "dps", "150000"),
            investment("savings", "savings_certificate", "100000"),
        ),
    }
    add(
        "G08",
        "Nirdeshika 2026-27 PDF 68-70, example 23",
        {
            "base.income.0.excluded_amount": Decimal("60000"),
            "base.income.0.deductible_amount": Decimal("420000"),
            "base.ordinary_income": Decimal("840000"),
            "base.eligible_investment": Decimal("270000"),
            "base.gross_tax": Decimal("51000"),
            "base.rebate.entitlement": Decimal("25200"),
            "base.annual_liability": Decimal("25800"),
        },
        **g08_inputs,
    )
    if pack.assessment_year == "2026-27":
        for i, (day, payable) in enumerate(
            (
                ("2026-09-30", "24510"),
                ("2026-12-31", "25800"),
                ("2027-01-01", "28800"),
                ("2027-06-30", "30800"),
            ),
            start=1,
        ):
            add(
                f"G09.{i}",
                "Nirdeshika 2026-27 PDF 68-70, example 23 filing windows",
                {
                    "base.section_173_balance": Decimal("25800"),
                    "base.estimated_payable": Decimal(payable),
                },
                filing=filing(day),
                **g08_inputs,
            )
        add(
            "G10",
            "Paripatra 2026-27 PDF 107, example 30",
            {
                "base.annual_liability": Decimal("60000"),
                "base.section_173_balance": Decimal("45000"),
                "base.filing_adjustment": Decimal("-2250"),
                "base.estimated_payable": Decimal("42750"),
            },
            income=(financial("interest", "bank_interest", "900000"),),
            credits=(credit("wht", "15000", "interest"),),
            credits_completeness="complete",
            filing=filing("2026-08-10"),
        )
        add(
            "G11",
            "Paripatra 2026-27 PDF 107-108, example 31",
            {
                "base.annual_liability": Decimal("60000"),
                "base.section_173_balance": Decimal("45000"),
                "base.filing_adjustment": Decimal("3000"),
                "base.estimated_payable": Decimal("48000"),
            },
            income=(ordinary("900000"),),
            credits=(credit("advance", "15000"),),
            credits_completeness="complete",
            filing=filing("2027-03-03"),
        )
    for i, (income_amount, b, expected) in enumerate(
        (
            ("50000000", "10000000", "750000"),
            ("20000000", "4000000", "400000"),
        ),
        start=1,
    ):
        add(
            f"G12.{i}",
            "Paripatra 2026-27 PDF 75-76, rebate component examples 23 and 24",
            {
                "base.rebate.entitlement": Decimal(expected),
                "base.annual_liability": None,
            },
            income=(ordinary(income_amount),),
            investments=total(b),
            coverage={"wealth_surcharge": "unknown"},
        )
    g13 = {
        "base.ordinary_tax": Decimal("170000"),
        "base.special_tax": Decimal("150000"),
        "base.income.1.excluded_amount": Decimal("5000000"),
        "base.rebate_income_base": Decimal("1500000"),
        "base.rebate.entitlement": Decimal("45000"),
        "base.annual_liability": Decimal("275000"),
        "base.allowed_credits": Decimal("150000"),
    }
    g13_filing = {}
    if pack.assessment_year == "2026-27":
        g13["base.estimated_payable"] = Decimal("125000")
        g13_filing = {"filing": filing("2026-10-01")}
    add(
        "G13",
        "Nirdeshika 2026-27 PDF 51-52, example 12 with ordinary turnover scope confirmed",
        g13,
        income=(
            {
                **ordinary("1500000", "ordinary_business", "business"),
                "business_type": "ordinary",
                "gross_receipts": "10000000",
            },
            {
                "id": "gain",
                "kind": "listed_gain",
                "basis": "gross",
                "amount": "6000000",
                "instrument": "listed_share",
                "realized": "yes",
                "qualifying_disposal_confirmed": "yes",
                "sponsor_director_or_placement_holder": "no",
            },
        ),
        investments=items(investment("units", "fund_unit_etf", "1200000", new_investment="yes")),
        credits=(credit("advance", "150000"),),
        credits_completeness="complete",
        **g13_filing,
    )
    g14_filing = {"filing": filing("2026-10-01")} if pack.assessment_year == "2026-27" else {}
    add(
        "G14",
        "Nirdeshika 2026-27 PDF 88-90, Mahbuba surcharge case",
        {
            "base.ordinary_tax": Decimal("92400"),
            "base.special_tax": Decimal("22500"),
            "base.gross_tax": Decimal("114900"),
            "base.rebate.entitlement": Decimal("31000"),
            "base.allowed_credits": Decimal("62000"),
            "base.annual_liability": None,
            "base.estimated_payable": None,
            "base.annual_status": "needs_review",
        },
        profile={"woman": True},
        coverage={"wealth_surcharge": "yes"},
        income=(
            salary("1293000"),
            ordinary("130000", "ordinary_rent", "rent"),
            ordinary("60000", item_id="agriculture"),
            financial("dividend", "domestic_dividend", "150000"),
            financial("interest", "bank_interest", "110000"),
        ),
        investments=items(
            investment("savings", "savings_certificate", "250000"), policy("60000", "600000")
        ),
        credits=(
            credit("wht_salary", "36000", "salary"),
            credit("wht_dividend", "15000", "dividend"),
            credit("wht_interest", "11000", "interest"),
        ),
        credits_completeness="complete",
        **g14_filing,
    )
    for i, (income_amount, profile, triggered, liability) in enumerate(
        (
            ("400000", {}, False, "0"),
            ("430000", {"senior_qualified_for_year": "yes"}, False, "0"),
            ("405000", {}, True, "5000"),
            ("405000", {"new_taxpayer_floor": "yes"}, True, "1000"),
        ),
        start=1,
    ):
        add(
            f"G15.{i}",
            "Individual allowance and floor boundaries",
            {
                "base.minimum_tax_triggered": triggered,
                "base.annual_liability": Decimal(liability),
            },
            income=(ordinary(income_amount),),
            profile=profile,
        )
    add(
        "G16",
        "Plan DPS shared annual cap regression",
        {
            "base.eligible_investment": Decimal("120000"),
            "base.gross_tax": Decimal("290000"),
            "base.rebate.entitlement": Decimal("12000"),
            "base.annual_liability": Decimal("278000"),
        },
        income=(ordinary("2000000"),),
        investments=items(
            investment("dps_one", "dps", "90000"),
            investment("dps_two", "dps", "150000"),
        ),
    )
    return tuple(cases)


GOLDEN_AS_OF = date(2026, 11, 5)
