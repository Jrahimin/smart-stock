"""Add immutable canonical decision snapshots.

Revision ID: m0f1a2b3c4d5
Revises: l9e0f1a2b3c4
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "m0f1a2b3c4d5"
down_revision = "l9e0f1a2b3c4"
branch_labels = None
depends_on = None

exchange_code = postgresql.ENUM("DSE", "CSE", name="exchangecode", create_type=False)


def upgrade() -> None:
    op.create_table(
        "canonical_decision_snapshots",
        sa.Column("stock_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("exchange", exchange_code, nullable=False),
        sa.Column("as_of_date", sa.Date(), nullable=False),
        sa.Column("calculated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("strategy_version", sa.String(80), nullable=False),
        sa.Column("threshold_version", sa.String(80), nullable=False),
        sa.Column("input_schema_version", sa.String(80), nullable=False),
        sa.Column("action_taxonomy", sa.String(80), nullable=False),
        sa.Column("shared_decision_id", sa.String(64), nullable=False),
        sa.Column("input_hash", sa.String(64), nullable=False),
        sa.Column("data_revision", sa.String(64), nullable=False),
        sa.Column("event_revision", sa.String(64), nullable=False),
        sa.Column("replay_status", sa.String(80), nullable=False),
        sa.Column("replay_limitations", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("recommendation", sa.String(16), nullable=False),
        sa.Column("eligibility_status", sa.String(24), nullable=False),
        sa.Column("evidence_strength", sa.Integer(), nullable=False),
        sa.Column("opportunity_score", sa.Integer(), nullable=False),
        sa.Column("primary_reason_code", sa.String(120), nullable=False),
        sa.Column("result_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["stock_id"], ["stocks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "shared_decision_id",
            name="uq_canonical_decision_snapshots_shared_decision_id",
        ),
    )
    op.create_index(
        "ix_canonical_decision_snapshots_session",
        "canonical_decision_snapshots",
        ["exchange", "as_of_date", "strategy_version"],
    )
    op.create_index(
        "ix_canonical_decision_snapshots_input_hash",
        "canonical_decision_snapshots",
        ["input_hash"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_canonical_decision_snapshots_input_hash",
        table_name="canonical_decision_snapshots",
    )
    op.drop_index(
        "ix_canonical_decision_snapshots_session",
        table_name="canonical_decision_snapshots",
    )
    op.drop_table("canonical_decision_snapshots")
