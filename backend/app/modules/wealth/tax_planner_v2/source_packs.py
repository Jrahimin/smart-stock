"""Source-pinned bootstrap drafts for the two supported assessment years."""

from datetime import date

from .contracts import AssessmentYear
from .rules import (
    CATEGORY_POLICIES,
    INCOME_PERIODS,
    DonationApproval,
    InvestmentPresentation,
    RulePack,
    RuleReference,
    SourceDocument,
    SourceReference,
)

FINANCE_URL = "https://nbr.gov.bd/uploads/acts/Finance_Act_2026.pdf"
PARIPATRA_URL = (
    "https://nbr.gov.bd/uploads/news-scroller/Aykor_Poripothro_2026-2027_BG_Press_Modify_Copy.pdf"
)
GUIDE_URL = (
    "https://nbr.gov.bd/uploads/news-scroller/Aykor_Nirdashikha_2026-2027_BG_Press_Modify_Copy.pdf"
)
BASE_ACT_URL = "https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf"
REVIEWED_ON = date(2026, 11, 5)

# Hashes identify the exact evidence editions. For the supplied guide the public
# link points to NBR's press edition, whose page positions are different.
SOURCES = (
    SourceDocument(
        id="finance_2026",
        edition="Finance Act 2026, Gazette 30 June 2026, 151 PDF pages",
        public_url=FINANCE_URL,
        sha256="3063c8b4958d611e8bcaef4557b606167f3b38048ada4ccfa341d1207ab19f11",
    ),
    SourceDocument(
        id="paripatra_2026_27",
        edition="NBR Paripatra 2026-27, supplied 277-page PDF, printed page 1 = PDF 14",
        public_url=PARIPATRA_URL,
        sha256="0dc52d689e91e2f90c8b9cfdc22953d07e6fc209cbef1650269af62f327eb977",
    ),
    SourceDocument(
        id="nirdeshika_2026_27",
        edition="NBR Nirdeshika 2026-27, supplied 159-page PDF, printed page 1 = PDF 9",
        public_url=GUIDE_URL,
        public_edition="NBR press-modified Nirdeshika 2026-27, 177 PDF pages",
        sha256="a933de79520d8c8f6f9a20670051222ca20d41878fe545cfa4a35b952422f201",
    ),
    SourceDocument(
        id="nirdeshika_press_2026_27",
        edition="NBR press-modified Nirdeshika 2026-27, 177 PDF pages",
        public_url=GUIDE_URL,
        sha256="3b476f84e6225b8a104b901b68586b461603ade6cf37199ece4781ff2d87608a",
    ),
    SourceDocument(
        id="income_tax_act_2023",
        edition="Income Tax Act 2023, English Gazette 16 October 2025, 287 PDF pages",
        public_url=BASE_ACT_URL,
        sha256="c3b3dc1e2a53d864f2763b4473c2b4a4dde75de12f2ada9d538f31ddeaeb7d51",
    ),
)

F = "finance_2026"
P = "paripatra_2026_27"
N = "nirdeshika_2026_27"
PRESS = "nirdeshika_press_2026_27"
A = "income_tax_act_2023"


def _ref(document: str, pages: tuple[int, ...], provision: str) -> SourceReference:
    return SourceReference(
        document_id=document,
        pdf_pages=pages,
        provision=provision,
        public_pdf_pages=pages if document == PRESS else None,
    )


FINANCIAL_EXPENSE_AUTHORITY = _ref(
    PRESS,
    (61,),
    "Financial asset expenses under Income Tax Act sections 64 and 65",
)


