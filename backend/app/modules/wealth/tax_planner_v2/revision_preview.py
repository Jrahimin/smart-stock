from datetime import date
from decimal import Decimal
from hashlib import sha256
from json import dumps

from .contracts import TaxBreakdown, TaxCalculationResponse
from .engine import calculate_tax
from .golden_cases import GoldenCase, golden_cases
from .revision_contracts import CaseComparison, ConfigChange
from .rules import RulePack

# Legal fields whose changes require updated provenance. Presentation edits are
# hash-covered too, but they do not change the legal authority for a calculation.
LEGAL_FIELDS = {
    "assessment_year": ("scope.individual",),
    "thresholds": ("profile.allowance",),
    "taxable_bands": ("tax.slabs",),
    "employment_exemption_cap": ("income.employment",),
    "rebate": ("rebate.general",),
    "minimum_tax": ("tax.minimum",),
    "dps_cap": ("investment.dps",),
    "government_securities_cap": ("investment.gov_securities",),
    "life_insurance_sum_assured_rate": ("investment.life_insurance",),
    "dividend_rate": ("income.dividend",),
    "listed_gain_exemption": ("income.listed_gain",),
    "listed_gain_rate": ("income.listed_gain",),
    "part2_donation_limit_rate": ("deduction.czm",),
    "ordinary_turnover_zero_rate_ceiling": ("scope.turnover",),
    "donation_approvals": ("investment.donation",),
    "filing_windows": ("filing.windows",),
}


def comparison_hash(cases: tuple[CaseComparison, ...]) -> str:
    body = [case.model_dump(mode="json") for case in cases]
    return sha256(dumps(body, separators=(",", ":"), sort_keys=True).encode()).hexdigest()


def _checkpoint(value):
    if isinstance(value, Decimal):
        return format(value, "f")
    return value


def _case_checkpoints(case: GoldenCase, result: TaxCalculationResponse) -> dict:
    return {path: _checkpoint(value) for path, value in case.checkpoints(result).items()}


def _invariant_issues(result: TaxBreakdown) -> list[str]:
    issues = []
    if (result.annual_status == "complete") != (result.annual_liability is not None):
        issues.append("annual_scope")
    if (result.settlement_status == "complete") != (result.estimated_payable is not None):
        issues.append("settlement_scope")
    if result.estimated_payable is not None and result.annual_liability is None:
        issues.append("settlement_requires_annual")
    if sum(slab.tax for slab in result.slabs) != result.ordinary_tax:
        issues.append("ordinary_tax_reconciliation")
    if result.ordinary_tax + result.special_tax != result.gross_tax:
        issues.append("gross_tax_reconciliation")
    if sum(line.eligible_amount for line in result.investments) != result.eligible_investment:
        issues.append("investment_reconciliation")
    if result.rebate.entitlement != min(
        result.rebate.income_limit,
        result.rebate.investment_limit,
        result.rebate.statutory_cap,
    ):
        issues.append("rebate_limit")
    if result.minimum_tax_binding and (
        result.minimum_tax_top_up is None or result.minimum_tax_top_up <= 0
    ):
        issues.append("binding_floor")
    if result.annual_liability is not None and result.annual_liability < 0:
        issues.append("negative_liability")
    if result.estimated_payable is not None and (
        result.section_173_balance is None
        or result.filing_adjustment is None
        or result.estimated_payable < 0
        or result.section_173_balance + result.filing_adjustment != result.estimated_payable
    ):
        issues.append("settlement_reconciliation")
    return issues


def evaluate_preview(
    candidate: RulePack,
    previous: RulePack,
    *,
    candidate_id: str,
    previous_id: str,
    as_of: date,
) -> tuple[tuple[CaseComparison, ...], tuple[str, ...]]:
    cases = []
    issues = []
    for case in golden_cases(candidate, candidate_id):
        result = calculate_tax(case.request, candidate, revision_id=candidate_id, as_of=as_of)
        previous_request = case.request.model_copy(
            update={"expected_ruleset_revision": previous_id}
        )
        previous_result = calculate_tax(
            previous_request, previous, revision_id=previous_id, as_of=as_of
        )
        raw_expected = dict(case.expected)
        raw_proposed = case.checkpoints(result)
        raw_previous = case.checkpoints(previous_result)
        cases.append(
            CaseComparison(
                case_id=case.id,
                source=case.source,
                source_expected={path: _checkpoint(value) for path, value in raw_expected.items()},
                previous=_case_checkpoints(case, previous_result),
                proposed=_case_checkpoints(case, result),
                changed_checkpoints=tuple(
                    path for path, value in raw_proposed.items() if value != raw_previous[path]
                ),
                differing_from_source=tuple(
                    path for path, value in raw_proposed.items() if value != raw_expected[path]
                ),
            )
        )
        issues.extend(f"{case.id}:base:{issue}" for issue in _invariant_issues(result.base))
        if result.scenario is not None:
            issues.extend(
                f"{case.id}:scenario:{issue}"
                for issue in _invariant_issues(result.scenario.breakdown)
            )
            if result.scenario.annual_saving is not None and result.scenario.annual_saving < 0:
                issues.append(f"{case.id}:scenario:negative_saving")
    return tuple(cases), tuple(issues)


def config_changes(previous: RulePack, candidate: RulePack) -> tuple[ConfigChange, ...]:
    previous_values, candidate_values = previous.model_dump(), candidate.model_dump()
    before, after = previous.model_dump(mode="json"), candidate.model_dump(mode="json")
    return tuple(
        ConfigChange(field=key, previous=before[key], proposed=after[key])
        for key, value in candidate_values.items()
        if previous_values[key] != value
    )


def missing_authority(
    previous: RulePack, candidate: RulePack, changes: tuple[ConfigChange, ...]
) -> tuple[str, ...]:
    previous_refs = {item.id: item.references for item in previous.rule_references}
    candidate_refs = {item.id: item.references for item in candidate.rule_references}
    previous_docs = {doc.id: doc.sha256 for doc in previous.sources}
    candidate_docs = {doc.id: doc.sha256 for doc in candidate.sources}
    rules_to_check = {rule for change in changes for rule in LEGAL_FIELDS.get(change.field, ())}
    missing = []
    for rule in sorted(rules_to_check):
        old_evidence = {(ref, previous_docs[ref.document_id]) for ref in previous_refs[rule]}
        new_evidence = {(ref, candidate_docs[ref.document_id]) for ref in candidate_refs[rule]}
        if not new_evidence - old_evidence:
            missing.append(rule)
    return tuple(missing)
