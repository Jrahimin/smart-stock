"""Add immutable tax-planner revisions while retaining the legacy settings."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "a4m5n6o7p8q9"
down_revision = "z3l4m5n6o7p8"
branch_labels = None
depends_on = None

TABLE = "tax_planner_rule_revisions"


def upgrade() -> None:
    op.create_table(
        TABLE,
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("country_code", sa.String(2), nullable=False),
        sa.Column("assessment_year", sa.String(7)),
        sa.Column("income_period_start", sa.Date()),
        sa.Column("income_period_end", sa.Date()),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("payload_schema_version", sa.Integer(), nullable=False),
        sa.Column("engine_policy_version", sa.String(80), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("edit_version", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("published_by_user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("change_reason", sa.String(500)),
        sa.Column("copied_from_revision_id", postgresql.UUID(as_uuid=True)),
        sa.Column("previewed_at", sa.DateTime(timezone=True)),
        sa.Column("preview_content_hash", sa.String(64)),
        sa.Column("preview_edit_version", sa.Integer()),
        sa.Column("preview_engine_policy_version", sa.String(80)),
        sa.Column("preview_against_revision_id", postgresql.UUID(as_uuid=True)),
        sa.Column("preview_summary", postgresql.JSONB()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["copied_from_revision_id"], [f"{TABLE}.id"]),
        sa.UniqueConstraint(
            "country_code",
            "assessment_year",
            "revision_number",
            name="uq_tax_planner_rule_revision_number",
        ),
        sa.CheckConstraint("country_code = 'BD'", name=op.f(f"ck_{TABLE}_country")),
        sa.CheckConstraint(
            "status IN ('draft', 'published', 'superseded', 'archived_legacy')",
            name=op.f(f"ck_{TABLE}_status"),
        ),
        sa.CheckConstraint(
            "(status = 'archived_legacy' AND assessment_year IS NULL "
            "AND income_period_start IS NULL AND income_period_end IS NULL) OR "
            "(status <> 'archived_legacy' AND assessment_year IS NOT NULL "
            "AND assessment_year ~ '^[0-9]{4}-[0-9]{2}$' AND income_period_start IS NOT NULL "
            "AND income_period_end IS NOT NULL AND income_period_start <= income_period_end)",
            name=op.f(f"ck_{TABLE}_year_period"),
        ),
        sa.CheckConstraint(
            "revision_number > 0 AND edit_version > 0", name=op.f(f"ck_{TABLE}_positive_versions")
        ),
        sa.CheckConstraint(
            "payload_schema_version > 0 AND jsonb_typeof(payload) = 'object' "
            "AND content_hash ~ '^[a-f0-9]{64}$'",
            name=op.f(f"ck_{TABLE}_payload_identity"),
        ),
        sa.CheckConstraint(
            "(status IN ('published', 'superseded') AND published_at IS NOT NULL "
            "AND published_by_user_id IS NOT NULL AND change_reason IS NOT NULL) OR "
            "(status IN ('draft', 'archived_legacy') AND published_at IS NULL "
            "AND published_by_user_id IS NULL AND change_reason IS NULL)",
            name=op.f(f"ck_{TABLE}_publication"),
        ),
    )
    for status in ("draft", "published"):
        op.create_index(
            f"uq_tax_planner_rule_{status}",
            TABLE,
            ["country_code", "assessment_year"],
            unique=True,
            postgresql_where=sa.text(f"status = '{status}'"),
        )
    op.create_index(
        "uq_tax_planner_rule_archive_hash",
        TABLE,
        ["country_code", "content_hash"],
        unique=True,
        postgresql_where=sa.text("status = 'archived_legacy'"),
    )
    op.execute("""
        CREATE FUNCTION guard_tax_planner_rule_history() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF OLD.status = 'draft' THEN
            IF TG_OP = 'DELETE' THEN
              RETURN OLD;
            END IF;
            IF NEW.status = 'draft' THEN
              RETURN NEW;
            END IF;
            IF NEW.status = 'published'
                AND (to_jsonb(NEW) - ARRAY[
                  'status', 'published_at', 'published_by_user_id', 'change_reason', 'updated_at'
                ]) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY[
                  'status', 'published_at', 'published_by_user_id', 'change_reason', 'updated_at'
                ]) THEN
              RETURN NEW;
            END IF;
          ELSIF TG_OP = 'UPDATE' AND OLD.status = 'published' AND NEW.status = 'superseded'
              AND (to_jsonb(NEW) - ARRAY['status', 'updated_at'])
                IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'updated_at']) THEN
            RETURN NEW;
          END IF;
          RAISE EXCEPTION 'Tax planner rule history is immutable' USING ERRCODE = '23514';
        END $$;
        """)
    op.execute("""
        CREATE TRIGGER tax_planner_rule_history_guard BEFORE UPDATE OR DELETE
        ON tax_planner_rule_revisions FOR EACH ROW EXECUTE FUNCTION guard_tax_planner_rule_history()
        """)


def downgrade() -> None:
    raise RuntimeError("Tax planner revision history requires a forward migration")
