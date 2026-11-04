"""Append-only finalized decision input/result capture; no historical backfill."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "z3l4m5n6o7p8"
down_revision = "y2k3l4m5n6o7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "decision_generation_captures",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "exchange",
            postgresql.ENUM("DSE", "CSE", name="exchangecode", create_type=False),
            nullable=False,
        ),
        sa.Column("generation_id", sa.String(160), nullable=False),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("input_payload", postgresql.JSONB(), nullable=False),
        sa.Column("result_payload", postgresql.JSONB(), nullable=False),
        sa.Column("invalidated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("exchange", "generation_id", name="uq_decision_generation_capture"),
    )
    op.create_index(
        "ix_decision_generation_capture_session",
        "decision_generation_captures",
        ["exchange", "session_date"],
    )

    op.create_table(
        "trading_source_observations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("source_table", sa.String(80), nullable=False),
        sa.Column("source_row_id", sa.String(80), nullable=False),
        sa.Column(
            "observed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("operation", sa.String(16), nullable=False),
        sa.Column("session_date", sa.Date()),
        sa.Column("finality", sa.String(24), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("previous_payload", postgresql.JSONB()),
    )
    op.create_index(
        "ix_trading_source_observation_row",
        "trading_source_observations",
        ["source_table", "source_row_id", "observed_at"],
    )
    op.execute("""
        CREATE FUNCTION capture_trading_source_revision() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE body jsonb; prior jsonb; session_day date; state text;
        BEGIN
          body := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
          prior := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
          session_day := COALESCE(
            body->>'trade_date', body->>'effective_date', body->>'ex_dividend_date'
          )::date;
          state := 'OBSERVED';
          IF TG_TABLE_NAME = 'daily_prices' THEN
            state := CASE WHEN EXISTS (
              SELECT 1 FROM daily_market_summaries m JOIN stocks s ON s.exchange = m.exchange
              WHERE s.id::text = body->>'stock_id' AND m.trade_date = session_day
                AND m.index_name = 'DSEX' AND m.is_finalized
            ) THEN 'FINALIZED' ELSE 'PROVISIONAL' END;
          ELSIF TG_TABLE_NAME = 'daily_market_summaries' THEN
            state := CASE WHEN (body->>'is_finalized')::boolean
              THEN 'FINALIZED' ELSE 'PROVISIONAL' END;
          END IF;
          INSERT INTO trading_source_observations(
            source_table, source_row_id, observed_at, operation,
            session_date, finality, payload, previous_payload
          ) VALUES (
            TG_TABLE_NAME, body->>'id', clock_timestamp(), TG_OP, session_day, state, body, prior
          );
          RETURN NULL;
        END $$;
    """)
    op.execute("""
        CREATE FUNCTION guard_trading_capture_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF TG_OP = 'DELETE' OR TG_TABLE_NAME = 'trading_source_observations' THEN
            RAISE EXCEPTION 'Trading capture is append-only';
          END IF;
          IF (to_jsonb(NEW) - 'invalidated_at')
              IS DISTINCT FROM (to_jsonb(OLD) - 'invalidated_at') THEN
            RAISE EXCEPTION 'Captured decision inputs and results are immutable';
          END IF;
          IF OLD.invalidated_at IS NOT NULL
              AND NEW.invalidated_at IS DISTINCT FROM OLD.invalidated_at THEN
            RAISE EXCEPTION 'An invalidated capture cannot be reactivated';
          END IF;
          RETURN NEW;
        END $$;
    """)
    for table in (
        "daily_prices",
        "daily_market_summaries",
        "corporate_actions",
        "dividend_events",
        "stocks",
    ):
        op.execute(
            f"CREATE TRIGGER capture_trading_revision AFTER INSERT OR UPDATE OR DELETE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION capture_trading_source_revision()"
        )
    for table in ("decision_generation_captures", "trading_source_observations"):
        op.execute(
            f"CREATE TRIGGER immutable_trading_capture BEFORE UPDATE OR DELETE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION guard_trading_capture_immutable()"
        )


def downgrade() -> None:
    for table in (
        "daily_prices",
        "daily_market_summaries",
        "corporate_actions",
        "dividend_events",
        "stocks",
    ):
        op.execute(f"DROP TRIGGER capture_trading_revision ON {table}")
    op.drop_table("trading_source_observations")
    op.drop_table("decision_generation_captures")
    op.execute("DROP FUNCTION capture_trading_source_revision()")
    op.execute("DROP FUNCTION guard_trading_capture_immutable()")
