"""Add explicit market-session finality.

Revision ID: n1a2b3c4d5e6
Revises: m0f1a2b3c4d5
"""

import sqlalchemy as sa

from alembic import op

revision = "n1a2b3c4d5e6"
down_revision = "m0f1a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "daily_market_summaries",
        sa.Column(
            "is_finalized",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.execute(
        sa.text(
            "UPDATE daily_market_summaries "
            "SET is_finalized = true "
            "WHERE trade_date < CURRENT_DATE"
        )
    )


def downgrade() -> None:
    op.drop_column("daily_market_summaries", "is_finalized")
