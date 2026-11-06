"""Run against an explicit disposable PostgreSQL database, never the app database."""

import asyncio
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from hashlib import sha256
from importlib.util import module_from_spec, spec_from_file_location
from json import dumps
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, insert, select, text, update
from sqlalchemy.engine import Connection, make_url
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.v1.v1_router import router as v1_router
from app.core.core_config import Settings, get_settings
from app.core.database_session import Base, get_db_session
from app.core.enums import UserRole
from app.core.security_config import ANONYMOUS_USER_CONTEXT, UserContext
from app.models import (
    TaxInvestmentCategory,
    TaxPlannerRuleRevision,
    TaxPlannerSettings,
    TaxPlannerSlab,
    User,
)
from app.modules.wealth.tax_planner_v2 import revision_router
from app.modules.wealth.tax_planner_v2.contracts import CurrentCalculationRequest
from app.modules.wealth.tax_planner_v2.golden_cases import GOLDEN_AS_OF, golden_cases
from app.modules.wealth.tax_planner_v2.legacy_archive import archive_and_stage, export_legacy
from app.modules.wealth.tax_planner_v2.revision_contracts import (
    CreateDraft,
    DiscardDraft,
    PublishDraft,
    SaveDraft,
)
from app.modules.wealth.tax_planner_v2.revision_service import RulesError, TaxPlannerRevisionService
from app.modules.wealth.tax_planner_v2.rules import RulePack
from app.modules.wealth.tax_planner_v2.source_packs import PACK_2026_27, PACK_2027_28

_DSN = "TAX_PLANNER_TEST_DATABASE_URL"
_MIGRATIONS = (
    "a4m5n6o7p8q9_add_tax_planner_rule_revisions.py",
    "b5n6o7p8q9r0_tax_planner_discarded_draft.py",
)
_MIGRATION_DIR = Path(__file__).resolve().parents[2] / "alembic" / "versions"
_PUBLIC = "/api/v1/wealth/tax-planner"
_ADMIN = "/api/v1/admin/tax-planner"
_ACTOR = UUID("f9b78086-e81b-44f7-b3a7-8102e88cf125")


def _migrate(connection: Connection) -> None:
    for filename in _MIGRATIONS:
        spec = spec_from_file_location("isolated_tax_planner_migration", _MIGRATION_DIR / filename)
        migration = module_from_spec(spec)
        spec.loader.exec_module(migration)
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        connection.execute(
            text("UPDATE alembic_version SET version_num = :version"),
            {"version": migration.revision},
        )


@pytest.fixture
async def isolated_db():
    dsn = os.getenv(_DSN)
    if not dsn:
        pytest.skip(f"Set {_DSN} to run isolated PostgreSQL integration tests")
    async with isolated_postgres(dsn) as db:
        yield db


@asynccontextmanager
async def isolated_postgres(dsn):
    """Create and remove a unique schema in a named disposable loopback database."""
    url = make_url(dsn)
    if (
        url.get_backend_name() != "postgresql"
        or url.host not in {"127.0.0.1", "::1", "localhost"}
        or not url.database
        or not url.database.startswith("tax_planner_test")
        or url.query
    ):
        pytest.fail("Tax planner integration requires a named loopback-only disposable database")
    url = url.set(drivername="postgresql+asyncpg")
    admin_engine = create_async_engine(url, poolclass=NullPool)
    schema = f"tax_test_{uuid4().hex}"
    engine = create_async_engine(
        url,
        poolclass=NullPool,
        connect_args={"server_settings": {"search_path": schema}},
    )
    created = False
    try:
        async with admin_engine.begin() as connection:
            assert await connection.scalar(text("SELECT current_database()")) == url.database
            await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        created = True
        async with engine.begin() as connection:
            tables = [
                model.__table__
                for model in (User, TaxPlannerSettings, TaxPlannerSlab, TaxInvestmentCategory)
            ]
            await connection.run_sync(lambda conn: Base.metadata.create_all(conn, tables=tables))
            await connection.execute(text("CREATE TABLE alembic_version (version_num varchar(32))"))
            await connection.execute(text("INSERT INTO alembic_version VALUES ('z3l4m5n6o7p8')"))
        yield engine, async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()
        if created:
            async with admin_engine.begin() as connection:
                await connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await admin_engine.dispose()


