"""add market event unique constraint

Revision ID: e1b2c3d4e5f6
Revises: d5a7c2b9e4f6
Create Date: 2026-05-04 15:20:00.000000
"""

from alembic import op


revision = "e1b2c3d4e5f6"
down_revision = "d5a7c2b9e4f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM market_events
        WHERE id IN (
            SELECT id
            FROM (
                SELECT
                    id,
                    row_number() OVER (
                        PARTITION BY stock_id, event_date, title, source
                        ORDER BY created_at ASC, id ASC
                    ) AS duplicate_rank
                FROM market_events
                WHERE stock_id IS NOT NULL
            ) ranked_events
            WHERE duplicate_rank > 1
        )
        """
    )
    op.create_unique_constraint(
        "uq_market_events_stock_date_title_source",
        "market_events",
        ["stock_id", "event_date", "title", "source"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_market_events_stock_date_title_source",
        "market_events",
        type_="unique",
    )
