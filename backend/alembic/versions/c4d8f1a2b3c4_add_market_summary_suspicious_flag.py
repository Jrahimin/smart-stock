"""add market summary suspicious flag

Revision ID: c4d8f1a2b3c4
Revises: b7f3a9d2c4e1
Create Date: 2026-05-03 14:46:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "c4d8f1a2b3c4"
down_revision = "b7f3a9d2c4e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "daily_market_summaries",
        sa.Column(
            "has_suspicious_prices",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.alter_column("daily_market_summaries", "has_suspicious_prices", server_default=None)


def downgrade() -> None:
    op.drop_column("daily_market_summaries", "has_suspicious_prices")
