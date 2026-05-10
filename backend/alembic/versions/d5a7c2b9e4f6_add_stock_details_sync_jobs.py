"""add stock details sync jobs

Revision ID: d5a7c2b9e4f6
Revises: c4d8f1a2b3c4
Create Date: 2026-05-03 23:40:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "d5a7c2b9e4f6"
down_revision = "c4d8f1a2b3c4"
branch_labels = None
depends_on = None

sync_job_status = postgresql.ENUM(
    "PENDING",
    "RUNNING",
    "SUCCEEDED",
    "PARTIAL",
    "FAILED",
    "SKIPPED",
    name="stockdetailssyncjobstatus",
    create_type=False,
)
sync_trigger_type = postgresql.ENUM(
    "MANUAL",
    "EVENT",
    "SCHEDULED",
    name="stockdetailssynctriggertype",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    sync_job_status.create(bind, checkfirst=True)
    sync_trigger_type.create(bind, checkfirst=True)

    op.add_column(
        "stocks",
        sa.Column(
            "should_fetch_details",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.alter_column("stocks", "should_fetch_details", server_default=None)
    op.create_index(
        "ix_stocks_details_fetch",
        "stocks",
        ["exchange", "is_active", "should_fetch_details"],
        unique=False,
    )

    op.create_table(
        "stock_details_sync_jobs",
        sa.Column("stock_id", sa.UUID(), nullable=False),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column("status", sync_job_status, nullable=False),
        sa.Column("trigger_type", sync_trigger_type, nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["stock_id"],
            ["stocks.id"],
            name=op.f("fk_stock_details_sync_jobs_stock_id_stocks"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_stock_details_sync_jobs")),
    )
    op.create_index(
        "ix_stock_details_sync_jobs_status_started",
        "stock_details_sync_jobs",
        ["status", "started_at"],
        unique=False,
    )
    op.create_index(
        "ix_stock_details_sync_jobs_stock_completed",
        "stock_details_sync_jobs",
        ["stock_id", "completed_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_stock_details_sync_jobs_stock_completed", table_name="stock_details_sync_jobs")
    op.drop_index("ix_stock_details_sync_jobs_status_started", table_name="stock_details_sync_jobs")
    op.drop_table("stock_details_sync_jobs")

    op.drop_index("ix_stocks_details_fetch", table_name="stocks")
    op.drop_column("stocks", "should_fetch_details")

    bind = op.get_bind()
    sync_trigger_type.drop(bind, checkfirst=True)
    sync_job_status.drop(bind, checkfirst=True)
