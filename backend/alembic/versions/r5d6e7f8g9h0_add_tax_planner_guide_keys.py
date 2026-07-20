"""Add Tax Planner onboarding guide keys.

Revision ID: r5d6e7f8g9h0
Revises: q4c5d6e7f8g9
"""

from alembic import op

revision = "r5d6e7f8g9h0"
down_revision = "q4c5d6e7f8g9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE onboardingguidekey ADD VALUE IF NOT EXISTS 'TAX_PLANNER_DESKTOP_GUIDE'")
    op.execute("ALTER TYPE onboardingguidekey ADD VALUE IF NOT EXISTS 'TAX_PLANNER_MOBILE_GUIDE'")


def downgrade() -> None:
    # PostgreSQL enum values cannot be removed safely while preferences may reference them.
    pass