_RULES = (
    (
        "income.employment",
        "income_period",
        ("qualifying gross receipts", "precomputed taxable employment"),
        (_ref(N, (28, 68, 69), "Employment exemption and example 23"),),
        ("G01", "G05", "G08"),
    ),
    (
        "income.ordinary",
        "income_period",
        ("verified ordinary income", "gross financial income"),
        (
            _ref(N, (62, 63), "Example 18, ordinary income and actual credits"),
            _ref(PRESS, (69,), "Example 18, verified ordinary income, contributions and tax"),
            FINANCIAL_EXPENSE_AUTHORITY,
        ),
        ("G05",),
    ),
    (
        "income.dividend",
        "assessment_year",
        ("qualifying resident individual domestic dividend",),
        (
            _ref(F, (123, 124), "Schedule 7"),
            _ref(N, (88, 89, 90), "Mahbuba example"),
            FINANCIAL_EXPENSE_AUTHORITY,
        ),
        ("G14",),
    ),
    (
        "income.listed_gain",
        "assessment_year",
        ("realized qualifying disposal", "verified special-rate treatment for taxable fund gain"),
        (
            _ref(A, (272,), "Schedule 6, Part 1 paragraph 36 exemption"),
            _ref(F, (123, 124), "Schedule 7 amendments retain paragraph 1(b) and (c)"),
            _ref(N, (51, 52), "Example 12"),
        ),
        ("G13",),
    ),
    (
        "profile.allowance",
        "assessment_year",
        ("verified profile and disabled dependent qualifications",),
        (_ref(F, (142, 143), "Rate schedules"), _ref(P, (14, 15, 16), "Individual allowances")),
        ("G01", "G15"),
    ),
    (
        "tax.slabs",
        "assessment_year",
        ("ordinary taxable income above applicable allowance",),
        (
            _ref(F, (142, 143), "AY 2026-27 and 2027-28 individual schedules"),
            _ref(P, (16, 17, 18), "Later scheduled years, inactive in this policy"),
        ),
        ("G01", "G04", "G16"),
    ),
    (
        "tax.minimum",
        "assessment_year",
        ("income above applicable allowance", "new-taxpayer eligibility"),
        (
            _ref(P, (15, 16), "National and eligible-new-taxpayer floor"),
            _ref(N, (67, 68), "Example 22"),
        ),
        ("G03", "G07", "G15"),
    ),
    (
        "rebate.general",
        "assessment_year",
        ("qualifying total income", "eligible investment or expenditure"),
        (
            _ref(F, (76,), "Section 78"),
            _ref(P, (74, 75, 76, 263), "Rebate formula, examples and first applicable year"),
        ),
        ("G04", "G06", "G12"),
    ),
    (
        "investment.dps",
        "income_period",
        ("eligible scheduled-bank or finance-company DPS contribution",),
        (_ref(N, (61, 65, 66, 69), "DPS category and shared cap"),),
        ("G06", "G07", "G08", "G16"),
    ),
    (
        "investment.gov_securities",
        "income_period",
        ("qualifying government security or savings certificate",),
        (
            _ref(A, (274,), "Schedule 6, Part 3 paragraph 2(7)(a)"),
            _ref(N, (61,), "Eligible government instruments"),
        ),
        ("G05", "G06", "G08"),
    ),
    (
        "investment.new_fund",
        "contribution_date",
        ("new qualifying fund, unit or ETF purchase",),
        (_ref(P, (148, 149), "Amended Schedule 6, Part 3"),),
        ("G06", "G13"),
    ),
    (
        "investment.new_listed_security",
        "contribution_date",
        ("new qualified BSEC exchange-listed investment",),
        (
            _ref(A, (275,), "Schedule 6, Part 3 paragraph 2(8)"),
            _ref(P, (148, 149), "Investment eligibility"),
        ),
        ("G05",),
    ),
    (
        "investment.life_insurance",
        "contribution_date",
        ("eligible insured relationship", "Bangladesh premium and proceeds"),
        (_ref(A, (273, 274), "Schedule 6, Part 3 paragraph 2(1) and proviso"),),
        ("G05", "G06"),
    ),
    (
        "investment.pf",
        "income_period",
        ("government or recognized provident fund", "eligible annual contribution"),
        (
            _ref(
                A,
                (241, 242, 243, 274),
                "Schedule 2, Part 3 and Schedule 6, Part 3 paragraph 2(4)-(5)",
            ),
        ),
        ("G05", "G08"),
    ),
    (
        "investment.pension_and_welfare",
        "income_period",
        ("qualifying pension, approved fund or approved policy",),
        (_ref(A, (274, 275), "Schedule 6, Part 3 paragraph 2(6), (7)(d), (12)"),),
        ("G05",),
    ),
    (
        "investment.donation",
        "contribution_date",
        ("approved recipient", "qualifying payment date"),
        (
            _ref(A, (275,), "Schedule 6, Part 3 paragraph 2(9)-(14)"),
            _ref(P, (234,), "SRO 213/2026"),
        ),
        ("G06",),
    ),
    (
        "deduction.czm",
        "contribution_date",
        ("qualified bank transfer to Centre for Zakat Management", "aggregate Part 2 limit"),
        (
            _ref(A, (70, 71), "Section 77(2) aggregate donation condition"),
            _ref(P, (148, 267), "Schedule 6, Part 2 deduction and first applicable year"),
            _ref(N, (65, 66), "Example 20"),
        ),
        ("G06",),
    ),
    (
        "credit.advance",
        "assessment_year",
        ("eligible documented withholding or advance credit",),
        (
            _ref(P, (95, 96, 97, 98, 99, 100, 101, 102, 264), "Section 163 and applicability"),
            _ref(N, (81, 82), "Tax credit"),
        ),
        ("G05", "G10", "G13", "G14"),
    ),
    (
        "filing.windows",
        "filing_date",
        ("eligible ordinary filing window and section 173 balance",),
        (
            _ref(F, (93, 94), "Section 170"),
            _ref(P, (105, 106, 107, 108), "Filing timing and examples 30 and 31"),
            _ref(PRESS, (77, 78), "Example 23, section 173 balance and filing windows"),
        ),
        ("G09", "G10", "G11"),
    ),
    (
        "scope.individual",
        "assessment_year",
        ("resident natural person", "supported classified sources"),
        (_ref(P, (14, 15), "Individual tax schedule and scope"),),
        (),
    ),
    (
        "scope.wealth_and_vehicle",
        "assessment_year",
        ("declared applicable wealth or vehicle regime",),
        (_ref(P, (21, 22, 23, 24), "Surcharge schedules"), _ref(N, (70, 71, 72), "Surcharge")),
        ("G14",),
    ),
    (
        "scope.turnover",
        "assessment_year",
        ("ordinary category and annual gross receipts",),
        (_ref(P, (235,), "SRO 324/2026, section 163(6) ordinary-category rates"),),
        ("G13",),
    ),
    (
        "scope.early_encashment",
        "contribution_date",
        ("premature disposal and prior investment-rebate claim",),
        (_ref(P, (149,), "Premature encashment and recovery"),),
        (),
    ),
)

