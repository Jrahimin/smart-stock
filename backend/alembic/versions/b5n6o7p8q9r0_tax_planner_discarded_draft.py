"""Retain an immutable audit snapshot when discarding a tax planner draft."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "b5n6o7p8q9r0"
down_revision = "a4m5n6o7p8q9"
branch_labels = None
depends_on = None

TABLE = "tax_planner_rule_revisions"


def upgrade() -> None:
    op.add_column(TABLE, sa.Column("discarded_at", sa.DateTime(timezone=True)))
    op.add_column(TABLE, sa.Column("discarded_by_user_id", postgresql.UUID(as_uuid=True)))
    op.add_column(TABLE, sa.Column("discard_reason", sa.String(500)))
    for suffix in ("status", "publication"):
        op.drop_constraint(op.f(f"ck_{TABLE}_{suffix}"), TABLE, type_="check")
    op.create_check_constraint(
        op.f(f"ck_{TABLE}_status"),
        TABLE,
        "status IN ('draft', 'published', 'superseded', 'discarded', 'archived_legacy')",
    )
    op.create_check_constraint(
        op.f(f"ck_{TABLE}_publication"),
        TABLE,
        "(status IN ('published', 'superseded') AND published_at IS NOT NULL "
        "AND published_by_user_id IS NOT NULL AND change_reason IS NOT NULL) OR "
        "(status IN ('draft', 'discarded', 'archived_legacy') AND published_at IS NULL "
        "AND published_by_user_id IS NULL AND change_reason IS NULL)",
    )
    op.create_check_constraint(
        op.f(f"ck_{TABLE}_discard_audit"),
        TABLE,
        "(status = 'discarded' AND discarded_at IS NOT NULL "
        "AND discarded_by_user_id IS NOT NULL AND discard_reason IS NOT NULL "
        "AND btrim(discard_reason) <> '') OR "
        "(status <> 'discarded' AND discarded_at IS NULL "
        "AND discarded_by_user_id IS NULL AND discard_reason IS NULL)",
    )
    op.execute("""
        CREATE OR REPLACE FUNCTION guard_tax_planner_rule_history()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF TG_OP = 'UPDATE' THEN
            IF OLD.status = 'draft' THEN
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
              IF NEW.status = 'discarded'
                  AND (to_jsonb(NEW) - ARRAY[
                    'status', 'discarded_at', 'discarded_by_user_id', 'discard_reason', 'updated_at'
                  ]) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY[
                    'status', 'discarded_at', 'discarded_by_user_id', 'discard_reason', 'updated_at'
                  ]) THEN
                RETURN NEW;
              END IF;
            ELSIF OLD.status = 'published' AND NEW.status = 'superseded'
                AND (to_jsonb(NEW) - ARRAY['status', 'updated_at'])
                  IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'updated_at']) THEN
              RETURN NEW;
            END IF;
          END IF;
          RAISE EXCEPTION 'Tax planner rule history is immutable' USING ERRCODE = '23514';
        END $$;
        """)


def downgrade() -> None:
    raise RuntimeError("Tax planner revision history requires a forward migration")
