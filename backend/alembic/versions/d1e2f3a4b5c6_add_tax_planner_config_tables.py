"""add tax planner config tables

Revision ID: d1e2f3a4b5c6
Revises: a7b8c9d0e1f2
Create Date: 2026-06-23 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d1e2f3a4b5c6"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None

tax_fiscal_year_status = postgresql.ENUM(
    "DRAFT",
    "ACTIVE",
    "ARCHIVED",
    name="taxfiscalyearstatus",
    create_type=False,
)
tax_profile_code = postgresql.ENUM(
    "GENERAL",
    "WOMAN_OR_SENIOR",
    "PERSON_WITH_DISABILITY",
    "FREEDOM_FIGHTER",
    name="taxprofilecode",
    create_type=False,
)
tax_minimum_tax_rule_type = postgresql.ENUM(
    "NATIONAL_DEFAULT",
    "LOCATION_TIER",
    name="taxminimumtaxruletype",
    create_type=False,
)


def upgrade() -> None:
    tax_fiscal_year_status.create(op.get_bind(), checkfirst=True)
    tax_profile_code.create(op.get_bind(), checkfirst=True)
    tax_minimum_tax_rule_type.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "tax_fiscal_years",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("fiscal_year_key", sa.String(length=20), nullable=False),
        sa.Column("display_name", sa.String(length=80), nullable=False),
        sa.Column("country_code", sa.String(length=2), server_default="BD", nullable=False),
        sa.Column("status", tax_fiscal_year_status, nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=True),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("disclaimer", sa.Text(), nullable=False),
        sa.Column("minimum_tax_note", sa.Text(), nullable=False),
        sa.Column("config_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["published_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("fiscal_year_key", name="uq_tax_fiscal_years_fiscal_year_key"),
    )
    op.create_index(
        "ix_tax_fiscal_years_country_status",
        "tax_fiscal_years",
        ["country_code", "status"],
        unique=False,
    )

    op.create_table(
        "tax_investment_categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("category_key", sa.String(length=60), nullable=False),
        sa.Column("display_label", sa.String(length=120), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("category_key", name="uq_tax_investment_categories_category_key"),
    )
    op.create_index(
        "ix_tax_investment_categories_sort_order",
        "tax_investment_categories",
        ["sort_order"],
        unique=False,
    )

    op.create_table(
        "tax_profile_thresholds",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("fiscal_year_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("profile_code", tax_profile_code, nullable=False),
        sa.Column("threshold_amount", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.ForeignKeyConstraint(["fiscal_year_id"], ["tax_fiscal_years.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("fiscal_year_id", "profile_code", name="uq_tax_profile_thresholds_fy_profile"),
    )
    op.create_index(
        "ix_tax_profile_thresholds_fiscal_year_id",
        "tax_profile_thresholds",
        ["fiscal_year_id"],
        unique=False,
    )

    op.create_table(
        "tax_slabs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("fiscal_year_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("band_amount", sa.Numeric(precision=20, scale=4), nullable=True),
        sa.Column("rate", sa.Numeric(precision=8, scale=4), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("is_allowance_band", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(["fiscal_year_id"], ["tax_fiscal_years.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_tax_slabs_fiscal_year_sort",
        "tax_slabs",
        ["fiscal_year_id", "sort_order"],
        unique=False,
    )

    op.create_table(
        "tax_investment_rebate_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("fiscal_year_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("max_income_percentage", sa.Numeric(precision=8, scale=4), nullable=False),
        sa.Column("max_amount", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("rebate_rate", sa.Numeric(precision=8, scale=4), nullable=False),
        sa.Column("max_rebate_amount", sa.Numeric(precision=20, scale=4), nullable=True),
        sa.ForeignKeyConstraint(["fiscal_year_id"], ["tax_fiscal_years.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("fiscal_year_id", name="uq_tax_investment_rebate_rules_fiscal_year_id"),
    )

    op.create_table(
        "tax_minimum_tax_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("fiscal_year_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rule_type", tax_minimum_tax_rule_type, nullable=False),
        sa.Column("rule_code", sa.String(length=60), nullable=False),
        sa.Column("location_code", sa.String(length=60), nullable=True),
        sa.Column("minimum_amount", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.ForeignKeyConstraint(["fiscal_year_id"], ["tax_fiscal_years.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_tax_minimum_tax_rules_fiscal_year",
        "tax_minimum_tax_rules",
        ["fiscal_year_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_tax_minimum_tax_rules_fiscal_year", table_name="tax_minimum_tax_rules")
    op.drop_table("tax_minimum_tax_rules")
    op.drop_table("tax_investment_rebate_rules")
    op.drop_index("ix_tax_slabs_fiscal_year_sort", table_name="tax_slabs")
    op.drop_table("tax_slabs")
    op.drop_index("ix_tax_profile_thresholds_fiscal_year_id", table_name="tax_profile_thresholds")
    op.drop_table("tax_profile_thresholds")
    op.drop_index("ix_tax_investment_categories_sort_order", table_name="tax_investment_categories")
    op.drop_table("tax_investment_categories")
    op.drop_index("ix_tax_fiscal_years_country_status", table_name="tax_fiscal_years")
    op.drop_table("tax_fiscal_years")
    tax_minimum_tax_rule_type.drop(op.get_bind(), checkfirst=True)
    tax_profile_code.drop(op.get_bind(), checkfirst=True)
    tax_fiscal_year_status.drop(op.get_bind(), checkfirst=True)