@pytest.fixture
async def sessions(isolated_db):
    engine, session_factory = isolated_db
    async with engine.begin() as connection:
        await connection.run_sync(_migrate)
    return session_factory


async def _seed_legacy(sessions) -> None:
    async with sessions.begin() as session:
        session.add_all(
            [
                TaxPlannerSettings(
                    country_code="BD",
                    tax_year_label="previous custom",
                    display_name="Custom",
                    disclaimer="Legacy statement",
                    minimum_tax_note="Legacy minimum",
                    threshold_general=Decimal("421234.1250"),
                    threshold_woman_or_senior=Decimal("425000"),
                    threshold_person_with_disability=Decimal("500000"),
                    threshold_freedom_fighter=Decimal("525000"),
                    rebate_taxable_income_limit_pct=Decimal("3"),
                    rebate_investment_pct=Decimal("15"),
                    rebate_maximum_amount=Decimal("1000000"),
                    max_salary_exemption=Decimal("500000"),
                    minimum_tax_national=Decimal("5000"),
                    minimum_tax_dhaka_ctg=Decimal("5000"),
                    minimum_tax_other_city=Decimal("4000"),
                    minimum_tax_rural=Decimal("3000"),
                ),
                TaxPlannerSlab(
                    sort_order=1,
                    band_amount=Decimal("421234.1250"),
                    rate=Decimal("0"),
                    label="Custom first band",
                    is_allowance_band=True,
                ),
                TaxPlannerSlab(
                    sort_order=2,
                    band_amount=None,
                    rate=Decimal("10"),
                    label="Custom tail",
                    is_allowance_band=False,
                ),
                TaxInvestmentCategory(
                    category_key="dps_or_savings",
                    display_label="My disabled DPS",
                    sort_order=1,
                    is_enabled=False,
                ),
            ]
        )


async def _create(sessions, year="2026-27", copy_from=None):
    async with sessions() as session:
        return await TaxPlannerRevisionService(session).create_draft(
            CreateDraft(assessment_year=year, copy_from_revision_id=copy_from),
            actor=_ACTOR,
        )


async def _preview(sessions, draft):
    async with sessions() as session:
        return await TaxPlannerRevisionService(session).preview_draft(
            draft.id,
            draft.edit_version,
            as_of=GOLDEN_AS_OF,
        )


async def _publish(sessions, draft, previous=None, *, ack=False, reason="Verified rule pack"):
    async with sessions() as session:
        return await TaxPlannerRevisionService(session).publish_draft(
            draft.id,
            PublishDraft(
                edit_version=draft.edit_version,
                content_hash=draft.content_hash,
                expected_published_revision_id=previous,
                change_reason=reason,
                acknowledge_fixture_deltas=ack,
            ),
            actor=_ACTOR,
            as_of=GOLDEN_AS_OF,
        )


async def _save(sessions, draft, rules):
    async with sessions() as session:
        return await TaxPlannerRevisionService(session).save_draft(
            draft.id,
            SaveDraft(edit_version=draft.edit_version, rules=RulePack.model_validate(rules)),
            actor=_ACTOR,
        )


async def _publish_initial(sessions, year="2026-27"):
    draft = await _create(sessions, year)
    checked = await _preview(sessions, draft)
    assert checked.publishable
    assert not checked.preview.requires_acknowledgement
    assert all(not case.differing_from_source for case in checked.cases)
    return await _publish(sessions, draft)


async def _discard(sessions, draft, *, copy_from=None, content_hash=None):
    async with sessions() as session:
        return await TaxPlannerRevisionService(session).discard_draft(
            draft.id,
            DiscardDraft(
                edit_version=draft.edit_version,
                content_hash=content_hash or draft.content_hash,
                change_reason="Replace after source verification",
                confirm_discard=True,
                copy_from_revision_id=copy_from,
            ),
            actor=_ACTOR,
        )


