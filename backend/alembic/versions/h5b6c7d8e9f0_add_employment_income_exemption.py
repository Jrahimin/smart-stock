"""Add maximum salary exemption to tax planner settings.

Revision ID: h5b6c7d8e9f0
Revises: g4a5b6c7d8e9
"""

from alembic import op
import sqlalchemy as sa


revision = "h5b6c7d8e9f0"
down_revision = "g4a5b6c7d8e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tax_planner_settings",
        sa.Column("max_salary_exemption", sa.Numeric(precision=20, scale=4), nullable=True),
    )
    op.execute(
        sa.text(
            "UPDATE tax_planner_settings SET max_salary_exemption = 500000 "
            "WHERE max_salary_exemption IS NULL"
        )
    )
    op.alter_column("tax_planner_settings", "max_salary_exemption", nullable=False)


def downgrade() -> None:
    op.drop_column("tax_planner_settings", "max_salary_exemption")
