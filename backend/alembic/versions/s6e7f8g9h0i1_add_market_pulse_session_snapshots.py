"""Add persisted finalized-session Market Pulse aggregates.

Revision ID: s6e7f8g9h0i1
Revises: r5d6e7f8g9h0
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "s6e7f8g9h0i1"
down_revision = "r5d6e7f8g9h0"
branch_labels = None
depends_on = None

exchange_code = postgresql.ENUM("DSE", "CSE", name="exchangecode", create_type=False)


def upgrade() -> None:
    op.create_table(
        "market_pulse_session_snapshots",
        sa.Column("exchange", exchange_code, nullable=False),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column(
            "captured_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("pulse_score_version", sa.String(length=80), nullable=False),
        sa.Column("strategy_version", sa.String(length=80), nullable=False),
        sa.Column("threshold_version", sa.String(length=80), nullable=False),
        sa.Column("input_schema_version", sa.String(length=80), nullable=False),
        sa.Column("decision_taxonomy_version", sa.String(length=80), nullable=False),
        sa.Column("opportunity_score", sa.Integer(), nullable=False),
        sa.Column("universe_candidate_count", sa.Integer(), nullable=False),
        sa.Column("eligible_candidate_count", sa.Integer(), nullable=False),
        sa.Column("excluded_candidate_count", sa.Integer(), nullable=False),
        sa.Column("eligible_population_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("source_last_synced_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("universe_payload_revision", sa.String(length=64), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.CheckConstraint("opportunity_score >= 0 AND opportunity_score <= 100", name="score_range"),
        sa.CheckConstraint("universe_candidate_count >= 0", name="universe_count_non_negative"),
        sa.CheckConstraint("eligible_candidate_count >= 0", name="eligible_count_non_negative"),
        sa.CheckConstraint("excluded_candidate_count >= 0", name="excluded_count_non_negative"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "exchange",
            "session_date",
            "pulse_score_version",
            "strategy_version",
            "threshold_version",
            "input_schema_version",
            "decision_taxonomy_version",
            name="uq_market_pulse_session_snapshot_identity",
        ),
    )
    op.create_index(
        "ix_market_pulse_session_snapshot_history",
        "market_pulse_session_snapshots",
        [
            "exchange",
            "pulse_score_version",
            "strategy_version",
            "threshold_version",
            "input_schema_version",
            "decision_taxonomy_version",
            "session_date",
        ],
    )
    op.create_index(
        "ix_market_pulse_session_snapshot_session",
        "market_pulse_session_snapshots",
        ["exchange", "session_date"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_market_pulse_session_snapshot_session",
        table_name="market_pulse_session_snapshots",
    )
    op.drop_index(
        "ix_market_pulse_session_snapshot_history",
        table_name="market_pulse_session_snapshots",
    )
    op.drop_table("market_pulse_session_snapshots")
