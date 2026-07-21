"""Add published market-data generation manifests.

Revision ID: t7f8g9h0i1j2
Revises: s6e7f8g9h0i1
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "t7f8g9h0i1j2"
down_revision = "s6e7f8g9h0i1"
branch_labels = None
depends_on = None

exchange_code = postgresql.ENUM("DSE", "CSE", name="exchangecode", create_type=False)
market_data_state = postgresql.ENUM(
    "LIVE",
    "FINALIZATION_PENDING",
    "FINALIZED",
    "STALE",
    name="marketdatastate",
)


def upgrade() -> None:
    market_data_state.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "market_data_generations",
        sa.Column("exchange", exchange_code, nullable=False),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("sync_id", sa.String(length=64), nullable=False),
        sa.Column("state", market_data_state, nullable=False),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("source_last_synced_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("fetched_count", sa.Integer(), nullable=False),
        sa.Column("accepted_count", sa.Integer(), nullable=False),
        sa.Column("suspicious_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("exchange", "sync_id", name="uq_market_data_generations_exchange_sync"),
    )
    op.create_index(
        "ix_market_data_generations_exchange_published",
        "market_data_generations",
        ["exchange", "published_at"],
    )
    op.create_index(
        "ix_market_data_generations_exchange_state",
        "market_data_generations",
        ["exchange", "state", "trade_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_market_data_generations_exchange_state", table_name="market_data_generations")
    op.drop_index("ix_market_data_generations_exchange_published", table_name="market_data_generations")
    op.drop_table("market_data_generations")
    market_data_state.drop(op.get_bind(), checkfirst=True)
