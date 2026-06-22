"""consolidate tax planner singleton config into tax_planner_settings

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-06-24 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f3a4b5c6d7e8"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tax_planner_settings", sa.Column("threshold_general", sa.Numeric(precision=20, scale=4), nullable=True))
    op.add_column(
        "tax_planner_settings",
        sa.Column("threshold_woman_or_senior", sa.Numeric(precision=20, scale=4), nullable=True),
    )
    op.add_column(
        "tax_planner_settings",
        sa.Column("threshold_person_with_disability", sa.Numeric(precision=20, scale=4), nullable=True),
    )
    op.add_column(
        "tax_planner_settings",
        sa.Column("threshold_freedom_fighter", sa.Numeric(precision=20, scale=4), nullable=True),
    )
    op.add_column(
        "tax_planner_settings",
        sa.Column("rebate_max_income_percentage", sa.Numeric(precision=8, scale=4), nullable=True),
    )
    op.add_column("tax_planner_settings", sa.Column("rebate_max_amount", sa.Numeric(precision=20, scale=4), nullable=True))
    op.add_column("tax_planner_settings", sa.Column("rebate_rate", sa.Numeric(precision=8, scale=4), nullable=True))
    op.add_column(
        "tax_planner_settings",
        sa.Column("rebate_max_rebate_amount", sa.Numeric(precision=20, scale=4), nullable=True),
    )
    op.add_column("tax_planner_settings", sa.Column("minimum_tax_national", sa.Numeric(precision=20, scale=4), nullable=True))
    op.add_column("tax_planner_settings", sa.Column("minimum_tax_dhaka_ctg", sa.Numeric(precision=20, scale=4), nullable=True))
    op.add_column("tax_planner_settings", sa.Column("minimum_tax_other_city", sa.Numeric(precision=20, scale=4), nullable=True))
    op.add_column("tax_planner_settings", sa.Column("minimum_tax_rural", sa.Numeric(precision=20, scale=4), nullable=True))

    connection = op.get_bind()

    connection.execute(
        sa.text(
            """
            UPDATE tax_planner_settings s
            SET threshold_general = t.threshold_amount
            FROM tax_profile_thresholds t
            WHERE t.profile_code = 'GENERAL'
            """
        )
    )
    connection.execute(
        sa.text(
            """
            UPDATE tax_planner_settings s
            SET threshold_woman_or_senior = t.threshold_amount
            FROM tax_profile_thresholds t
            WHERE t.profile_code = 'WOMAN_OR_SENIOR'
            """
        )
    )
    connection.execute(
        sa.text(
            """
            UPDATE tax_planner_settings s
            SET threshold_person_with_disability = t.threshold_amount
            FROM tax_profile_thresholds t
            WHERE t.profile_code = 'PERSON_WITH_DISABILITY'
            """
        )
    )
    connection.execute(
        sa.text(
            """
            UPDATE tax_planner_settings s
            SET threshold_freedom_fighter = t.threshold_amount
            FROM tax_profile_thresholds t
            WHERE t.profile_code = 'FREEDOM_FIGHTER'
            """
        )
    )

    connection.execute(
        sa.text(
            """
            UPDATE tax_planner_settings s
            SET
                rebate_max_income_percentage = r.max_income_percentage,
                rebate_max_amount = r.max_amount,
                rebate_rate = r.rebate_rate,
                rebate_max_rebate_amount = r.max_rebate_amount
            FROM tax_investment_rebate_rules r
            """
        )
    )

    connection.execute(
        sa.text(
            """
            UPDATE tax_planner_settings s
            SET minimum_tax_national = m.minimum_amount
            FROM tax_minimum_tax_rules m
            WHERE m.rule_code = 'NATIONAL_DEFAULT'
            """
        )
    )
    connection.execute(
        sa.text(
            """
            UPDATE tax_planner_settings s
            SET minimum_tax_dhaka_ctg = m.minimum_amount
            FROM tax_minimum_tax_rules m
            WHERE m.rule_code = 'LOCATION_DHAKA_CTG'
            """
        )
    )
    connection.execute(
        sa.text(
            """
            UPDATE tax_planner_settings s
            SET minimum_tax_other_city = m.minimum_amount
            FROM tax_minimum_tax_rules m
            WHERE m.rule_code = 'LOCATION_OTHER_CITY'
            """
        )
    )
    connection.execute(
        sa.text(
            """
            UPDATE tax_planner_settings s
            SET minimum_tax_rural = m.minimum_amount
            FROM tax_minimum_tax_rules m
            WHERE m.rule_code = 'LOCATION_RURAL'
            """
        )
    )

    op.alter_column("tax_planner_settings", "threshold_general", nullable=False)
    op.alter_column("tax_planner_settings", "threshold_woman_or_senior", nullable=False)
    op.alter_column("tax_planner_settings", "threshold_person_with_disability", nullable=False)
    op.alter_column("tax_planner_settings", "threshold_freedom_fighter", nullable=False)
    op.alter_column("tax_planner_settings", "rebate_max_income_percentage", nullable=False)
    op.alter_column("tax_planner_settings", "rebate_max_amount", nullable=False)
    op.alter_column("tax_planner_settings", "rebate_rate", nullable=False)
    op.alter_column("tax_planner_settings", "minimum_tax_national", nullable=False)
    op.alter_column("tax_planner_settings", "minimum_tax_dhaka_ctg", nullable=False)
    op.alter_column("tax_planner_settings", "minimum_tax_other_city", nullable=False)
    op.alter_column("tax_planner_settings", "minimum_tax_rural", nullable=False)

    op.drop_table("tax_minimum_tax_rules")
    op.drop_table("tax_investment_rebate_rules")
    op.drop_table("tax_profile_thresholds")

    op.drop_index("ix_tax_slabs_sort_order", table_name="tax_slabs")
    op.create_unique_constraint("uq_tax_slabs_sort_order", "tax_slabs", ["sort_order"])

    op.execute("DROP TYPE IF EXISTS taxminimumtaxruletype")


def downgrade() -> None:
    tax_minimum_tax_rule_type = postgresql.ENUM(
        "NATIONAL_DEFAULT",
        "LOCATION_TIER",
        name="taxminimumtaxruletype",
        create_type=False,
    )
    tax_minimum_tax_rule_type.create(op.get_bind(), checkfirst=True)
    tax_profile_code = postgresql.ENUM(
        "GENERAL",
        "WOMAN_OR_SENIOR",
        "PERSON_WITH_DISABILITY",
        "FREEDOM_FIGHTER",
        name="taxprofilecode",
        create_type=False,
    )
    tax_profile_code.create(op.get_bind(), checkfirst=True)

    op.drop_constraint("uq_tax_slabs_sort_order", "tax_slabs", type_="unique")
    op.create_index("ix_tax_slabs_sort_order", "tax_slabs", ["sort_order"], unique=False)

    op.create_table(
        "tax_profile_thresholds",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("profile_code", tax_profile_code, nullable=False),
        sa.Column("threshold_amount", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("profile_code", name="uq_tax_profile_thresholds_profile_code"),
    )

    op.create_table(
        "tax_investment_rebate_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("max_income_percentage", sa.Numeric(precision=8, scale=4), nullable=False),
        sa.Column("max_amount", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("rebate_rate", sa.Numeric(precision=8, scale=4), nullable=False),
        sa.Column("max_rebate_amount", sa.Numeric(precision=20, scale=4), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "tax_minimum_tax_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("rule_type", tax_minimum_tax_rule_type, nullable=False),
        sa.Column("rule_code", sa.String(length=60), nullable=False),
        sa.Column("location_code", sa.String(length=60), nullable=True),
        sa.Column("minimum_amount", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rule_code", name="uq_tax_minimum_tax_rules_rule_code"),
    )

    for column in (
        "threshold_general",
        "threshold_woman_or_senior",
        "threshold_person_with_disability",
        "threshold_freedom_fighter",
        "rebate_max_income_percentage",
        "rebate_max_amount",
        "rebate_rate",
        "rebate_max_rebate_amount",
        "minimum_tax_national",
        "minimum_tax_dhaka_ctg",
        "minimum_tax_other_city",
        "minimum_tax_rural",
    ):
        op.drop_column("tax_planner_settings", column)
