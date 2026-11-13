"""Seal paired shadow selections and append modeled outcome vintages."""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op
revision = "c6o7p8q9r0s1"
down_revision = "b5n6o7p8q9r0"
branch_labels = None
depends_on = None


def upgrade():
    exchange = postgresql.ENUM(name="exchangecode", create_type=False)
    op.create_table("trading_shadow_selections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source_capture_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("decision_generation_captures.id"), nullable=False),
        sa.Column("exchange", exchange, nullable=False), sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("strategy_version", sa.String(80), nullable=False), sa.Column("experiment_id", sa.String(64), nullable=False),
        sa.Column("selected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("next_open_at", sa.DateTime(timezone=True)), sa.Column("record_hash", sa.String(64), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False), sa.Column("invalidated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("exchange", "session_date", "strategy_version", "experiment_id", name="uq_shadow_selection_session_policy"))
    op.create_table("trading_shadow_outcomes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("selection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trading_shadow_selections.id"), nullable=False),
        sa.Column("through_date", sa.Date(), nullable=False), sa.Column("outcome_revision", sa.String(64), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False), sa.Column("invalidated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("selection_id", "outcome_revision", name="uq_shadow_outcome_revision"))
    for table in ("trading_shadow_selections", "trading_shadow_outcomes"):
        op.execute(f"CREATE TRIGGER immutable_trading_capture BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION guard_trading_capture_immutable()")


def downgrade():
    op.drop_table("trading_shadow_outcomes")
    op.drop_table("trading_shadow_selections")
