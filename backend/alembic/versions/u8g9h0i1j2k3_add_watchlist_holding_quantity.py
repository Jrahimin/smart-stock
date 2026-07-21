"""Add current holding quantity and positive cost-basis rules.

Revision ID: u8g9h0i1j2k3
Revises: t7f8g9h0i1j2
"""

import sqlalchemy as sa
from alembic import op


revision = "u8g9h0i1j2k3"
down_revision = "t7f8g9h0i1j2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_watchlist",
        sa.Column("quantity", sa.Numeric(precision=20, scale=4), nullable=True),
    )
    op.execute(sa.text("UPDATE user_watchlist SET buy_price = NULL WHERE buy_price = 0"))
    op.drop_constraint(
        "user_watchlist_buy_price_non_negative",
        "user_watchlist",
        type_="check",
    )
    op.create_check_constraint(
        "user_watchlist_buy_price_positive",
        "user_watchlist",
        "buy_price IS NULL OR buy_price > 0",
    )
    op.create_check_constraint(
        "user_watchlist_quantity_positive",
        "user_watchlist",
        "quantity IS NULL OR quantity > 0",
    )
    op.create_check_constraint(
        "user_watchlist_position_fields_require_holding",
        "user_watchlist",
        "is_holding OR (quantity IS NULL AND buy_price IS NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "user_watchlist_position_fields_require_holding",
        "user_watchlist",
        type_="check",
    )
    op.drop_constraint(
        "user_watchlist_quantity_positive",
        "user_watchlist",
        type_="check",
    )
    op.drop_constraint(
        "user_watchlist_buy_price_positive",
        "user_watchlist",
        type_="check",
    )
    op.create_check_constraint(
        "user_watchlist_buy_price_non_negative",
        "user_watchlist",
        "buy_price IS NULL OR buy_price >= 0",
    )
    op.drop_column("user_watchlist", "quantity")
