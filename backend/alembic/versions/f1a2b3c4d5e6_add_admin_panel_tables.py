"""add admin panel tables and user role fields

Revision ID: f1a2b3c4d5e6
Revises: c9e2f5a1b4d7
Create Date: 2026-06-15 20:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f1a2b3c4d5e6"
down_revision = "c9e2f5a1b4d7"
branch_labels = None
depends_on = None

user_role = postgresql.ENUM("USER", "ADMIN", "SUPER_ADMIN", name="userrole", create_type=False)
system_job_type = postgresql.ENUM(
    "MARKET_SYNC",
    "MARKET_SNAPSHOT",
    "STOCK_DETAILS_SYNC",
    "INDICATORS",
    "SIGNALS",
    "EMAIL_CAMPAIGN",
    "OTHER",
    name="systemjobtype",
    create_type=False,
)
system_job_execution_status = postgresql.ENUM(
    "PENDING",
    "RUNNING",
    "SUCCEEDED",
    "PARTIAL",
    "FAILED",
    "CANCELLED",
    name="systemjobexecutionstatus",
    create_type=False,
)
system_job_trigger_source = postgresql.ENUM(
    "SCHEDULER",
    "MANUAL",
    "API",
    "SYSTEM",
    name="systemjobtriggersource",
    create_type=False,
)
email_campaign_status = postgresql.ENUM(
    "DRAFT",
    "QUEUED",
    "RUNNING",
    "SUCCEEDED",
    "PARTIAL",
    "FAILED",
    "CANCELLED",
    name="emailcampaignstatus",
    create_type=False,
)
email_campaign_recipient_scope = postgresql.ENUM(
    "ALL_USERS",
    "VERIFIED_USERS",
    "SELECTED_USERS",
    "SUBSCRIBED_USERS",
    "NON_ADMIN_USERS",
    "FILTERED_USERS",
    name="emailcampaignrecipientscope",
    create_type=False,
)
email_campaign_recipient_delivery_status = postgresql.ENUM(
    "PENDING",
    "SENT",
    "FAILED",
    "SKIPPED",
    name="emailcampaignrecipientdeliverystatus",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    user_role.create(bind, checkfirst=True)
    system_job_type.create(bind, checkfirst=True)
    system_job_execution_status.create(bind, checkfirst=True)
    system_job_trigger_source.create(bind, checkfirst=True)
    email_campaign_status.create(bind, checkfirst=True)
    email_campaign_recipient_scope.create(bind, checkfirst=True)
    email_campaign_recipient_delivery_status.create(bind, checkfirst=True)

    op.add_column(
        "users",
        sa.Column("role", user_role, nullable=False, server_default="USER"),
    )
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("deleted_by_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("users", sa.Column("last_seen_ip", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("last_seen_user_agent", sa.String(length=500), nullable=True))
    op.add_column("users", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        "fk_users_deleted_by_user_id_users",
        "users",
        "users",
        ["deleted_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_users_role", "users", ["role"])
    op.create_index("ix_users_deleted_at", "users", ["deleted_at"])

    op.create_table(
        "user_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("session_identifier", sa.String(length=64), nullable=False),
        sa.Column("login_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("device_type", sa.String(length=32), nullable=True),
        sa.Column("browser", sa.String(length=80), nullable=True),
        sa.Column("operating_system", sa.String(length=80), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("logout_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_successful", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("failure_reason", sa.String(length=255), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_identifier", name="uq_user_sessions_session_identifier"),
    )
    op.create_index("ix_user_sessions_user_login_at", "user_sessions", ["user_id", "login_at"])

    op.create_table(
        "admin_config_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("setting_key", sa.String(length=120), nullable=False),
        sa.Column("setting_value", sa.Text(), nullable=False),
        sa.Column("value_type", sa.String(length=32), nullable=False, server_default="string"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("setting_key", name="uq_admin_config_settings_setting_key"),
    )
    op.create_index("ix_admin_config_settings_setting_key", "admin_config_settings", ["setting_key"])

    op.create_table(
        "system_job_executions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("job_type", system_job_type, nullable=False),
        sa.Column("job_name", sa.String(length=120), nullable=False),
        sa.Column("status", system_job_execution_status, nullable=False),
        sa.Column("trigger_source", system_job_trigger_source, nullable=False),
        sa.Column("triggered_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.ForeignKeyConstraint(["triggered_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_system_job_executions_type_started", "system_job_executions", ["job_type", "started_at"])
    op.create_index("ix_system_job_executions_status_started", "system_job_executions", ["status", "started_at"])

    op.create_table(
        "email_campaigns",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("body_text", sa.Text(), nullable=False),
        sa.Column("recipient_scope", email_campaign_recipient_scope, nullable=False),
        sa.Column("status", email_campaign_status, nullable=False, server_default="DRAFT"),
        sa.Column("filter_criteria_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("queued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("system_job_execution_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["system_job_execution_id"], ["system_job_executions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_email_campaigns_status_created", "email_campaigns", ["status", "created_at"])

    op.create_table(
        "email_campaign_recipients",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=160), nullable=False),
        sa.Column("delivery_status", email_campaign_recipient_delivery_status, nullable=False, server_default="PENDING"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["campaign_id"], ["email_campaigns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("campaign_id", "user_id", name="uq_email_campaign_recipients_campaign_user"),
    )
    op.create_index(
        "ix_email_campaign_recipients_campaign_status",
        "email_campaign_recipients",
        ["campaign_id", "delivery_status"],
    )


def downgrade() -> None:
    op.drop_index("ix_email_campaign_recipients_campaign_status", table_name="email_campaign_recipients")
    op.drop_table("email_campaign_recipients")
    op.drop_index("ix_email_campaigns_status_created", table_name="email_campaigns")
    op.drop_table("email_campaigns")
    op.drop_index("ix_system_job_executions_status_started", table_name="system_job_executions")
    op.drop_index("ix_system_job_executions_type_started", table_name="system_job_executions")
    op.drop_table("system_job_executions")
    op.drop_index("ix_admin_config_settings_setting_key", table_name="admin_config_settings")
    op.drop_table("admin_config_settings")
    op.drop_index("ix_user_sessions_user_login_at", table_name="user_sessions")
    op.drop_table("user_sessions")
    op.drop_index("ix_users_deleted_at", table_name="users")
    op.drop_index("ix_users_role", table_name="users")
    op.drop_constraint("fk_users_deleted_by_user_id_users", "users", type_="foreignkey")
    op.drop_column("users", "last_seen_at")
    op.drop_column("users", "last_seen_user_agent")
    op.drop_column("users", "last_seen_ip")
    op.drop_column("users", "deleted_by_user_id")
    op.drop_column("users", "deleted_at")
    op.drop_column("users", "role")

    bind = op.get_bind()
    email_campaign_recipient_delivery_status.drop(bind, checkfirst=True)
    email_campaign_recipient_scope.drop(bind, checkfirst=True)
    email_campaign_status.drop(bind, checkfirst=True)
    system_job_trigger_source.drop(bind, checkfirst=True)
    system_job_execution_status.drop(bind, checkfirst=True)
    system_job_type.drop(bind, checkfirst=True)
    user_role.drop(bind, checkfirst=True)
