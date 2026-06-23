"""Simplify tax rebate configuration to three-field legal model.

Revision ID: g4a5b6c7d8e9
Revises: f3a4b5c6d7e8
"""

from alembic import op
import sqlalchemy as sa


revision = "g4a5b6c7d8e9"
down_revision = "f3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tax_planner_settings",
        sa.Column("rebate_taxable_income_limit_pct", sa.Numeric(precision=8, scale=4), nullable=True),
    )
    op.add_column(
        "tax_planner_settings",
        sa.Column("rebate_investment_pct", sa.Numeric(precision=8, scale=4), nullable=True),
    )
    op.add_column(
        "tax_planner_settings",
        sa.Column("rebate_maximum_amount", sa.Numeric(precision=20, scale=4), nullable=True),
    )

    op.execute(
        """
        UPDATE tax_planner_settings
        SET
            rebate_taxable_income_limit_pct = 3,
            rebate_investment_pct = COALESCE(rebate_rate, 15),
            rebate_maximum_amount = COALESCE(rebate_max_rebate_amount, 1000000)
        """
    )

    op.drop_column("tax_planner_settings", "rebate_max_income_percentage")
    op.drop_column("tax_planner_settings", "rebate_max_amount")
    op.drop_column("tax_planner_settings", "rebate_rate")
    op.drop_column("tax_planner_settings", "rebate_max_rebate_amount")

    op.alter_column("tax_planner_settings", "rebate_taxable_income_limit_pct", nullable=False)
    op.alter_column("tax_planner_settings", "rebate_investment_pct", nullable=False)
    op.alter_column("tax_planner_settings", "rebate_maximum_amount", nullable=False)


def downgrade() -> None:
    op.add_column(
        "tax_planner_settings",
        sa.Column("rebate_max_income_percentage", sa.Numeric(precision=8, scale=4), nullable=True),
    )
    op.add_column(
        "tax_planner_settings",
        sa.Column("rebate_max_amount", sa.Numeric(precision=20, scale=4), nullable=True),
    )
    op.add_column(
        "tax_planner_settings",
        sa.Column("rebate_rate", sa.Numeric(precision=8, scale=4), nullable=True),
    )
    op.add_column(
        "tax_planner_settings",
        sa.Column("rebate_max_rebate_amount", sa.Numeric(precision=20, scale=4), nullable=True),
    )

    op.execute(
        """
        UPDATE tax_planner_settings
        SET
            rebate_max_income_percentage = 20,
            rebate_max_amount = 1000000,
            rebate_rate = COALESCE(rebate_investment_pct, 15),
            rebate_max_rebate_amount = rebate_maximum_amount
        """
    )

    op.drop_column("tax_planner_settings", "rebate_taxable_income_limit_pct")
    op.drop_column("tax_planner_settings", "rebate_investment_pct")
    op.drop_column("tax_planner_settings", "rebate_maximum_amount")

    op.alter_column("tax_planner_settings", "rebate_max_income_percentage", nullable=False)
    op.alter_column("tax_planner_settings", "rebate_max_amount", nullable=False)
    op.alter_column("tax_planner_settings", "rebate_rate", nullable=False)
