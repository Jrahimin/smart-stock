"""add user watchlist table

Revision ID: b8e1f4a2c6d0
Revises: a3c7e9f1b2d4
Create Date: 2026-06-04 16:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b8e1f4a2c6d0"
down_revision = "a3c7e9f1b2d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_watchlist",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("stock_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("stock_symbol", sa.String(length=32), nullable=False),
        sa.Column("is_holding", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("buy_price", sa.Numeric(precision=20, scale=4), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["stock_id"], ["stocks.id"], name="fk_user_watchlist_stock_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_user_watchlist_user_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_user_watchlist"),
        sa.UniqueConstraint("user_id", "stock_id", name="uq_user_watchlist_user_stock"),
        sa.CheckConstraint("buy_price IS NULL OR buy_price >= 0", name="user_watchlist_buy_price_non_negative"),
    )
    op.create_index("ix_user_watchlist_user_created", "user_watchlist", ["user_id", "created_at"], unique=False)
    op.create_index("ix_user_watchlist_user_holding", "user_watchlist", ["user_id", "is_holding"], unique=False)
    op.create_index("ix_user_watchlist_stock_id", "user_watchlist", ["stock_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_user_watchlist_stock_id", table_name="user_watchlist")
    op.drop_index("ix_user_watchlist_user_holding", table_name="user_watchlist")
    op.drop_index("ix_user_watchlist_user_created", table_name="user_watchlist")
    op.drop_table("user_watchlist")
