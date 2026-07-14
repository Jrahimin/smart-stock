"""Add canonical identity to persisted trading signals.

Revision ID: l9e0f1a2b3c4
Revises: k8d9e0f1a2b3
"""

import sqlalchemy as sa

from alembic import op

revision = "l9e0f1a2b3c4"
down_revision = "k8d9e0f1a2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trading_signals", sa.Column("strategy_version", sa.String(80), nullable=True))
    op.add_column("trading_signals", sa.Column("threshold_version", sa.String(80), nullable=True))
    op.add_column("trading_signals", sa.Column("action_taxonomy", sa.String(80), nullable=True))
    op.add_column(
        "trading_signals",
        sa.Column("canonical_recommendation", sa.String(16), nullable=True),
    )
    op.add_column("trading_signals", sa.Column("signal_as_of", sa.Date(), nullable=True))
    op.add_column(
        "trading_signals",
        sa.Column("calculated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "trading_signals",
        sa.Column("shared_decision_id", sa.String(64), nullable=True),
    )
    op.create_index(
        "ix_trading_signals_strategy_identity",
        "trading_signals",
        ["strategy_version", "signal_as_of"],
    )


def downgrade() -> None:
    op.drop_index("ix_trading_signals_strategy_identity", table_name="trading_signals")
    op.drop_column("trading_signals", "shared_decision_id")
    op.drop_column("trading_signals", "calculated_at")
    op.drop_column("trading_signals", "signal_as_of")
    op.drop_column("trading_signals", "canonical_recommendation")
    op.drop_column("trading_signals", "action_taxonomy")
    op.drop_column("trading_signals", "threshold_version")
    op.drop_column("trading_signals", "strategy_version")
