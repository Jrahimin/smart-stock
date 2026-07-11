"""Add dashboard mobile intro guide preference key.

Revision ID: j7c8d9e0f1a2
Revises: i6b7c8d9e0f1
"""

from alembic import op

revision = "j7c8d9e0f1a2"
down_revision = "i6b7c8d9e0f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE onboardingguidekey ADD VALUE IF NOT EXISTS 'dashboard_mobile_intro'")


def downgrade() -> None:
    pass
