"""Add the SQLAlchemy enum member name for the sidebar guide.

Revision ID: p3b4c5d6e7f8
Revises: o2a3b4c5d6e7
"""

from alembic import op

revision = "p3b4c5d6e7f8"
down_revision = "o2a3b4c5d6e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE onboardingguidekey ADD VALUE IF NOT EXISTS 'DASHBOARD_SIDEBAR_GUIDE'")


def downgrade() -> None:
    pass
