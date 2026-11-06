from datetime import date, datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import Field, StringConstraints, field_validator

from .contracts import AssessmentYear, CapGroup, Contract, InvestmentCategory
from .rules import CategoryPolicy, Hash, RulePack, SourceDocument
from .validation_issues import validation_issue

RevisionStatus = Literal["draft", "published", "superseded", "discarded", "archived_legacy"]
EditVersion = Annotated[int, Field(strict=True, ge=1, le=2_147_483_647)]
ChangeReason = Annotated[
    str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=500)
]
CheckpointValue = str | bool | None


class YearSummary(Contract):
    assessment_year: AssessmentYear
    income_period_start: date
    income_period_end: date
    income_period_status: Literal["future", "open", "closed"]
    revision_id: UUID
    content_hash: Hash
    engine_policy_version: str
    reviewed_on: date
    supports_annual: Literal[True] = True
    supports_settlement: bool


class CategoryContract(Contract):
    category: InvestmentCategory
    policy: CategoryPolicy
    cap_group: CapGroup | None
    rule_id: str


class SelectedYear(Contract):
    identity: YearSummary
    rules: RulePack
    investment_policies: tuple[CategoryContract, ...]


class PublicConfig(Contract):
    as_of: date
    supported_years: tuple[YearSummary, ...]
    default_assessment_year: AssessmentYear | None
    selected: SelectedYear | None
    calculations_suspended: bool


class CreateDraft(Contract):
    assessment_year: AssessmentYear
    copy_from_revision_id: UUID | None = None


class SaveDraft(Contract):
    edit_version: EditVersion
    rules: RulePack


class PreviewDraft(Contract):
    edit_version: EditVersion


class PublishDraft(Contract):
    edit_version: EditVersion
    content_hash: Hash
    expected_published_revision_id: UUID | None
    change_reason: ChangeReason
    acknowledge_fixture_deltas: bool = Field(default=False, strict=True)


class DiscardDraft(Contract):
    edit_version: EditVersion
    content_hash: Hash
    change_reason: ChangeReason
    confirm_discard: bool = Field(strict=True)
    copy_from_revision_id: UUID | None = None

    @field_validator("confirm_discard")
    @classmethod
    def confirmed(cls, value: bool) -> bool:
        if not value:
            raise validation_issue("tax_discard_confirmation")
        return value


class PreviewStamp(Contract):
    content_hash: Hash
    edit_version: EditVersion
    engine_policy_version: str
    against_published_revision_id: UUID | None
    previewed_at: datetime
    comparison_hash: Hash
    requires_acknowledgement: bool
    missing_source_rules: tuple[str, ...]
    invariant_issues: tuple[str, ...]


class RevisionSummary(Contract):
    id: UUID
    country_code: str
    assessment_year: str | None
    income_period_start: date | None
    income_period_end: date | None
    revision_number: int
    status: RevisionStatus
    payload_schema_version: int
    engine_policy_version: str
    content_hash: Hash
    edit_version: int
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None
    created_by_user_id: UUID | None
    updated_by_user_id: UUID | None
    published_by_user_id: UUID | None
    copied_from_revision_id: UUID | None
    change_reason: str | None
    discarded_at: datetime | None
    discarded_by_user_id: UUID | None
    discard_reason: str | None
    compatible: bool
    sources: tuple[SourceDocument, ...]


class RevisionDetail(RevisionSummary):
    rules: RulePack | None
    legacy_snapshot: dict[str, Any] | None
    preview: PreviewStamp | None


class DiscardResult(Contract):
    discarded: RevisionDetail
    replacement: RevisionDetail | None


class ConfigChange(Contract):
    field: str
    previous: Any
    proposed: Any


class CaseComparison(Contract):
    case_id: str
    source: str
    source_expected: dict[str, CheckpointValue]
    previous: dict[str, CheckpointValue]
    proposed: dict[str, CheckpointValue]
    changed_checkpoints: tuple[str, ...]
    differing_from_source: tuple[str, ...]


class PreviewResult(Contract):
    draft_id: UUID
    preview: PreviewStamp
    publishable: bool
    config_changes: tuple[ConfigChange, ...]
    cases: tuple[CaseComparison, ...]
