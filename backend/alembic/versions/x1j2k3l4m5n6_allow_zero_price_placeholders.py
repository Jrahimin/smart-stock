"""Allow zero-price no-trade placeholders with incomplete high/low values.

Revision ID: x1j2k3l4m5n6
Revises: w0i1j2k3l4m5
"""

import sqlalchemy as sa

from alembic import op

revision = "x1j2k3l4m5n6"
down_revision = "w0i1j2k3l4m5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        op.f("ck_daily_prices_high_price_greater_than_low_price"),
        "daily_prices",
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_daily_prices_high_price_greater_than_low_price"),
        "daily_prices",
        sa.text("high_price = 0 OR low_price = 0 OR high_price >= low_price"),
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_daily_prices_high_price_greater_than_low_price"),
        "daily_prices",
        type_="check",
    )
    op.execute(
        sa.text(
            "UPDATE daily_prices "
            "SET low_price = 0, day_range = NULL, day_range_percent = NULL "
            "WHERE high_price = 0 AND low_price > 0"
        )
    )
    op.create_check_constraint(
        op.f("ck_daily_prices_high_price_greater_than_low_price"),
        "daily_prices",
        sa.text("high_price >= low_price"),
    )
