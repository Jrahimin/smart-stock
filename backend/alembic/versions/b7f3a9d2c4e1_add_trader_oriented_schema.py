"""add trader oriented schema

Revision ID: b7f3a9d2c4e1
Revises: 3418c9ad7c9f
Create Date: 2026-05-01 01:31:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b7f3a9d2c4e1"
down_revision = "3418c9ad7c9f"
branch_labels = None
depends_on = None

report_period_type = postgresql.ENUM(
    "QUARTERLY",
    "HALF_YEARLY",
    "ANNUAL",
    name="reportperiodtype",
    create_type=False,
)
report_status = postgresql.ENUM(
    "UNAUDITED",
    "AUDITED",
    "RESTATED",
    name="reportstatus",
    create_type=False,
)
metric_value_type = postgresql.ENUM(
    "AMOUNT",
    "PERCENT",
    "RATIO",
    "PER_SHARE",
    "COUNT",
    name="metricvaluetype",
    create_type=False,
)
dividend_type = postgresql.ENUM(
    "CASH",
    "STOCK",
    "MIXED",
    name="dividendtype",
    create_type=False,
)
dividend_status = postgresql.ENUM(
    "DECLARED",
    "APPROVED",
    "PAID",
    "REVISED",
    name="dividendstatus",
    create_type=False,
)
corporate_action_type = postgresql.ENUM(
    "DIVIDEND",
    "CAPITAL_CHANGE",
    "TRADING_STATUS",
    "MEETING",
    "RESTRUCTURING",
    "OTHER",
    name="corporateactiontype",
    create_type=False,
)
corporate_action_subtype = postgresql.ENUM(
    "BONUS",
    "RIGHTS",
    "SPLIT",
    "MERGER",
    "SPOT_TRADE",
    "TRADING_SUSPENSION",
    "TRADING_RESUME",
    "AGM",
    "EGM",
    "OTHER",
    name="corporateactionsubtype",
    create_type=False,
)
market_event_type = postgresql.ENUM(
    "NEWS",
    "DISCLOSURE",
    "BOARD_MEETING",
    "EARNINGS_RELEASE",
    "REGULATORY",
    "OTHER",
    name="marketeventtype",
    create_type=False,
)
exchange_code = postgresql.ENUM("DSE", "CSE", name="exchangecode", create_type=False)
data_quality_flag = postgresql.ENUM(
    "OK",
    "PARTIAL",
    "SUSPICIOUS",
    name="dataqualityflag",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    report_period_type.create(bind, checkfirst=True)
    report_status.create(bind, checkfirst=True)
    metric_value_type.create(bind, checkfirst=True)
    dividend_type.create(bind, checkfirst=True)
    dividend_status.create(bind, checkfirst=True)
    corporate_action_type.create(bind, checkfirst=True)
    corporate_action_subtype.create(bind, checkfirst=True)
    market_event_type.create(bind, checkfirst=True)

    op.create_table(
        "financial_metric_definitions",
        sa.Column("metric_code", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=160), nullable=False),
        sa.Column("value_type", metric_value_type, nullable=False),
        sa.Column("statement_section", sa.String(length=80), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_financial_metric_definitions")),
        sa.UniqueConstraint("metric_code", name="uq_financial_metric_definitions_metric_code"),
    )
    op.create_index(
        "ix_financial_metric_definitions_active",
        "financial_metric_definitions",
        ["is_active"],
        unique=False,
    )

    op.create_table(
        "financial_reports",
        sa.Column("stock_id", sa.UUID(), nullable=False),
        sa.Column("fiscal_year", sa.Integer(), nullable=False),
        sa.Column("period_type", report_period_type, nullable=False),
        sa.Column("period_start_date", sa.Date(), nullable=False),
        sa.Column("period_end_date", sa.Date(), nullable=False),
        sa.Column("published_date", sa.Date(), nullable=True),
        sa.Column("report_status", report_status, nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("data_quality_flag", data_quality_flag, nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("fiscal_year >= 1900", name=op.f("ck_financial_reports_financial_report_fiscal_year_valid")),
        sa.CheckConstraint(
            "period_end_date >= period_start_date",
            name=op.f("ck_financial_reports_financial_report_period_dates_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["stock_id"],
            ["stocks.id"],
            name=op.f("fk_financial_reports_stock_id_stocks"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_financial_reports")),
        sa.UniqueConstraint(
            "stock_id",
            "fiscal_year",
            "period_type",
            "period_end_date",
            "report_status",
            name="uq_financial_reports_stock_period_status",
        ),
    )
    op.create_index("ix_financial_reports_published_date", "financial_reports", ["published_date"], unique=False)
    op.create_index("ix_financial_reports_report_status", "financial_reports", ["report_status"], unique=False)
    op.create_index(
        "ix_financial_reports_stock_period",
        "financial_reports",
        ["stock_id", "fiscal_year", "period_type", "period_end_date"],
        unique=False,
    )

    op.create_table(
        "corporate_actions",
        sa.Column("stock_id", sa.UUID(), nullable=False),
        sa.Column("action_type", corporate_action_type, nullable=False),
        sa.Column("action_subtype", corporate_action_subtype, nullable=False),
        sa.Column("announcement_date", sa.Date(), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("record_date", sa.Date(), nullable=True),
        sa.Column("ratio_numerator", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("ratio_denominator", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("cash_amount_per_share", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "cash_amount_per_share IS NULL OR cash_amount_per_share >= 0",
            name=op.f("ck_corporate_actions_corporate_action_cash_amount_per_share_non_negative"),
        ),
        sa.CheckConstraint(
            "ratio_denominator IS NULL OR ratio_denominator > 0",
            name=op.f("ck_corporate_actions_corporate_action_ratio_denominator_positive"),
        ),
        sa.CheckConstraint(
            "ratio_numerator IS NULL OR ratio_numerator >= 0",
            name=op.f("ck_corporate_actions_corporate_action_ratio_numerator_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["stock_id"],
            ["stocks.id"],
            name=op.f("fk_corporate_actions_stock_id_stocks"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_corporate_actions")),
        sa.UniqueConstraint(
            "stock_id",
            "action_type",
            "action_subtype",
            "announcement_date",
            "effective_date",
            name="uq_corporate_actions_stock_type_announcement_effective",
        ),
    )
    op.create_index(
        "ix_corporate_actions_action_subtype_date",
        "corporate_actions",
        ["action_subtype", "announcement_date"],
        unique=False,
    )
    op.create_index(
        "ix_corporate_actions_action_type_date",
        "corporate_actions",
        ["action_type", "announcement_date"],
        unique=False,
    )
    op.create_index(
        "ix_corporate_actions_stock_effective_date",
        "corporate_actions",
        ["stock_id", "effective_date"],
        unique=False,
    )

    op.create_table(
        "dividend_events",
        sa.Column("stock_id", sa.UUID(), nullable=False),
        sa.Column("fiscal_year", sa.Integer(), nullable=False),
        sa.Column("dividend_type", dividend_type, nullable=False),
        sa.Column("declaration_date", sa.Date(), nullable=False),
        sa.Column("record_date", sa.Date(), nullable=True),
        sa.Column("ex_dividend_date", sa.Date(), nullable=True),
        sa.Column("payment_date", sa.Date(), nullable=True),
        sa.Column("cash_dividend_percent", sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column("stock_dividend_percent", sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column("cash_amount_per_share", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("status", dividend_status, nullable=False),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "cash_amount_per_share IS NULL OR cash_amount_per_share >= 0",
            name=op.f("ck_dividend_events_cash_amount_per_share_non_negative"),
        ),
        sa.CheckConstraint(
            "cash_dividend_percent IS NULL OR cash_dividend_percent >= 0",
            name=op.f("ck_dividend_events_cash_dividend_percent_non_negative"),
        ),
        sa.CheckConstraint("fiscal_year >= 1900", name=op.f("ck_dividend_events_dividend_event_fiscal_year_valid")),
        sa.CheckConstraint(
            "stock_dividend_percent IS NULL OR stock_dividend_percent >= 0",
            name=op.f("ck_dividend_events_stock_dividend_percent_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["stock_id"],
            ["stocks.id"],
            name=op.f("fk_dividend_events_stock_id_stocks"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dividend_events")),
        sa.UniqueConstraint(
            "stock_id",
            "fiscal_year",
            "declaration_date",
            name="uq_dividend_events_stock_year_declaration",
        ),
    )
    op.create_index("ix_dividend_events_dividend_type", "dividend_events", ["dividend_type"], unique=False)
    op.create_index("ix_dividend_events_record_date", "dividend_events", ["record_date"], unique=False)
    op.create_index("ix_dividend_events_stock_year", "dividend_events", ["stock_id", "fiscal_year"], unique=False)

    op.create_table(
        "financial_metric_values",
        sa.Column("financial_report_id", sa.UUID(), nullable=False),
        sa.Column("metric_definition_id", sa.UUID(), nullable=False),
        sa.Column("as_of_date", sa.Date(), nullable=False),
        sa.Column("value", sa.Numeric(precision=24, scale=6), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=True),
        sa.Column("source_value", sa.String(length=120), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["financial_report_id"],
            ["financial_reports.id"],
            name=op.f("fk_financial_metric_values_financial_report_id_financial_reports"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["metric_definition_id"],
            ["financial_metric_definitions.id"],
            name=op.f("fk_financial_metric_values_metric_definition_id_financial_metric_definitions"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_financial_metric_values")),
        sa.UniqueConstraint(
            "financial_report_id",
            "metric_definition_id",
            "as_of_date",
            name="uq_financial_metric_values_report_metric_as_of",
        ),
    )
    op.create_index("ix_financial_metric_values_as_of_date", "financial_metric_values", ["as_of_date"], unique=False)
    op.create_index(
        "ix_financial_metric_values_metric_as_of",
        "financial_metric_values",
        ["metric_definition_id", "as_of_date"],
        unique=False,
    )
    op.create_index(
        "ix_financial_metric_values_report",
        "financial_metric_values",
        ["financial_report_id"],
        unique=False,
    )

    op.create_table(
        "market_events",
        sa.Column("stock_id", sa.UUID(), nullable=True),
        sa.Column("exchange", exchange_code, nullable=True),
        sa.Column("event_type", market_event_type, nullable=False),
        sa.Column("event_date", sa.Date(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column("sentiment_score", sa.Numeric(precision=10, scale=6), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["stock_id"],
            ["stocks.id"],
            name=op.f("fk_market_events_stock_id_stocks"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_market_events")),
    )
    op.create_index("ix_market_events_exchange_date", "market_events", ["exchange", "event_date"], unique=False)
    op.create_index("ix_market_events_source_url", "market_events", ["source_url"], unique=False)
    op.create_index("ix_market_events_stock_date", "market_events", ["stock_id", "event_date"], unique=False)
    op.create_index("ix_market_events_type_date", "market_events", ["event_type", "event_date"], unique=False)

    op.create_table(
        "shareholding_snapshots",
        sa.Column("stock_id", sa.UUID(), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("sponsor_director_percent", sa.Numeric(precision=7, scale=4), nullable=True),
        sa.Column("government_percent", sa.Numeric(precision=7, scale=4), nullable=True),
        sa.Column("institution_percent", sa.Numeric(precision=7, scale=4), nullable=True),
        sa.Column("foreign_percent", sa.Numeric(precision=7, scale=4), nullable=True),
        sa.Column("public_percent", sa.Numeric(precision=7, scale=4), nullable=True),
        sa.Column("total_shares", sa.BigInteger(), nullable=True),
        sa.Column("circulating_shares", sa.BigInteger(), nullable=True),
        sa.Column("free_float_percent", sa.Numeric(precision=7, scale=4), nullable=True),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("data_quality_flag", data_quality_flag, nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "circulating_shares IS NULL OR circulating_shares >= 0",
            name=op.f("ck_shareholding_snapshots_circulating_shares_non_negative"),
        ),
        sa.CheckConstraint(
            "foreign_percent IS NULL OR (foreign_percent >= 0 AND foreign_percent <= 100)",
            name=op.f("ck_shareholding_snapshots_foreign_percent_between_zero_and_one_hundred"),
        ),
        sa.CheckConstraint(
            "free_float_percent IS NULL OR (free_float_percent >= 0 AND free_float_percent <= 100)",
            name=op.f("ck_shareholding_snapshots_free_float_percent_between_zero_and_one_hundred"),
        ),
        sa.CheckConstraint(
            "government_percent IS NULL OR (government_percent >= 0 AND government_percent <= 100)",
            name=op.f("ck_shareholding_snapshots_government_percent_between_zero_and_one_hundred"),
        ),
        sa.CheckConstraint(
            "institution_percent IS NULL OR (institution_percent >= 0 AND institution_percent <= 100)",
            name=op.f("ck_shareholding_snapshots_institution_percent_between_zero_and_one_hundred"),
        ),
        sa.CheckConstraint(
            "public_percent IS NULL OR (public_percent >= 0 AND public_percent <= 100)",
            name=op.f("ck_shareholding_snapshots_public_percent_between_zero_and_one_hundred"),
        ),
        sa.CheckConstraint(
            "sponsor_director_percent IS NULL OR "
            "(sponsor_director_percent >= 0 AND sponsor_director_percent <= 100)",
            name=op.f("ck_shareholding_snapshots_sponsor_director_percent_between_zero_and_one_hundred"),
        ),
        sa.CheckConstraint(
            "total_shares IS NULL OR total_shares >= 0",
            name=op.f("ck_shareholding_snapshots_total_shares_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["stock_id"],
            ["stocks.id"],
            name=op.f("fk_shareholding_snapshots_stock_id_stocks"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_shareholding_snapshots")),
        sa.UniqueConstraint(
            "stock_id",
            "snapshot_date",
            "source",
            name="uq_shareholding_snapshots_stock_date_source",
        ),
    )
    op.create_index(
        "ix_shareholding_snapshots_snapshot_date",
        "shareholding_snapshots",
        ["snapshot_date"],
        unique=False,
    )
    op.create_index(
        "ix_shareholding_snapshots_stock_date",
        "shareholding_snapshots",
        ["stock_id", "snapshot_date"],
        unique=False,
    )

    op.create_table(
        "valuation_snapshots",
        sa.Column("stock_id", sa.UUID(), nullable=False),
        sa.Column("valuation_date", sa.Date(), nullable=False),
        sa.Column("close_price", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("market_cap", sa.Numeric(precision=24, scale=4), nullable=True),
        sa.Column("pe_ratio", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("pb_ratio", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("dividend_yield", sa.Numeric(precision=10, scale=6), nullable=True),
        sa.Column("earnings_yield", sa.Numeric(precision=10, scale=6), nullable=True),
        sa.Column("price_to_sales", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("data_quality_flag", data_quality_flag, nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "close_price IS NULL OR close_price >= 0",
            name=op.f("ck_valuation_snapshots_valuation_close_price_non_negative"),
        ),
        sa.CheckConstraint(
            "dividend_yield IS NULL OR dividend_yield >= 0",
            name=op.f("ck_valuation_snapshots_valuation_dividend_yield_non_negative"),
        ),
        sa.CheckConstraint(
            "market_cap IS NULL OR market_cap >= 0",
            name=op.f("ck_valuation_snapshots_valuation_market_cap_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["stock_id"],
            ["stocks.id"],
            name=op.f("fk_valuation_snapshots_stock_id_stocks"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_valuation_snapshots")),
        sa.UniqueConstraint(
            "stock_id",
            "valuation_date",
            "source",
            name="uq_valuation_snapshots_stock_date_source",
        ),
    )
    op.create_index("ix_valuation_snapshots_stock_date", "valuation_snapshots", ["stock_id", "valuation_date"], unique=False)
    op.create_index("ix_valuation_snapshots_valuation_date", "valuation_snapshots", ["valuation_date"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_valuation_snapshots_valuation_date", table_name="valuation_snapshots")
    op.drop_index("ix_valuation_snapshots_stock_date", table_name="valuation_snapshots")
    op.drop_table("valuation_snapshots")
    op.drop_index("ix_shareholding_snapshots_stock_date", table_name="shareholding_snapshots")
    op.drop_index("ix_shareholding_snapshots_snapshot_date", table_name="shareholding_snapshots")
    op.drop_table("shareholding_snapshots")
    op.drop_index("ix_market_events_type_date", table_name="market_events")
    op.drop_index("ix_market_events_stock_date", table_name="market_events")
    op.drop_index("ix_market_events_source_url", table_name="market_events")
    op.drop_index("ix_market_events_exchange_date", table_name="market_events")
    op.drop_table("market_events")
    op.drop_index("ix_financial_metric_values_report", table_name="financial_metric_values")
    op.drop_index("ix_financial_metric_values_metric_as_of", table_name="financial_metric_values")
    op.drop_index("ix_financial_metric_values_as_of_date", table_name="financial_metric_values")
    op.drop_table("financial_metric_values")
    op.drop_index("ix_dividend_events_stock_year", table_name="dividend_events")
    op.drop_index("ix_dividend_events_record_date", table_name="dividend_events")
    op.drop_index("ix_dividend_events_dividend_type", table_name="dividend_events")
    op.drop_table("dividend_events")
    op.drop_index("ix_corporate_actions_stock_effective_date", table_name="corporate_actions")
    op.drop_index("ix_corporate_actions_action_type_date", table_name="corporate_actions")
    op.drop_index("ix_corporate_actions_action_subtype_date", table_name="corporate_actions")
    op.drop_table("corporate_actions")
    op.drop_index("ix_financial_reports_stock_period", table_name="financial_reports")
    op.drop_index("ix_financial_reports_report_status", table_name="financial_reports")
    op.drop_index("ix_financial_reports_published_date", table_name="financial_reports")
    op.drop_table("financial_reports")
    op.drop_index("ix_financial_metric_definitions_active", table_name="financial_metric_definitions")
    op.drop_table("financial_metric_definitions")

    bind = op.get_bind()
    market_event_type.drop(bind, checkfirst=True)
    corporate_action_subtype.drop(bind, checkfirst=True)
    corporate_action_type.drop(bind, checkfirst=True)
    dividend_status.drop(bind, checkfirst=True)
    dividend_type.drop(bind, checkfirst=True)
    metric_value_type.drop(bind, checkfirst=True)
    report_status.drop(bind, checkfirst=True)
    report_period_type.drop(bind, checkfirst=True)
