"""Separate verified source observation from batch retrieval; no timestamp backfill."""
from alembic import op
import sqlalchemy as sa

revision = "c7p8q9r0s1t2"
down_revision = "c6o7p8q9r0s1"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("daily_prices", sa.Column("source_observed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("daily_prices", sa.Column("batch_fetched_at", sa.DateTime(timezone=True), nullable=True))

def downgrade():
    op.drop_column("daily_prices", "batch_fetched_at")
    op.drop_column("daily_prices", "source_observed_at")