async def test_replace_saved_draft_is_atomic_audited_and_keeps_public_revision(sessions):
    historical = await _publish_initial(sessions)
    newer = await _create(sessions)
    await _preview(sessions, newer)
    active = await _publish(sessions, newer, previous=historical.id)
    old = await _create(sessions)
    draft = await _save(sessions, old, _presentation_edit(old, "A saved draft edit"))

    for stale, source, digest, code in [
        (old, historical.id, None, "DRAFT_CONFLICT"),
        (draft, historical.id, "0" * 64, "DRAFT_CONFLICT"),
        (draft, old.id, None, "TAX_RULE_REVISION_NOT_FOUND"),
    ]:
        with pytest.raises(RulesError) as rejected:
            await _discard(sessions, stale, copy_from=source, content_hash=digest)
        assert rejected.value.error_code == code
    async with sessions() as session:
        intact = await TaxPlannerRevisionService(session).get_revision(draft.id)
    assert intact.status == "draft" and intact.content_hash == draft.content_hash

    attempts = await asyncio.gather(
        *(_discard(sessions, draft, copy_from=historical.id) for _ in range(2)),
        return_exceptions=True,
    )
    completed = [attempt for attempt in attempts if not isinstance(attempt, Exception)]
    assert len(completed) == 1
    assert [attempt.error_code for attempt in attempts if isinstance(attempt, RulesError)] == [
        "DRAFT_CONFLICT"
    ]
    discarded, replacement = completed[0].discarded, completed[0].replacement
    assert discarded.status == "discarded" and discarded.content_hash == draft.content_hash
    assert discarded.rules == draft.rules and discarded.discarded_by_user_id == _ACTOR
    assert discarded.discarded_at is not None
    assert discarded.discard_reason == "Replace after source verification"
    assert replacement is not None and replacement.status == "draft" and replacement.preview is None
    assert replacement.copied_from_revision_id == historical.id
    assert replacement.content_hash == historical.content_hash
    async with sessions() as session:
        config = await TaxPlannerRevisionService(session).public_config(
            "2026-27", as_of=GOLDEN_AS_OF, suspended=False
        )
    assert config.selected.identity.revision_id == active.id

    for statement in (
        delete(TaxPlannerRuleRevision).where(TaxPlannerRuleRevision.id == discarded.id),
        update(TaxPlannerRuleRevision)
        .where(TaxPlannerRuleRevision.id == discarded.id)
        .values(discard_reason="rewrite history"),
    ):
        with pytest.raises(SQLAlchemyError, match="history is immutable"):
            async with sessions.begin() as session:
                await session.execute(statement)
    standalone = await _discard(sessions, replacement)
    assert standalone.replacement is None and standalone.discarded.status == "discarded"
    assert (await _create(sessions)).copied_from_revision_id == active.id


