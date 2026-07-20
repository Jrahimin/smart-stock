"""Add user onboarding guide preferences.

Revision ID: i6b7c8d9e0f1
Revises: h5b6c7d8e9f0
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "i6b7c8d9e0f1"
down_revision = "h5b6c7d8e9f0"
branch_labels = None
depends_on = None

onboarding_guide_key = postgresql.ENUM(
    "DASHBOARD_SIDEBAR_GUIDE",
    name="onboardingguidekey",
    create_type=False,
)
onboarding_guide_state = postgresql.ENUM(
    "COMPLETED",
    "DISMISSED",
    name="onboardingguidestate",
    create_type=False,
)


def upgrade() -> None:
    onboarding_guide_key.create(op.get_bind(), checkfirst=True)
    onboarding_guide_state.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "user_onboarding_guide_preferences",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("guide_key", onboarding_guide_key, nullable=False),
        sa.Column("state", onboarding_guide_state, nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_user_onboarding_guide_preferences_user_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_user_onboarding_guide_preferences"),
        sa.UniqueConstraint(
            "user_id",
            "guide_key",
            name="uq_user_onboarding_guide_preferences_user_key",
        ),
    )
    op.create_index(
        "ix_user_onboarding_guide_preferences_user_key",
        "user_onboarding_guide_preferences",
        ["user_id", "guide_key"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_user_onboarding_guide_preferences_user_key",
        table_name="user_onboarding_guide_preferences",
    )
    op.drop_table("user_onboarding_guide_preferences")
    onboarding_guide_state.drop(op.get_bind(), checkfirst=True)
    onboarding_guide_key.drop(op.get_bind(), checkfirst=True)
