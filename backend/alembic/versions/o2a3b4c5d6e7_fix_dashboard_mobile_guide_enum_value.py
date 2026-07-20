"""Add the SQLAlchemy enum member name for the mobile dashboard guide.

Revision ID: o2a3b4c5d6e7
Revises: n1a2b3c4d5e6
"""

from alembic import op

revision = "o2a3b4c5d6e7"
down_revision = "n1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE onboardingguidekey ADD VALUE IF NOT EXISTS 'DASHBOARD_MOBILE_INTRO'")


def downgrade() -> None:
    pass