async def test_previous_source_snapshot_remains_hash_compatible_and_copyable(sessions):
    draft = await _create(sessions)
    old = draft.rules.model_dump(mode="json")
    for doc in old["sources"]:
        doc.pop("public_edition", None)
    for rule in old["rule_references"]:
        rule["references"] = [
            ref for ref in rule["references"] if "sections 64 and 65" not in ref["provision"]
        ]
        for ref in rule["references"]:
            ref.pop("public_pdf_pages", None)
    # The previous stored payload used canonical plain decimal strings and
    # had no linked-edition keys. Preserve that exact published identity.
    old_hash = sha256(
        dumps(old, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    async with sessions.begin() as session:
        await session.execute(
            update(TaxPlannerRuleRevision)
            .where(TaxPlannerRuleRevision.id == draft.id)
            .values(payload=old, content_hash=old_hash)
        )
    async with sessions() as session:
        prior = await TaxPlannerRevisionService(session).get_revision(draft.id)
    assert prior.compatible and prior.rules.model_dump(mode="json") == old
    assert (await _preview(sessions, prior)).publishable
    published = await _publish(sessions, prior)
    copied = await _create(sessions, copy_from=published.id)
    assert copied.rules.model_dump(mode="json") == old
    assert copied.content_hash == old_hash and copied.id != published.id


def _presentation_edit(draft, label):
    payload = draft.rules.model_dump(mode="json")
    payload["investment_presentation"][0]["label_en"] = label
    return payload


async def test_additive_migration_archive_reconciliation_and_idempotence(isolated_db):
    engine, sessions = isolated_db
    await _seed_legacy(sessions)
    async with sessions() as session:
        original = await export_legacy(session)
    assert original.source_alembic_revisions == ("z3l4m5n6o7p8",)
    async with engine.begin() as connection:
        await connection.run_sync(_migrate)

    async with sessions() as session:
        first = await archive_and_stage(session, original)
    async with sessions() as session:
        assert await archive_and_stage(session, original) == first
    async with sessions() as session:
        current_legacy = await export_legacy(session)
    assert current_legacy.source_alembic_revisions == ("b5n6o7p8q9r0",)
    assert current_legacy.tables == original.tables
    assert first.archive_hash == original.content_hash()

    async with sessions() as session:
        service = TaxPlannerRevisionService(session)
        archived = await service.get_revision(first.archive_revision_id)
        assert archived.status == "archived_legacy"
        assert archived.assessment_year is None and not archived.compatible
        archived_tables = archived.legacy_snapshot["tables"]
        assert (
            archived_tables["tax_planner_settings"]["rows"][0]["threshold_general"] == "421234.1250"
        )
        assert archived_tables["tax_slabs"]["row_count"] == 2
        assert archived_tables["tax_investment_categories"]["rows"][0]["is_enabled"] is False
        assert set(first.source_revision_ids) == {"2026-27", "2027-28"}
        assert len(await service.list_revisions(None)) == 3
    draft = await _create(sessions)
    changed = await _save(sessions, draft, _presentation_edit(draft, "Keep operator edit"))
    async with sessions() as session:
        with pytest.raises(RulesError, match="different revision") as error:
            await archive_and_stage(session, original)
        assert error.value.error_code == "DRAFT_CONFLICT"
    async with sessions() as session:
        after = await TaxPlannerRevisionService(session).get_revision(changed.id)
    assert after.content_hash == changed.content_hash
    assert after.rules.investment_presentation[0].label_en == "Keep operator edit"


async def test_archive_rejects_export_when_legacy_values_drift(sessions):
    await _seed_legacy(sessions)
    async with sessions() as session:
        previous = await export_legacy(session)
    async with sessions.begin() as session:
        await session.execute(
            update(TaxInvestmentCategory).values(display_label="Changed in legacy")
        )
    async with sessions() as session:
        with pytest.raises(RulesError) as error:
            await archive_and_stage(session, previous)
        assert error.value.error_code == "LEGACY_EXPORT_CHANGED"
    async with sessions() as session:
        assert await session.scalar(select(func.count()).select_from(TaxPlannerRuleRevision)) == 0


async def test_public_requires_published_compatible_snapshot_and_never_falls_back(sessions):
    async with sessions() as session:
        with pytest.raises(RulesError) as error:
            await TaxPlannerRevisionService(session).public_config(
                None, as_of=GOLDEN_AS_OF, suspended=False
            )
        assert error.value.error_code == "TAX_RULES_UNAVAILABLE"
    draft = await _create(sessions)
    # Simulate a future engine version written by another deployed service.
    async with sessions.begin() as session:
        await session.execute(
            update(TaxPlannerRuleRevision)
            .where(
                TaxPlannerRuleRevision.id == draft.id,
            )
            .values(engine_policy_version="future-engine")
        )
    # Use an isolated manual insert to model an incompatible published row.
    async with sessions.begin() as session:
        await session.execute(
            insert(TaxPlannerRuleRevision).values(
                country_code="BD",
                assessment_year="2026-27",
                income_period_start=PACK_2026_27.income_period_start,
                income_period_end=PACK_2026_27.income_period_end,
                revision_number=2,
                edit_version=1,
                status="published",
                payload_schema_version=2,
                engine_policy_version="future-engine",
                payload=PACK_2026_27.model_dump(mode="json"),
                content_hash=PACK_2026_27.content_hash(),
                published_at=func.now(),
                published_by_user_id=_ACTOR,
                change_reason="Future service",
            )
        )
    async with sessions() as session:
        with pytest.raises(RulesError) as error:
            await TaxPlannerRevisionService(session).public_config(
                "2026-27", as_of=GOLDEN_AS_OF, suspended=False
            )
        assert error.value.error_code == "TAX_RULES_UNAVAILABLE"


async def test_concurrent_drafts_edits_and_first_publication(sessions):
    one, two = await asyncio.gather(_create(sessions), _create(sessions))
    assert one.id == two.id and one.revision_number == 1
    writes = await asyncio.gather(
        _save(sessions, one, _presentation_edit(one, "First concurrent edit")),
        _save(sessions, two, _presentation_edit(two, "Second concurrent edit")),
        return_exceptions=True,
    )
    winner = next(item for item in writes if not isinstance(item, BaseException))
    failure = next(item for item in writes if isinstance(item, RulesError))
    assert winner.edit_version == 2
    assert failure.error_code == "DRAFT_CONFLICT"
    await _preview(sessions, winner)
    publishes = await asyncio.gather(
        _publish(sessions, winner),
        _publish(sessions, winner),
        return_exceptions=True,
    )
    assert sum(not isinstance(item, BaseException) for item in publishes) == 1
    assert (
        next(item for item in publishes if isinstance(item, RulesError)).error_code
        == "DRAFT_CONFLICT"
    )
    async with sessions() as session:
        revisions = await TaxPlannerRevisionService(session).list_revisions("2026-27")
    assert len(revisions) == 1 and revisions[0].status == "published"


async def test_preview_is_bound_to_revision_and_edits_and_copy_restore(sessions):
    first = await _publish_initial(sessions)
    draft = await _create(sessions)
    previous_preview = await _preview(sessions, draft)
    updated = await _save(sessions, draft, _presentation_edit(draft, "Changed presentation"))
    assert updated.preview is None
    assert updated.content_hash != previous_preview.preview.content_hash
    with pytest.raises(RulesError) as error:
        await _publish(sessions, draft, first.id)
    assert error.value.error_code == "DRAFT_CONFLICT"
    with pytest.raises(RulesError) as error:
        await _publish(sessions, updated, first.id)
    assert error.value.error_code == "PREVIEW_REQUIRED"
    await _preview(sessions, updated)
    second = await _publish(sessions, updated, first.id)
    restored = await _create(sessions, copy_from=first.id)
    assert restored.copied_from_revision_id == first.id
    assert restored.content_hash == first.content_hash
    assert restored.id != first.id
    await _preview(sessions, restored)
    third = await _publish(sessions, restored, second.id, reason="Restore verified first revision")
    async with sessions() as session:
        revisions = await TaxPlannerRevisionService(session).list_revisions("2026-27")
    assert [item.revision_number for item in revisions] == [3, 2, 1]
    assert [item.status for item in revisions] == ["published", "superseded", "superseded"]
    assert third.content_hash == first.content_hash


async def test_legal_delta_requires_evidence_and_explicit_acknowledgement(sessions):
    first = await _publish_initial(sessions)
    draft = await _create(sessions)
    changed = draft.rules.model_dump(mode="json")
    changed["dps_cap"] = "100000"
    saved = await _save(sessions, draft, changed)
    preview = await _preview(sessions, saved)
    assert not preview.publishable
    assert preview.preview.missing_source_rules == ("investment.dps",)
    with pytest.raises(RulesError) as error:
        await _publish(sessions, saved, first.id, ack=True)
    assert error.value.error_code == "TAX_RULE_PREVIEW_FAILED"

    # Synthetic authority fixture. The example is deliberately different from existing law.
    changed["sources"].append(
        {
            "id": "synthetic_amendment",
            "edition": "Synthetic amendment for integration test",
            "public_url": "https://nbr.gov.bd/synthetic.pdf",
            "sha256": "c" * 64,
        }
    )
    dps = next(item for item in changed["rule_references"] if item["id"] == "investment.dps")
    dps["references"].append(
        {
            "document_id": "synthetic_amendment",
            "pdf_pages": [1],
            "provision": "Fixture §1",
        }
    )
    amended = await _save(sessions, saved, changed)
    preview = await _preview(sessions, amended)
    assert preview.publishable and preview.preview.requires_acknowledgement
    assert next(case for case in preview.cases if case.case_id == "G16").differing_from_source
    with pytest.raises(RulesError) as error:
        await _publish(sessions, amended, first.id)
    assert error.value.error_code == "PREVIEW_ACK_REQUIRED"
    assert (await _publish(sessions, amended, first.id, ack=True)).status == "published"


async def test_publication_failure_rolls_back_supersession_and_preserves_draft(sessions):
    first = await _publish_initial(sessions)
    draft = await _create(sessions)
    await _preview(sessions, draft)
    async with sessions.begin() as session:
        await session.execute(
            text("""
            CREATE FUNCTION deny_test_publication() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF NEW.status = 'published' THEN RAISE EXCEPTION 'test interruption'; END IF;
                RETURN NEW;
            END $$;
            """)
        )
        await session.execute(
            text("""
            CREATE TRIGGER deny_test_publication BEFORE UPDATE ON tax_planner_rule_revisions
            FOR EACH ROW EXECUTE FUNCTION deny_test_publication()
            """)
        )
    with pytest.raises(SQLAlchemyError, match="test interruption"):
        await _publish(sessions, draft, first.id)
    async with sessions() as session:
        service = TaxPlannerRevisionService(session)
        assert (await service.get_revision(first.id)).status == "published"
        assert (await service.get_revision(draft.id)).status == "draft"
        config = await service.public_config(None, as_of=GOLDEN_AS_OF, suspended=False)
        assert config.selected.identity.revision_id == first.id


async def test_published_payload_and_partial_uniqueness_are_enforced_by_postgresql(sessions):
    published = await _publish_initial(sessions)
    with pytest.raises(IntegrityError, match="immutable"):
        async with sessions.begin() as session:
            await session.execute(
                update(TaxPlannerRuleRevision)
                .where(
                    TaxPlannerRuleRevision.id == published.id,
                )
                .values(content_hash="a" * 64)
            )
    draft = await _create(sessions)
    for row in (draft, published):
        with pytest.raises(IntegrityError, match=f"uq_tax_planner_rule_{row.status}"):
            async with sessions.begin() as session:
                await session.execute(
                    insert(TaxPlannerRuleRevision).values(
                        country_code="BD",
                        assessment_year=row.assessment_year,
                        income_period_start=row.income_period_start,
                        income_period_end=row.income_period_end,
                        status=row.status,
                        revision_number=10,
                        edit_version=1,
                        engine_policy_version=row.engine_policy_version,
                        payload_schema_version=row.payload_schema_version,
                        payload=row.rules.model_dump(mode="json"),
                        content_hash=row.content_hash,
                        published_at=row.published_at,
                        published_by_user_id=row.published_by_user_id,
                        change_reason=row.change_reason,
                    )
                )


async def test_reader_sees_new_publication_without_worker_cache(sessions):
    first = await _publish_initial(sessions)
    request = golden_cases(PACK_2026_27, str(first.id))[0].request
    async with sessions() as reader:
        service = TaxPlannerRevisionService(reader)
        initial = await service.calculate(request, as_of=GOLDEN_AS_OF)
        assert initial.revision_id == str(first.id)
        draft = await _create(sessions)
        await _preview(sessions, draft)
        second = await _publish(sessions, draft, first.id)
        with pytest.raises(RulesError) as error:
            await service.calculate(request, as_of=GOLDEN_AS_OF)
        assert error.value.error_code == "RULESET_CHANGED"
        assert error.value.details["revision_id"] == str(second.id)
        updated = request.model_copy(update={"expected_ruleset_revision": str(second.id)})
        current = await service.calculate(updated, as_of=GOLDEN_AS_OF)
        assert current.revision_id == str(second.id)
        assert current.base.annual_liability == Decimal("20000")


def _http_app(sessions, flags):
    app = FastAPI()
    app.include_router(v1_router, prefix="/api/v1")

    @app.middleware("http")
    async def synthetic_identity(request, call_next):
        role = request.headers.get("x-test-role")
        request.state.user = (
            UserContext(
                user_id=str(_ACTOR),
                display_name="Test actor",
                is_authenticated=True,
                roles=[role],
            )
            if role
            else ANONYMOUS_USER_CONTEXT
        )
        return await call_next(request)

    async def scoped_session() -> AsyncIterator:
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db_session] = scoped_session
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, **flags)
    return app


