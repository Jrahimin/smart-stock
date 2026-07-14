"""Add daily-price turnover provenance.

Revision ID: k8d9e0f1a2b3
Revises: j7c8d9e0f1a2
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "k8d9e0f1a2b3"
down_revision = "j7c8d9e0f1a2"
branch_labels = None
depends_on = None


turnover_provenance = postgresql.ENUM(
    "REPORTED",
    "ESTIMATED",
    "MIXED",
    "UNKNOWN",
    name="turnoverprovenance",
)


def upgrade() -> None:
    turnover_provenance.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "daily_prices",
        sa.Column(
            "turnover_provenance",
            turnover_provenance,
            nullable=False,
            server_default="UNKNOWN",
        ),
    )
    op.execute(
        "UPDATE daily_prices SET turnover_provenance = 'ESTIMATED' "
        "WHERE upper(source) = 'AMARSTOCK_API'"
    )
    op.execute(
        "UPDATE daily_prices SET turnover_provenance = 'REPORTED' "
        "WHERE turnover IS NOT NULL AND upper(source) IN "
        "('AMARSTOCK_LATEST_PRICE_API', 'AMARSTOCK_HTML', 'DSE')"
    )
    op.alter_column("daily_prices", "turnover_provenance", server_default=None)


def downgrade() -> None:
    op.drop_column("daily_prices", "turnover_provenance")
    turnover_provenance.drop(op.get_bind(), checkfirst=True)