REFERENCES = tuple(
    RuleReference(
        id=rule_id,
        effective_basis=basis,
        policy_id=rule_id,
        supported_facts=facts,
        references=references,
        golden_cases=cases,
    )
    for rule_id, basis, facts, references, cases in _RULES
)

_LABELS = (
    ("dps", "Deposit pension scheme contributions", "ডিপিএস জমা"),
    ("government_security", "Government securities", "সরকারি সিকিউরিটিজ"),
    ("savings_certificate", "Savings certificates", "সঞ্চয়পত্র"),
    ("fund_unit_etf", "New fund units or ETFs", "নতুন ফান্ড ইউনিট বা ইটিএফ"),
    ("listed_security", "New listed securities", "নতুন তালিকাভুক্ত সিকিউরিটিজ"),
    ("life_insurance", "Life insurance premiums", "জীবন বিমার প্রিমিয়াম"),
    ("deferred_annuity", "Deferred annuity", "বিলম্বিত বার্ষিকী"),
    ("government_pf", "Government provident fund", "সরকারি ভবিষ্য তহবিল"),
    ("recognized_pf", "Recognized provident fund", "স্বীকৃত ভবিষ্য তহবিল"),
    ("universal_pension", "Universal pension contributions", "সর্বজনীন পেনশন চাঁদা"),
    ("approved_superannuation", "Approved superannuation fund", "অনুমোদিত অবসর তহবিল"),
    (
        "approved_welfare_or_group_insurance",
        "Approved welfare fund or group insurance",
        "অনুমোদিত কল্যাণ তহবিল বা গোষ্ঠী বিমা",
    ),
    ("approved_donation", "Approved donations", "অনুমোদিত অনুদান"),
    ("zakat", "Statutory zakat fund", "আইনস্বীকৃত যাকাত তহবিল"),
    ("fdr_principal", "Fixed deposit principal", "স্থায়ী আমানতের মূলধন"),
    ("ordinary_savings", "Ordinary savings principal", "সাধারণ সঞ্চয়ের মূলধন"),
    ("ineligible_expenditure", "Ineligible expenditure", "অযোগ্য ব্যয়"),
    ("unknown", "Unclassified investment", "অশ্রেণিভুক্ত বিনিয়োগ"),
)

