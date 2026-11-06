import logging
from collections import Counter
from datetime import UTC, date, datetime
from time import perf_counter
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exception_handlers import AppError
from app.models import TaxPlannerRuleRevision

from .contracts import CurrentCalculationRequest, TaxCalculationRequest, TaxCalculationResponse
from .engine import calculate_tax
from .revision_contracts import (
    CategoryContract,
    CreateDraft,
    DiscardDraft,
    DiscardResult,
    PreviewResult,
    PreviewStamp,
    PublicConfig,
    PublishDraft,
    RevisionDetail,
    RevisionSummary,
    SaveDraft,
    SelectedYear,
    YearSummary,
)
from .revision_preview import comparison_hash, config_changes, evaluate_preview, missing_authority
from .revision_repository import COUNTRY, RevisionRepository
from .rules import CATEGORY_POLICIES, INCOME_PERIODS, RulePack, income_period
from .source_packs import SOURCE_PACKS

logger = logging.getLogger(__name__)
DHAKA = ZoneInfo("Asia/Dhaka")
BOOTSTRAP_PACKS = {pack.assessment_year: pack for pack in SOURCE_PACKS}


class RulesError(AppError):
    def __init__(
        self, status: int, code: str, message: str, *, details: dict | None = None
    ) -> None:
        self.status_code = status
        super().__init__(message, error_code=code, details=details)


def dhaka_today() -> date:
    return datetime.now(DHAKA).date()


def unavailable() -> RulesError:
    return RulesError(
        503, "TAX_RULES_UNAVAILABLE", "Tax rules are unavailable for this assessment year"
    )


def unsupported_year() -> RulesError:
    return RulesError(
        422,
        "TAX_YEAR_UNSUPPORTED",
        "Assessment year is outside the supported tax policy",
        details={"assessment_years": list(INCOME_PERIODS)},
    )


def _conflict(code: str, message: str, **details) -> RulesError:
    logger.info("Tax planner revision conflict code=%s", code)
    return RulesError(409, code, message, details=details or None)


def _not_found() -> RulesError:
    return RulesError(404, "TAX_RULE_REVISION_NOT_FOUND", "Tax rule revision was not found")


def pack_from_row(row: TaxPlannerRuleRevision) -> RulePack:
    try:
        pack = RulePack.model_validate(row.payload)
    except ValidationError:
        raise unavailable() from None
    if (
        pack.country_code != row.country_code
        or pack.assessment_year != row.assessment_year
        or pack.income_period_start != row.income_period_start
        or pack.income_period_end != row.income_period_end
        or pack.schema_version != row.payload_schema_version
        or pack.engine_policy_version != row.engine_policy_version
        or pack.content_hash() != row.content_hash
    ):
        raise unavailable()
    return pack


def _compatible_pack(row: TaxPlannerRuleRevision) -> RulePack | None:
    if row.status == "archived_legacy":
        return None
    try:
        return pack_from_row(row)
    except RulesError:
        logger.warning("Incompatible tax rules revision=%s status=%s", row.id, row.status)
        return None


def _public_identity(row: TaxPlannerRuleRevision, pack: RulePack, as_of: date) -> YearSummary:
    period_status = "open"
    if as_of < pack.income_period_start:
        period_status = "future"
    elif as_of > pack.income_period_end:
        period_status = "closed"
    return YearSummary(
        assessment_year=pack.assessment_year,
        income_period_start=pack.income_period_start,
        income_period_end=pack.income_period_end,
        income_period_status=period_status,
        revision_id=row.id,
        content_hash=row.content_hash,
        engine_policy_version=pack.engine_policy_version,
        reviewed_on=pack.reviewed_on,
        supports_settlement=pack.supports_settlement,
    )


def _summary(row: TaxPlannerRuleRevision, pack: RulePack | None) -> RevisionSummary:
    return RevisionSummary.model_validate(
        {
            **{
                key: getattr(row, key)
                for key in RevisionSummary.model_fields
                if key not in {"sources", "compatible"}
            },
            "sources": pack.sources if pack else (),
            "compatible": pack is not None,
        }
    )