async def test_public_and_admin_http_paths_run_against_postgresql(sessions, monkeypatch, caplog):
    flags = {
        "tax_planner_v2_release_enabled": False,
        "tax_planner_v2_calculations_suspended": False,
    }
    monkeypatch.setattr(revision_router, "dhaka_today", lambda: GOLDEN_AS_OF)
    admin = {"x-test-role": UserRole.ADMIN.value}
    super_admin = {"x-test-role": UserRole.SUPER_ADMIN.value}
    await _seed_legacy(sessions)
    async with AsyncClient(
        transport=ASGITransport(app=_http_app(sessions, flags)), base_url="http://test"
    ) as client:
        assert (await client.get(f"{_PUBLIC}/config")).status_code == 200
        disabled = await client.get(f"{_PUBLIC}/v2/config")
        assert (
            disabled.status_code == 503 and disabled.json()["error_code"] == "TAX_RULES_UNAVAILABLE"
        )
        assert disabled.headers["Cache-Control"] == "no-store"
        assert (await client.get(f"{_ADMIN}/v2/rulesets")).status_code == 401
        assert (await client.get(f"{_ADMIN}/v2/rulesets", headers=admin)).status_code == 200
        assert (
            await client.post(
                f"{_ADMIN}/v2/drafts",
                headers=admin,
                json={
                    "assessment_year": "2026-27",
                },
            )
        ).status_code == 403

        published_ids = {}
        for year in ("2026-27", "2027-28"):
            created = await client.post(
                f"{_ADMIN}/v2/drafts", headers=super_admin, json={"assessment_year": year}
            )
            assert created.status_code == 200, created.text
            draft = created.json()["data"]
            prefix = f"{_ADMIN}/v2/drafts/{draft['id']}"
            read = await client.get(f"{_ADMIN}/v2/rulesets/{draft['id']}", headers=admin)
            assert read.json()["data"]["content_hash"] == draft["content_hash"]
            preview = await client.post(
                f"{prefix}/preview", headers=super_admin, json={"edit_version": 1}
            )
            assert preview.status_code == 200 and preview.json()["data"]["publishable"]
            response = await client.post(
                f"{prefix}/publish",
                headers=super_admin,
                json={
                    "edit_version": 1,
                    "content_hash": draft["content_hash"],
                    "expected_published_revision_id": None,
                    "change_reason": "Verified fixture",
                },
            )
            assert response.status_code == 200, response.text
            published_ids[year] = response.json()["data"]["id"]

        flags["tax_planner_v2_release_enabled"] = True
        requested_old_year = await client.get(f"{_PUBLIC}/v2/config", params={"assessment_year": "2026-27"})
        assert requested_old_year.status_code == 200
        assert requested_old_year.json()["data"]["selected"]["identity"]["assessment_year"] == "2027-28"
        available = await client.get(f"{_PUBLIC}/v2/config")
        assert available.status_code == 200
        config = available.json()["data"]
        assert available.headers["Cache-Control"] == "no-store"
        assert config["default_assessment_year"] == "2027-28"
        assert config["selected"]["identity"]["revision_id"] == published_ids["2027-28"]
        assert "created_by_user_id" not in available.text
        assert len(config["supported_years"]) == 1
        forward = await client.get(f"{_PUBLIC}/v2/config", params={"assessment_year": "2027-28"})
        assert forward.json()["data"]["selected"]["identity"]["supports_settlement"] is False
        monkeypatch.setattr(revision_router, "dhaka_today", lambda: date(2028, 7, 1))
        no_default = await client.get(f"{_PUBLIC}/v2/config")
        assert no_default.json()["data"]["selected"]["identity"]["assessment_year"] == "2027-28"
        monkeypatch.setattr(revision_router, "dhaka_today", lambda: GOLDEN_AS_OF)

        case = golden_cases(PACK_2027_28, published_ids["2027-28"])[0]
        payload = case.request.model_dump(mode="json")
        payload.pop("assessment_year")
        payload.pop("purpose")
        ok = await client.post(f"{_PUBLIC}/v2/calculate", json=payload)
        assert ok.status_code == 200, ok.text
        assert ok.json()["data"]["base"]["annual_liability"] == "20000.00"
        assert ok.headers["Cache-Control"] == "no-store"
        stale = await client.post(
            f"{_PUBLIC}/v2/calculate", json={**payload, "expected_ruleset_revision": "stale"}
        )
        assert stale.status_code == 409 and stale.json()["error_code"] == "RULESET_CHANGED"
        payload["coverage"]["wealth_surcharge"] = "unknown"
        scoped = await client.post(f"{_PUBLIC}/v2/calculate", json=payload)
        assert (
            scoped.status_code == 200 and scoped.json()["data"]["base"]["annual_liability"] is None
        )

        payload["income"][0]["amount"] = "PRIVATE-FINANCIAL-INPUT"
        payload["PRIVATE-UNKNOWN-KEY"] = "PRIVATE-UNKNOWN-VALUE"
        invalid = await client.post(f"{_PUBLIC}/v2/calculate", json=payload)
        assert invalid.status_code == 422 and invalid.headers["Cache-Control"] == "no-store"
        assert "PRIVATE-" not in invalid.text and "PRIVATE-" not in caplog.text
        assert invalid.json()["details"]["errors"]
        assert (await client.post(f"{_PUBLIC}/calculate", json={})).status_code == 410
        assert (
            await client.put(f"{_ADMIN}/config", headers=super_admin, json={})
        ).status_code == 410

        flags["tax_planner_v2_calculations_suspended"] = True
        suspended = await client.post(
            f"{_PUBLIC}/v2/calculate", json=case.request.model_dump(mode="json", exclude={"assessment_year", "purpose"})
        )
        assert (
            suspended.status_code == 503
            and suspended.json()["error_code"] == "TAX_CALCULATIONS_SUSPENDED"
        )
        assert (await client.get(f"{_PUBLIC}/v2/config")).json()["data"]["calculations_suspended"]