INVESTMENT_PRESENTATION = tuple(
    InvestmentPresentation(
        category=category,
        label_en=en,
        label_bn=bn,
        visible=CATEGORY_POLICIES[category][0] not in {"excluded", "needs_review"},
        order=order,
    )
    for order, (category, en, bn) in enumerate(_LABELS)
)
_ZAKAT = DonationApproval(
    id="statutory_zakat_fund",
    category="zakat",
    label_en="Zakat Fund or statutory charitable fund",
    label_bn="যাকাত তহবিল বা আইনস্বীকৃত দাতব্য তহবিল",
    effective_from=date(2023, 7, 1),
    expires_on=None,
    reference=_ref(A, (275,), "Schedule 6, Part 3 paragraph 2(11)"),
)
_SRO_213_NAMES = (
    ("ashic", "ASHIC Foundation for Childhood Cancer", "আশিক ফাউন্ডেশন"),
    ("bancat", "Bangladesh Cancer Aid Trust", "বাংলাদেশ ক্যান্সার এইড ট্রাস্ট"),
    ("al_markazul_islami", "Al-Markazul Islami", "আল-মারকাজুল ইসলামী"),
    ("disabled_child_foundation", "Disabled Child Foundation", "ডিসএবল্ড চাইল্ড ফাউন্ডেশন"),
    ("sherpur_diabetic", "Sherpur Diabetic Association", "শেরপুর ডায়াবেটিক সমিতি"),
    ("mawna_diabetic", "Mawna Diabetic Association", "মাওনা ডায়াবেটিক এসোসিয়েশন"),
    ("bangladesh_thalassemia", "Bangladesh Thalassemia Samity", "বাংলাদেশ থ্যালাসেমিয়া সমিতি"),
    ("autism_welfare", "Autism Welfare Foundation", "অটিজম ওয়েলফেয়ার ফাউন্ডেশন"),
    ("brac", "BRAC", "ব্র্যাক"),
    ("ramakrishna_dhaka", "Ramakrishna Math and Mission, Dhaka", "রামকৃষ্ণ মঠ ও রামকৃষ্ণ মিশন, ঢাকা"),
    ("chattogram_maa_shishu", "Chattogram Maa-O-Shishu Hospital", "চট্টগ্রাম মা ও শিশু হাসপাতাল"),
)
_SRO_213 = tuple(
    DonationApproval(
        id=key,
        category="approved_donation",
        label_en=en,
        label_bn=bn,
        effective_from=date(2026, 7, 1),
        expires_on=date(2030, 6, 30),
        reference=_ref(P, (234,), "SRO 213-Law/Income Tax-4/2026"),
    )
    for key, en, bn in _SRO_213_NAMES
)

# Filing dates are distinct from earning dates. The 2027-28 projection pack
# intentionally leaves the settlement capability disabled.
_FILING_2026 = (
    {
        "start": "2026-07-01",
        "end": "2026-09-30",
        "policy": "incentive",
        "rate": "5",
        "limit": "25000",
    },
    {"start": "2026-10-01", "end": "2026-12-31", "policy": "neutral", "rate": "0", "limit": "0"},
    {
        "start": "2027-01-01",
        "end": "2027-03-31",
        "policy": "additional_tax",
        "rate": "2",
        "limit": "3000",
    },
    {
        "start": "2027-04-01",
        "end": "2027-06-30",
        "policy": "additional_tax",
        "rate": "5",
        "limit": "5000",
    },
)


def _bootstrap(
    year: AssessmentYear,
    filing_windows: tuple[dict, ...],
    approvals: tuple[DonationApproval, ...],
) -> RulePack:
    start, end = INCOME_PERIODS[year]
    return RulePack.model_validate(
        {
            "assessment_year": year,
            "income_period_start": start,
            "income_period_end": end,
            "reviewed_on": REVIEWED_ON,
            "thresholds": {
                "general": "400000",
                "woman_or_senior": "450000",
                "disability_or_third_gender": "525000",
                "gazetted_war_wounded_or_injured_july_warrior": "550000",
                "disabled_dependent_addition": "50000",
            },
            "taxable_bands": [
                {"width": "300000", "rate": "10"},
                {"width": "400000", "rate": "15"},
                {"width": "500000", "rate": "20"},
                {"width": "2000000", "rate": "25"},
                {"width": None, "rate": "30"},
            ],
            "employment_exemption_cap": "500000",
            "rebate": {"income_rate": "3", "investment_rate": "10", "statutory_cap": "750000"},
            "minimum_tax": {"ordinary": "5000", "eligible_new_taxpayer": "1000"},
            "dps_cap": "120000",
            "government_securities_cap": "500000",
            "life_insurance_sum_assured_rate": "10",
            "dividend_rate": "15",
            "listed_gain_exemption": "5000000",
            "listed_gain_rate": "15",
            "part2_donation_limit_rate": "10",
            "ordinary_turnover_zero_rate_ceiling": "20000000",
            "investment_presentation": INVESTMENT_PRESENTATION,
            "donation_approvals": approvals,
            "filing_windows": filing_windows,
            "sources": SOURCES,
            "rule_references": REFERENCES,
        }
    )


PACK_2026_27 = _bootstrap("2026-27", _FILING_2026, (_ZAKAT,))
PACK_2027_28 = _bootstrap("2027-28", (), (_ZAKAT, *_SRO_213))
SOURCE_PACKS = (PACK_2026_27, PACK_2027_28)
