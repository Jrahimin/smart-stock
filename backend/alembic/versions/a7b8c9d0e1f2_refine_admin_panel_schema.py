"""refine admin panel schema

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
Create Date: 2026-06-16 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a7b8c9d0e1f2"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None

config_value_type = postgresql.ENUM(
    "STRING",
    "INTEGER",
    "FLOAT",
    "BOOLEAN",
    "JSON",
    name="configvaluetype",
    create_type=False,
)
admin_config_category = postgresql.ENUM(
    "SYSTEM",
    "FEATURE_FLAG",
    "MARKET",
    "EMAIL",
    "SCRAPER",
    name="adminconfigcategory",
    create_type=False,
)


def _drop_user_fk_on_email_campaign_recipients() -> None:
    bind = op.get_bind()
    constraint_name = bind.execute(
        sa.text(
            """
            SELECT con.conname
            FROM pg_constraint con
            INNER JOIN pg_class rel ON rel.oid = con.conrelid
            INNER JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
            WHERE rel.relname = 'email_campaign_recipients'
              AND con.contype = 'f'
              AND att.attname = 'user_id'
            LIMIT 1
            """
        )
    ).scalar()
    if constraint_name:
        op.drop_constraint(constraint_name, "email_campaign_recipients", type_="foreignkey")


def upgrade() -> None:
    bind = op.get_bind()
    config_value_type.create(bind, checkfirst=True)
    admin_config_category.create(bind, checkfirst=True)

    op.add_column(
        "admin_config_settings",
        sa.Column(
            "category",
            admin_config_category,
            nullable=False,
            server_default="SYSTEM",
        ),
    )
    op.add_column(
        "admin_config_settings",
        sa.Column("requires_restart", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.execute(
        """
        UPDATE admin_config_settings
        SET value_type = CASE
            WHEN value_type IN ('bool', 'boolean') THEN 'BOOLEAN'
            WHEN value_type IN ('int', 'integer') THEN 'INTEGER'
            WHEN value_type IN ('float', 'number') THEN 'FLOAT'
            WHEN value_type = 'json' THEN 'JSON'
            ELSE 'STRING'
        END
        """
    )
    op.execute("ALTER TABLE admin_config_settings ALTER COLUMN value_type DROP DEFAULT")
    op.alter_column(
        "admin_config_settings",
        "value_type",
        existing_type=sa.String(length=32),
        type_=config_value_type,
        postgresql_using="value_type::configvaluetype",
        existing_nullable=False,
    )
    op.execute("ALTER TABLE admin_config_settings ALTER COLUMN value_type SET DEFAULT 'STRING'::configvaluetype")
    op.create_index("ix_admin_config_settings_category", "admin_config_settings", ["category"])

    op.add_column("system_job_executions", sa.Column("duration_ms", sa.Integer(), nullable=True))
    op.add_column(
        "system_job_executions",
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="1"),
    )

    op.add_column("email_campaigns", sa.Column("body_html", sa.Text(), nullable=True))
    op.add_column(
        "email_campaigns",
        sa.Column("total_recipients", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "email_campaigns",
        sa.Column("sent_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "email_campaigns",
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
    )

    op.drop_constraint("uq_email_campaign_recipients_campaign_user", "email_campaign_recipients", type_="unique")
    _drop_user_fk_on_email_campaign_recipients()
    op.alter_column("email_campaign_recipients", "user_id", existing_type=postgresql.UUID(), nullable=True)
    op.create_foreign_key(
        "fk_email_campaign_recipients_user_id_users",
        "email_campaign_recipients",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint(
        "uq_email_campaign_recipients_campaign_email",
        "email_campaign_recipients",
        ["campaign_id", "email"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_email_campaign_recipients_campaign_email", "email_campaign_recipients", type_="unique")
    op.drop_constraint("fk_email_campaign_recipients_user_id_users", "email_campaign_recipients", type_="foreignkey")
    op.create_foreign_key(
        "email_campaign_recipients_user_id_fkey",
        "email_campaign_recipients",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.alter_column("email_campaign_recipients", "user_id", existing_type=postgresql.UUID(), nullable=False)
    op.create_unique_constraint(
        "uq_email_campaign_recipients_campaign_user",
        "email_campaign_recipients",
        ["campaign_id", "user_id"],
    )

    op.drop_column("email_campaigns", "failed_count")
    op.drop_column("email_campaigns", "sent_count")
    op.drop_column("email_campaigns", "total_recipients")
    op.drop_column("email_campaigns", "body_html")

    op.drop_column("system_job_executions", "attempt_count")
    op.drop_column("system_job_executions", "duration_ms")

    op.drop_index("ix_admin_config_settings_category", table_name="admin_config_settings")
    op.execute("ALTER TABLE admin_config_settings ALTER COLUMN value_type DROP DEFAULT")
    op.alter_column(
        "admin_config_settings",
        "value_type",
        existing_type=config_value_type,
        type_=sa.String(length=32),
        postgresql_using="lower(value_type::text)",
        existing_nullable=False,
    )
    op.execute("ALTER TABLE admin_config_settings ALTER COLUMN value_type SET DEFAULT 'string'")
    op.drop_column("admin_config_settings", "requires_restart")
    op.drop_column("admin_config_settings", "category")

    bind = op.get_bind()
    admin_config_category.drop(bind, checkfirst=True)
    config_value_type.drop(bind, checkfirst=True)