async def test_admin_can_prepare_a_future_year_without_changing_active_rules(sessions):
    first = await _publish_initial(sessions, "2027-28")
    future = await _create(sessions, "2028-29")
    assert future.rules.assessment_year == "2028-29"
    assert future.rules.income_period_start == date(2027, 7, 1)
    async with sessions() as session:
        config = await TaxPlannerRevisionService(session).current_config(as_of=GOLDEN_AS_OF, suspended=False)
    assert str(config.selected.identity.revision_id) == str(first.id)

    # A carried-forward draft must be reviewable, with new-year authority checked.
    checked = await _preview(sessions, future)
    assert not checked.publishable
    assert checked.preview.missing_source_rules == ("scope.individual",)
    assert checked.cases
    values = future.rules.model_dump()
    rule = next(item for item in values["rule_references"] if item["id"] == "scope.individual")
    rule["references"][0]["provision"] = "Synthetic test authority for AY 2028-29"
    reviewed = await _save(sessions, future, values)
    checked = await _preview(sessions, reviewed)
    assert checked.publishable
    published = await _publish(sessions, reviewed, ack=checked.preview.requires_acknowledgement)
    async with sessions() as session:
        config = await TaxPlannerRevisionService(session).current_config(as_of=GOLDEN_AS_OF, suspended=False)
    assert config.selected.identity.revision_id == published.id
    assert config.default_assessment_year == "2028-29"
    assert len(config.supported_years) == 1
    case = golden_cases(published.rules, str(published.id))[0]
    request = CurrentCalculationRequest.model_validate(
        case.request.model_dump(exclude={"assessment_year", "purpose"})
    )
    async with sessions() as session:
        result = await TaxPlannerRevisionService(session).calculate_current(request, as_of=GOLDEN_AS_OF)
    assert result.assessment_year == "2028-29"
    assert result.base.annual_liability == Decimal("20000")
