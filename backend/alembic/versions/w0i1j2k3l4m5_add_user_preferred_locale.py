"""Add preferred locale for localized portfolio emails.

Revision ID: w0i1j2k3l4m5
Revises: v9h0i1j2k3l4
"""

import sqlalchemy as sa
from alembic import op


revision = "w0i1j2k3l4m5"
down_revision = "v9h0i1j2k3l4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "preferred_locale",
            sa.String(length=8),
            nullable=False,
            server_default="bn",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "preferred_locale")