def _stamp(row: TaxPlannerRuleRevision) -> PreviewStamp | None:
    if row.previewed_at is None or not isinstance(row.preview_summary, dict):
        return None
    try:
        return PreviewStamp.model_validate(
            {
                **row.preview_summary,
                "content_hash": row.preview_content_hash,
                "edit_version": row.preview_edit_version,
                "engine_policy_version": row.preview_engine_policy_version,
                "against_published_revision_id": row.preview_against_revision_id,
                "previewed_at": row.previewed_at,
            }
        )
    except ValidationError:
        return None


def _detail(row: TaxPlannerRuleRevision, pack: RulePack | None) -> RevisionDetail:
    return RevisionDetail(
        **_summary(row, pack).model_dump(),
        rules=pack,
        legacy_snapshot=row.payload if row.status == "archived_legacy" else None,
        preview=_stamp(row),
    )


class TaxPlannerRevisionService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repository = RevisionRepository(session)

    async def current_config(self, *, as_of: date, suspended: bool) -> PublicConfig:
        """One public calculator: publishing a verified pack makes it active."""
        rows = await self.repository.list(status="published")
        if not rows:
            raise unavailable()
        active = max(rows, key=lambda row: (row.published_at or row.created_at, str(row.id)))
        pack_from_row(active)  # Never silently fall back to old rules if the active pack is invalid.
        config = await self.public_config(active.assessment_year, as_of=as_of, suspended=suspended)
        return config.model_copy(update={
            "supported_years": (config.selected.identity,),
            "default_assessment_year": active.assessment_year,
        })

    async def calculate_current(self, request: CurrentCalculationRequest, *, as_of: date) -> TaxCalculationResponse:
        config = await self.current_config(as_of=as_of, suspended=False)
        selected = config.selected
        if request.expected_ruleset_revision != str(selected.identity.revision_id):
            raise _conflict("RULESET_CHANGED", "The active tax rules changed. Refresh and calculate again.")
        internal = TaxCalculationRequest.model_validate({
            **request.model_dump(), "assessment_year": selected.identity.assessment_year,
            "purpose": "forward_planning",
        })
        result = await self.calculate(internal, as_of=as_of)
        if result.scenario is not None:
            result = result.model_copy(update={"scenario": result.scenario.model_copy(update={"is_historical": False})})
        return result

    async def public_config(
        self, year: str | None, *, as_of: date, suspended: bool
    ) -> PublicConfig:
        if year is not None:
            income_period(year)
        compatible = []
        for row in await self.repository.list(status="published"):
            pack = _compatible_pack(row)
            if pack is not None:
                compatible.append((_public_identity(row, pack, as_of), pack))
        if not compatible:
            raise unavailable()

        # Prefer the ordinary filing calendar, then the current income period for planning.
        default = next(
            (
                identity.assessment_year
                for identity, pack in compatible
                if any(window.start <= as_of <= window.end for window in pack.filing_windows)
            ),
            None,
        )
        if default is None:
            default = next(
                (
                    identity.assessment_year
                    for identity, _ in compatible
                    if identity.income_period_status == "open"
                ),
                None,
            )
        selected = None
        selected_year = year or default
        if selected_year is not None:
            chosen = next(
                (
                    (identity, pack)
                    for identity, pack in compatible
                    if identity.assessment_year == selected_year
                ),
                None,
            )
            if chosen is None:
                raise unavailable()
            identity, pack = chosen
            selected = SelectedYear(
                identity=identity,
                rules=pack,
                investment_policies=tuple(
                    CategoryContract(
                        category=item.category, policy=policy, cap_group=cap, rule_id=rule
                    )
                    for item in sorted(pack.investment_presentation, key=lambda item: item.order)
                    for policy, cap, rule in (CATEGORY_POLICIES[item.category],)
                ),
            )
        return PublicConfig(
            as_of=as_of,
            supported_years=tuple(identity for identity, _ in compatible),
            default_assessment_year=default,
            selected=selected,
            calculations_suspended=suspended,
        )

    async def calculate(
        self, request: TaxCalculationRequest, *, as_of: date
    ) -> TaxCalculationResponse:
        started = perf_counter()
        row = await self.repository.active(request.assessment_year, "published")
        if row is None:
            raise unavailable()
        pack = pack_from_row(row)
        if str(row.id) != request.expected_ruleset_revision:
            raise _conflict(
                "RULESET_CHANGED",
                "The published tax rules changed. Refresh the selected assessment year.",
                revision_id=str(row.id),
                content_hash=row.content_hash,
                assessment_year=pack.assessment_year,
                engine_policy_version=pack.engine_policy_version,
            )
        result = calculate_tax(request, pack, revision_id=str(row.id), as_of=as_of)
        logger.info(
            "Tax estimate revision=%s engine=%s elapsed_ms=%.2f annual=%s settlement=%s scope=%s",
            row.id,
            pack.engine_policy_version,
            (perf_counter() - started) * 1000,
            result.base.annual_status,
            result.base.settlement_status,
            dict(Counter(item.message_id for item in result.base.missing_facts)),
        )
        return result

    async def list_revisions(self, year: str | None) -> tuple[RevisionSummary, ...]:
        if year is not None:
            income_period(year)
        rows = await self.repository.list(year=year)
        return tuple(_summary(row, _compatible_pack(row)) for row in rows)

    async def get_revision(self, revision_id: UUID) -> RevisionDetail:
        row = await self.repository.get(revision_id)
        if row is None:
            raise _not_found()
        return _detail(row, _compatible_pack(row))

    async def _new_draft(
        self, pack: RulePack, *, actor: UUID | None, copied_from: UUID | None = None
    ) -> TaxPlannerRuleRevision:
        row = TaxPlannerRuleRevision(
            country_code=COUNTRY,
            assessment_year=pack.assessment_year,
            income_period_start=pack.income_period_start,
            income_period_end=pack.income_period_end,
            revision_number=await self.repository.next_number(pack.assessment_year),
            status="draft",
            payload_schema_version=pack.schema_version,
            engine_policy_version=pack.engine_policy_version,
            payload=pack.model_dump(mode="json"),
            content_hash=pack.content_hash(),
            edit_version=1,
            created_by_user_id=actor,
            updated_by_user_id=actor,
            copied_from_revision_id=copied_from,
        )
        self.session.add(row)
        await self.session.flush()
        return row

    async def create_draft(self, request: CreateDraft, *, actor: UUID) -> RevisionDetail:
        year = request.assessment_year
        async with self.session.begin():
            await self.repository.lock_year(year)
            draft = await self.repository.active(year, "draft")
            if draft is not None:
                if (
                    request.copy_from_revision_id is not None
                    and request.copy_from_revision_id != draft.copied_from_revision_id
                ):
                    raise _conflict(
                        "DRAFT_CONFLICT",
                        "An existing draft must be resolved before copying another revision.",
                        draft_id=str(draft.id),
                        edit_version=draft.edit_version,
                    )
                return _detail(draft, pack_from_row(draft))
            if request.copy_from_revision_id is not None:
                source = await self.repository.get(request.copy_from_revision_id)
                if (
                    source is None
                    or source.assessment_year != year
                    or source.status not in {"published", "superseded"}
                ):
                    raise _not_found()
            else:
                source = await self.repository.active(year, "published")
            if source is not None:
                pack = pack_from_row(source)
            elif year in BOOTSTRAP_PACKS:
                pack = BOOTSTRAP_PACKS[year]
            else:
                published = await self.repository.list(status="published")
                if not published:
                    raise unavailable()
                previous = max(published, key=lambda row: (row.published_at or row.created_at, str(row.id)))
                start, end = income_period(year)
                values = pack_from_row(previous).model_dump()
                values.update(assessment_year=year, income_period_start=start, income_period_end=end, filing_windows=())
                pack = RulePack.model_validate(values)
                source = previous
            draft = await self._new_draft(
                pack, actor=actor, copied_from=source.id if source else None
            )
            return _detail(draft, pack)

    async def _locked_draft(self, revision_id: UUID, edit_version: int) -> TaxPlannerRuleRevision:
        year = await self.repository.assessment_year(revision_id)
        if year is None:
            raise _not_found()
        await self.repository.lock_year(year)
        row = await self.repository.get(revision_id, for_update=True)
        if row is None:
            raise _not_found()
        if row.status != "draft" or row.edit_version != edit_version:
            raise _conflict(
                "DRAFT_CONFLICT",
                "The draft changed. Reload it before saving or publishing.",
                revision_id=str(row.id),
                edit_version=row.edit_version,
                status=row.status,
            )
        return row

    async def save_draft(
        self, revision_id: UUID, request: SaveDraft, *, actor: UUID
    ) -> RevisionDetail:
        async with self.session.begin():
            row = await self._locked_draft(revision_id, request.edit_version)
            pack = request.rules
            if pack.assessment_year != row.assessment_year:
                raise RulesError(
                    422,
                    "TAX_RULE_YEAR_MISMATCH",
                    "A draft cannot change its assessment year",
                    details={"field": "rules.assessment_year"},
                )
            digest = pack.content_hash()
            if digest != row.content_hash:
                row.payload = pack.model_dump(mode="json")
                row.content_hash = digest
                row.edit_version += 1
                row.updated_by_user_id = actor
                row.previewed_at = None
                row.preview_content_hash = None
                row.preview_edit_version = None
                row.preview_engine_policy_version = None
                row.preview_against_revision_id = None
                row.preview_summary = None
                await self.session.flush()
                await self.session.refresh(row)
            return _detail(row, pack_from_row(row))

    async def discard_draft(
        self, revision_id: UUID, request: DiscardDraft, *, actor: UUID
    ) -> DiscardResult:
        async with self.session.begin():
            row = await self._locked_draft(revision_id, request.edit_version)
            if request.content_hash != row.content_hash:
                raise _conflict(
                    "DRAFT_CONFLICT",
                    "The draft changed. Reload it before discarding.",
                    revision_id=str(row.id),
                    edit_version=row.edit_version,
                    status=row.status,
                )
            source = None
            replacement_pack = None
            if request.copy_from_revision_id is not None:
                source = await self.repository.get(request.copy_from_revision_id)
                if (
                    source is None
                    or source.assessment_year != row.assessment_year
                    or source.status not in {"published", "superseded"}
                ):
                    raise _not_found()
                replacement_pack = pack_from_row(source)
            row.status = "discarded"
            row.discarded_at = datetime.now(UTC)
            row.discarded_by_user_id = actor
            row.discard_reason = request.change_reason
            await self.session.flush()
            await self.session.refresh(row)
            replacement = None
            if replacement_pack is not None and source is not None:
                new_draft = await self._new_draft(
                    replacement_pack, actor=actor, copied_from=source.id
                )
                replacement = _detail(new_draft, replacement_pack)
            return DiscardResult(
                discarded=_detail(row, _compatible_pack(row)), replacement=replacement
            )

    async def _evaluate(
        self,
        row: TaxPlannerRuleRevision,
        current: TaxPlannerRuleRevision | None,
        *,
        pack: RulePack,
        as_of: date,
    ) -> PreviewResult:
        previous_pack = _compatible_pack(current) if current is not None else None
        prior = (
            await self.repository.get(row.copied_from_revision_id)
            if row.copied_from_revision_id is not None
            else None
        )
        bootstrap = BOOTSTRAP_PACKS.get(pack.assessment_year)
        before = previous_pack or bootstrap or (_compatible_pack(prior) if prior else None)
        if before is None:
            raise unavailable()
        before_id = str(current.id) if previous_pack is not None else str(prior.id) if prior else "source-pack"
        comparison_pack = before
        if before.assessment_year != pack.assessment_year:
            values = before.model_dump()
            values.update(
                assessment_year=pack.assessment_year,
                income_period_start=pack.income_period_start,
                income_period_end=pack.income_period_end,
                filing_windows=(),
            )
            comparison_pack = RulePack.model_validate(values)
        cases, issues = evaluate_preview(
            pack,
            comparison_pack,
            candidate_id=str(row.id),
            previous_id=before_id,
            as_of=as_of,
        )
        changes = config_changes(before, pack)
        # Exact copies of previously published revisions use their original authority.
        verified_restore = (
            prior is not None
            and prior.status in {"published", "superseded"}
            and prior.assessment_year == row.assessment_year
            and prior.content_hash == row.content_hash
            and _compatible_pack(prior) is not None
        )
        is_bootstrap = bootstrap is not None and pack.content_hash() == bootstrap.content_hash()
        if is_bootstrap and any(case.differing_from_source for case in cases):
            issues = (*issues, "bootstrap_fixture_mismatch")
        needs_ack = any(case.changed_checkpoints or case.differing_from_source for case in cases)
        source_gaps = (
            () if verified_restore or is_bootstrap else missing_authority(before, pack, changes)
        )
        stamp = PreviewStamp(
            content_hash=row.content_hash,
            edit_version=row.edit_version,
            engine_policy_version=pack.engine_policy_version,
            against_published_revision_id=current.id if current else None,
            previewed_at=datetime.now(UTC),
            requires_acknowledgement=needs_ack,
            comparison_hash=comparison_hash(cases),
            missing_source_rules=source_gaps,
            invariant_issues=issues,
        )
        return PreviewResult(
            draft_id=row.id,
            preview=stamp,
            publishable=not issues and not source_gaps,
            config_changes=changes,
            cases=cases,
        )

    async def preview_draft(
        self, revision_id: UUID, edit_version: int, *, as_of: date
    ) -> PreviewResult:
        async with self.session.begin():
            row = await self._locked_draft(revision_id, edit_version)
            pack = pack_from_row(row)
            current = await self.repository.active(pack.assessment_year, "published")
            result = await self._evaluate(row, current, pack=pack, as_of=as_of)
            stamp = result.preview
            row.previewed_at = stamp.previewed_at
            row.preview_content_hash = stamp.content_hash
            row.preview_edit_version = stamp.edit_version
            row.preview_engine_policy_version = stamp.engine_policy_version
            row.preview_against_revision_id = stamp.against_published_revision_id
            row.preview_summary = stamp.model_dump(
                mode="json",
                include={
                    "comparison_hash",
                    "requires_acknowledgement",
                    "missing_source_rules",
                    "invariant_issues",
                },
            )
            await self.session.flush()
            return result

    async def publish_draft(
        self,
        revision_id: UUID,
        request: PublishDraft,
        *,
        actor: UUID,
        as_of: date,
    ) -> RevisionDetail:
        async with self.session.begin():
            row = await self._locked_draft(revision_id, request.edit_version)
            pack = pack_from_row(row)
            current = await self.repository.active(
                pack.assessment_year, "published", for_update=True
            )
            current_id = current.id if current else None
            if current_id != request.expected_published_revision_id:
                raise _conflict(
                    "RULESET_CHANGED",
                    "The published revision changed. Preview the draft again.",
                    revision_id=str(current_id) if current_id else None,
                )
            stamp = _stamp(row)
            if (
                stamp is None
                or stamp.content_hash != request.content_hash
                or stamp.content_hash != row.content_hash
                or stamp.edit_version != request.edit_version
                or stamp.engine_policy_version != pack.engine_policy_version
                or stamp.against_published_revision_id != current_id
            ):
                raise _conflict("PREVIEW_REQUIRED", "Preview this exact draft before publishing.")
            checked = await self._evaluate(row, current, pack=pack, as_of=as_of)
            if checked.preview.comparison_hash != stamp.comparison_hash:
                raise _conflict("PREVIEW_REQUIRED", "Comparison outputs changed. Preview again.")
            if not checked.publishable:
                raise RulesError(
                    422,
                    "TAX_RULE_PREVIEW_FAILED",
                    "Resolve preview issues before publishing.",
                    details={
                        "missing_source_rules": checked.preview.missing_source_rules,
                        "invariant_issues": checked.preview.invariant_issues,
                    },
                )
            if checked.preview.requires_acknowledgement and not request.acknowledge_fixture_deltas:
                raise _conflict(
                    "PREVIEW_ACK_REQUIRED", "Review and acknowledge the changed example results."
                )
            if current is not None:
                current.status = "superseded"
                await self.session.flush()
            row.status = "published"
            row.published_at = datetime.now(UTC)
            row.published_by_user_id = actor
            row.change_reason = request.change_reason
            await self.session.flush()
            await self.session.refresh(row)
            return _detail(row, pack)

    async def ensure_bootstrap_draft(self, pack: RulePack) -> TaxPlannerRuleRevision:
        """Stage an exact source pack inside the caller's transaction."""
        await self.repository.lock_year(pack.assessment_year)
        current = await self.repository.active(pack.assessment_year, "draft")
        if current is None:
            current = await self.repository.active(pack.assessment_year, "published")
        if current is not None:
            if current.content_hash != pack.content_hash() or _compatible_pack(current) is None:
                raise _conflict(
                    "DRAFT_CONFLICT",
                    "A different revision exists. Preserve it and review the source pack manually.",
                    revision_id=str(current.id),
                    edit_version=current.edit_version,
                )
            return current
        return await self._new_draft(pack, actor=None)
