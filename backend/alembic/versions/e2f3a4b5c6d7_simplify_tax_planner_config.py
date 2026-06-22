"""simplify tax planner config

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-06-23 18:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

revision = "e2f3a4b5c6d7"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def _table_exists(connection, table_name: str) -> bool:
    return table_name in inspect(connection).get_table_names()


def _column_exists(connection, table_name: str, column_name: str) -> bool:
    if not _table_exists(connection, table_name):
        return False
    return column_name in {column["name"] for column in inspect(connection).get_columns(table_name)}


def _index_exists(connection, table_name: str, index_name: str) -> bool:
    if not _table_exists(connection, table_name):
        return False
    return index_name in {index["name"] for index in inspect(connection).get_indexes(table_name)}


def _unique_constraint_exists(connection, table_name: str, constraint_name: str) -> bool:
    if not _table_exists(connection, table_name):
        return False
    return constraint_name in {
        constraint["name"] for constraint in inspect(connection).get_unique_constraints(table_name)
    }


def _drop_fiscal_year_fk(connection, table_name: str) -> None:
    if not _column_exists(connection, table_name, "fiscal_year_id"):
        return
    for foreign_key in inspect(connection).get_foreign_keys(table_name):
        if "fiscal_year_id" in foreign_key.get("constrained_columns", []):
            op.drop_constraint(foreign_key["name"], table_name, type_="foreignkey")
    op.drop_column(table_name, "fiscal_year_id")


def upgrade() -> None:
    connection = op.get_bind()

    if not _table_exists(connection, "tax_planner_settings"):
        op.create_table(
            "tax_planner_settings",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("country_code", sa.String(length=2), server_default="BD", nullable=False),
            sa.Column("tax_year_label", sa.String(length=20), nullable=False),
            sa.Column("display_name", sa.String(length=80), nullable=False),
            sa.Column("disclaimer", sa.Text(), nullable=False),
            sa.Column("minimum_tax_note", sa.Text(), nullable=False),
            sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("country_code", name="uq_tax_planner_settings_country_code"),
        )

    if _table_exists(connection, "tax_fiscal_years") and not connection.execute(
        sa.text("SELECT 1 FROM tax_planner_settings LIMIT 1")
    ).first():
        connection.execute(
            sa.text(
                """
                INSERT INTO tax_planner_settings (
                    id, country_code, tax_year_label, display_name, disclaimer, minimum_tax_note
                )
                SELECT
                    gen_random_uuid(),
                    fy.country_code,
                    fy.fiscal_year_key,
                    fy.display_name,
                    fy.disclaimer,
                    fy.minimum_tax_note
                FROM tax_fiscal_years fy
                WHERE fy.id = (
                    SELECT id FROM tax_fiscal_years
                    ORDER BY
                        CASE WHEN status = 'ACTIVE' AND is_default THEN 0 ELSE 1 END,
                        fiscal_year_key DESC
                    LIMIT 1
                )
                """
            )
        )

    if _table_exists(connection, "tax_fiscal_years"):
        keep_fy_id = connection.execute(
            sa.text(
                """
                SELECT id FROM tax_fiscal_years
                ORDER BY
                    CASE WHEN status = 'ACTIVE' AND is_default THEN 0 ELSE 1 END,
                    fiscal_year_key DESC
                LIMIT 1
                """
            )
        ).scalar()

        if keep_fy_id is not None:
            for table in (
                "tax_profile_thresholds",
                "tax_slabs",
                "tax_investment_rebate_rules",
                "tax_minimum_tax_rules",
            ):
                if _column_exists(connection, table, "fiscal_year_id"):
                    connection.execute(
                        sa.text(f"DELETE FROM {table} WHERE fiscal_year_id != :fy_id"),
                        {"fy_id": keep_fy_id},
                    )

    if _table_exists(connection, "tax_minimum_tax_rules"):
        if _index_exists(connection, "tax_minimum_tax_rules", "ix_tax_minimum_tax_rules_fiscal_year"):
            op.drop_index("ix_tax_minimum_tax_rules_fiscal_year", table_name="tax_minimum_tax_rules")
        _drop_fiscal_year_fk(connection, "tax_minimum_tax_rules")
        if not _unique_constraint_exists(connection, "tax_minimum_tax_rules", "uq_tax_minimum_tax_rules_rule_code"):
            op.create_unique_constraint(
                "uq_tax_minimum_tax_rules_rule_code",
                "tax_minimum_tax_rules",
                ["rule_code"],
            )

    if _table_exists(connection, "tax_investment_rebate_rules"):
        _drop_fiscal_year_fk(connection, "tax_investment_rebate_rules")
        if _unique_constraint_exists(connection, "tax_investment_rebate_rules", "uq_tax_investment_rebate_rules_fiscal_year_id"):
            op.drop_constraint(
                "uq_tax_investment_rebate_rules_fiscal_year_id",
                "tax_investment_rebate_rules",
                type_="unique",
            )

    if _table_exists(connection, "tax_slabs"):
        if _index_exists(connection, "tax_slabs", "ix_tax_slabs_fiscal_year_sort"):
            op.drop_index("ix_tax_slabs_fiscal_year_sort", table_name="tax_slabs")
        _drop_fiscal_year_fk(connection, "tax_slabs")
        if not _index_exists(connection, "tax_slabs", "ix_tax_slabs_sort_order"):
            op.create_index("ix_tax_slabs_sort_order", "tax_slabs", ["sort_order"], unique=False)

    if _table_exists(connection, "tax_profile_thresholds"):
        if _index_exists(connection, "tax_profile_thresholds", "ix_tax_profile_thresholds_fiscal_year_id"):
            op.drop_index("ix_tax_profile_thresholds_fiscal_year_id", table_name="tax_profile_thresholds")
        _drop_fiscal_year_fk(connection, "tax_profile_thresholds")
        if _unique_constraint_exists(connection, "tax_profile_thresholds", "uq_tax_profile_thresholds_fy_profile"):
            op.drop_constraint("uq_tax_profile_thresholds_fy_profile", "tax_profile_thresholds", type_="unique")
        if not _unique_constraint_exists(connection, "tax_profile_thresholds", "uq_tax_profile_thresholds_profile_code"):
            op.create_unique_constraint(
                "uq_tax_profile_thresholds_profile_code",
                "tax_profile_thresholds",
                ["profile_code"],
            )

    if _table_exists(connection, "tax_fiscal_years"):
        if _index_exists(connection, "tax_fiscal_years", "ix_tax_fiscal_years_country_status"):
            op.drop_index("ix_tax_fiscal_years_country_status", table_name="tax_fiscal_years")
        op.drop_table("tax_fiscal_years")

    op.execute("DROP TYPE IF EXISTS taxfiscalyearstatus")


def downgrade() -> None:
    tax_fiscal_year_status = postgresql.ENUM(
        "DRAFT",
        "ACTIVE",
        "ARCHIVED",
        name="taxfiscalyearstatus",
        create_type=False,
    )
    tax_fiscal_year_status.create(op.get_bind(), checkfirst=True)

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

    op.drop_constraint("uq_tax_profile_thresholds_profile_code", "tax_profile_thresholds", type_="unique")
    op.add_column("tax_profile_thresholds", sa.Column("fiscal_year_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "tax_profile_thresholds_fiscal_year_id_fkey",
        "tax_profile_thresholds",
        "tax_fiscal_years",
        ["fiscal_year_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_tax_profile_thresholds_fiscal_year_id", "tax_profile_thresholds", ["fiscal_year_id"], unique=False)
    op.create_unique_constraint(
        "uq_tax_profile_thresholds_fy_profile",
        "tax_profile_thresholds",
        ["fiscal_year_id", "profile_code"],
    )

    op.drop_index("ix_tax_slabs_sort_order", table_name="tax_slabs")
    op.add_column("tax_slabs", sa.Column("fiscal_year_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "tax_slabs_fiscal_year_id_fkey",
        "tax_slabs",
        "tax_fiscal_years",
        ["fiscal_year_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_tax_slabs_fiscal_year_sort", "tax_slabs", ["fiscal_year_id", "sort_order"], unique=False)

    op.add_column("tax_investment_rebate_rules", sa.Column("fiscal_year_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "tax_investment_rebate_rules_fiscal_year_id_fkey",
        "tax_investment_rebate_rules",
        "tax_fiscal_years",
        ["fiscal_year_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "uq_tax_investment_rebate_rules_fiscal_year_id",
        "tax_investment_rebate_rules",
        ["fiscal_year_id"],
    )

    op.drop_constraint("uq_tax_minimum_tax_rules_rule_code", "tax_minimum_tax_rules", type_="unique")
    op.add_column("tax_minimum_tax_rules", sa.Column("fiscal_year_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "tax_minimum_tax_rules_fiscal_year_id_fkey",
        "tax_minimum_tax_rules",
        "tax_fiscal_years",
        ["fiscal_year_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_tax_minimum_tax_rules_fiscal_year", "tax_minimum_tax_rules", ["fiscal_year_id"], unique=False)

    op.drop_table("tax_planner_settings")
