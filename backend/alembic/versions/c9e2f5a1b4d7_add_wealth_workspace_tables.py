"""add wealth workspace tables

Revision ID: c9e2f5a1b4d7
Revises: b8e1f4a2c6d0
Create Date: 2026-06-08 03:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c9e2f5a1b4d7"
down_revision = "b8e1f4a2c6d0"
branch_labels = None
depends_on = None

money_snapshot_asset_category = postgresql.ENUM(
    "CASH",
    "DEPOSIT",
    "SANCHAYAPATRA",
    "STOCK",
    "MUTUAL_FUND",
    "GOLD",
    "PROPERTY",
    "BUSINESS",
    "OTHER",
    name="moneysnapshotassetcategory",
    create_type=False,
)
money_snapshot_liability_category = postgresql.ENUM(
    "LOAN",
    "CREDIT",
    "MORTGAGE",
    "OTHER",
    name="moneysnapshotliabilitycategory",
    create_type=False,
)
liquidity_tier = postgresql.ENUM(
    "IMMEDIATE",
    "SHORT_TERM",
    "LOCKED",
    "ILLIQUID",
    name="liquiditytier",
    create_type=False,
)
wealth_goal_category = postgresql.ENUM(
    "EMERGENCY_FUND",
    "HOME",
    "RETIREMENT",
    "EDUCATION",
    "HOUSE_PURCHASE",
    "WEALTH_GROWTH",
    "ZAKAT_READINESS",
    "PASSIVE_INCOME",
    "OTHER",
    name="wealthgoalcategory",
    create_type=False,
)
wealth_goal_status = postgresql.ENUM(
    "ACTIVE", "REACHED", "PAUSED", name="wealthgoalstatus", create_type=False
)
wealth_scenario_type = postgresql.ENUM(
    "TOOL", "COMPARISON", "GOAL", name="wealthscenariotype", create_type=False
)


def upgrade() -> None:
    money_snapshot_asset_category.create(op.get_bind(), checkfirst=True)
    money_snapshot_liability_category.create(op.get_bind(), checkfirst=True)
    liquidity_tier.create(op.get_bind(), checkfirst=True)
    wealth_goal_category.create(op.get_bind(), checkfirst=True)
    wealth_goal_status.create(op.get_bind(), checkfirst=True)
    wealth_scenario_type.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "money_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("country_code", sa.String(length=2), server_default="BD", nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="BDT", nullable=False),
        sa.Column("monthly_savings", sa.Numeric(precision=20, scale=4), nullable=True),
        sa.Column("primary_goal", wealth_goal_category, nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_money_snapshots_user_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_money_snapshots"),
        sa.UniqueConstraint("user_id", name="uq_money_snapshots_user_id"),
    )
    op.create_index("ix_money_snapshots_user_id", "money_snapshots", ["user_id"], unique=False)

    op.create_table(
        "wealth_goals",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category", wealth_goal_category, nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("target_amount", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("current_amount", sa.Numeric(precision=20, scale=4), server_default="0", nullable=False),
        sa.Column("monthly_contribution", sa.Numeric(precision=20, scale=4), nullable=True),
        sa.Column("horizon_months", sa.Integer(), nullable=True),
        sa.Column("status", wealth_goal_status, server_default="ACTIVE", nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_wealth_goals_user_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_wealth_goals"),
    )
    op.create_index("ix_wealth_goals_user_status", "wealth_goals", ["user_id", "status"], unique=False)

    op.create_table(
        "wealth_scenarios",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scenario_type", wealth_scenario_type, nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("input_json", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("output_json", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_wealth_scenarios_user_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_wealth_scenarios"),
    )
    op.create_index("ix_wealth_scenarios_user_type", "wealth_scenarios", ["user_id", "scenario_type"], unique=False)

    op.create_table(
        "money_snapshot_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("snapshot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category", money_snapshot_asset_category, nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("value", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="BDT", nullable=False),
        sa.Column("liquidity_tier", liquidity_tier, server_default="IMMEDIATE", nullable=False),
        sa.Column("source_scenario_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.ForeignKeyConstraint(
            ["snapshot_id"],
            ["money_snapshots.id"],
            name="fk_money_snapshot_assets_snapshot_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_scenario_id"],
            ["wealth_scenarios.id"],
            name="fk_money_snapshot_assets_source_scenario_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_money_snapshot_assets"),
    )
    op.create_index(
        "ix_money_snapshot_assets_snapshot_category",
        "money_snapshot_assets",
        ["snapshot_id", "category"],
        unique=False,
    )

    op.create_table(
        "money_snapshot_liabilities",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("snapshot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category", money_snapshot_liability_category, nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("balance", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("interest_rate", sa.Numeric(precision=8, scale=4), nullable=True),
        sa.Column("monthly_emi", sa.Numeric(precision=20, scale=4), nullable=True),
        sa.Column("remaining_months", sa.Integer(), nullable=True),
        sa.Column("source_scenario_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.ForeignKeyConstraint(
            ["snapshot_id"],
            ["money_snapshots.id"],
            name="fk_money_snapshot_liabilities_snapshot_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_scenario_id"],
            ["wealth_scenarios.id"],
            name="fk_money_snapshot_liabilities_source_scenario_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_money_snapshot_liabilities"),
    )
    op.create_index(
        "ix_money_snapshot_liabilities_snapshot_category",
        "money_snapshot_liabilities",
        ["snapshot_id", "category"],
        unique=False,
    )

    op.create_table(
        "money_snapshot_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("snapshot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("net_worth", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("total_assets", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("total_liabilities", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("summary_json", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.ForeignKeyConstraint(
            ["snapshot_id"],
            ["money_snapshots.id"],
            name="fk_money_snapshot_history_snapshot_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_money_snapshot_history"),
    )
    op.create_index(
        "ix_money_snapshot_history_snapshot_created",
        "money_snapshot_history",
        ["snapshot_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_money_snapshot_history_snapshot_created", table_name="money_snapshot_history")
    op.drop_table("money_snapshot_history")
    op.drop_index("ix_money_snapshot_liabilities_snapshot_category", table_name="money_snapshot_liabilities")
    op.drop_table("money_snapshot_liabilities")
    op.drop_index("ix_money_snapshot_assets_snapshot_category", table_name="money_snapshot_assets")
    op.drop_table("money_snapshot_assets")
    op.drop_index("ix_wealth_scenarios_user_type", table_name="wealth_scenarios")
    op.drop_table("wealth_scenarios")
    op.drop_index("ix_wealth_goals_user_status", table_name="wealth_goals")
    op.drop_table("wealth_goals")
    op.drop_index("ix_money_snapshots_user_id", table_name="money_snapshots")
    op.drop_table("money_snapshots")

    wealth_scenario_type.drop(op.get_bind(), checkfirst=True)
    wealth_goal_status.drop(op.get_bind(), checkfirst=True)
    wealth_goal_category.drop(op.get_bind(), checkfirst=True)
    liquidity_tier.drop(op.get_bind(), checkfirst=True)
    money_snapshot_liability_category.drop(op.get_bind(), checkfirst=True)
    money_snapshot_asset_category.drop(op.get_bind(), checkfirst=True)
