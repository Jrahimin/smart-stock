"""Add portfolio daily summary email preference on users.

Revision ID: v9h0i1j2k3l4
Revises: u8g9h0i1j2k3
"""

import sqlalchemy as sa
from alembic import op


revision = "v9h0i1j2k3l4"
down_revision = "u8g9h0i1j2k3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "portfolio_daily_summary_email_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "portfolio_daily_summary_email_enabled")
