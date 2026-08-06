"""Add durable system job queue and scheduler heartbeat.

Revision ID: y2k3l4m5n6o7
Revises: x1j2k3l4m5n6
Create Date: 2026-08-06 17:00:00.000000
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "y2k3l4m5n6o7"
down_revision = "x1j2k3l4m5n6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TYPE systemjobexecutionstatus "
        "ADD VALUE IF NOT EXISTS 'SKIPPED' AFTER 'PARTIAL'"
    )
    op.add_column(
        "system_job_executions",
        sa.Column("dedupe_key", sa.String(length=255), nullable=True),
    )
    op.alter_column(
        "system_job_executions",
        "attempt_count",
        existing_type=sa.Integer(),
        server_default="0",
        existing_nullable=False,
    )
    op.create_index(
        "uq_system_job_executions_active_dedupe_key",
        "system_job_executions",
        ["dedupe_key"],
        unique=True,
        postgresql_where=sa.text(
            "dedupe_key IS NOT NULL AND status IN ('PENDING', 'RUNNING')"
        ),
    )

    op.create_table(
        "scheduler_heartbeats",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("component_name", sa.String(length=120), nullable=False),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "component_name",
            name="uq_scheduler_heartbeats_component_name",
        ),
    )
    op.create_index(
        "ix_scheduler_heartbeats_heartbeat_at",
        "scheduler_heartbeats",
        ["heartbeat_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_scheduler_heartbeats_heartbeat_at",
        table_name="scheduler_heartbeats",
    )
    op.drop_table("scheduler_heartbeats")
    op.drop_index(
        "uq_system_job_executions_active_dedupe_key",
        table_name="system_job_executions",
    )
    op.drop_column("system_job_executions", "dedupe_key")
    op.alter_column(
        "system_job_executions",
        "attempt_count",
        existing_type=sa.Integer(),
        server_default="1",
        existing_nullable=False,
    )

    op.execute(
        "UPDATE system_job_executions "
        "SET status = 'CANCELLED' "
        "WHERE status = 'SKIPPED'"
    )
    op.execute(
        "ALTER TYPE systemjobexecutionstatus "
        "RENAME TO systemjobexecutionstatus_with_skipped"
    )
    op.execute(
        "CREATE TYPE systemjobexecutionstatus AS ENUM "
        "('PENDING', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED')"
    )
    op.execute(
        "ALTER TABLE system_job_executions "
        "ALTER COLUMN status TYPE systemjobexecutionstatus "
        "USING status::text::systemjobexecutionstatus"
    )
    op.execute("DROP TYPE systemjobexecutionstatus_with_skipped")
