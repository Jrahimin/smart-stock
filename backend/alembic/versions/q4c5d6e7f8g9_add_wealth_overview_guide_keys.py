"""Add Wealth overview onboarding guide keys.

Revision ID: q4c5d6e7f8g9
Revises: p3b4c5d6e7f8
"""

from alembic import op

revision = "q4c5d6e7f8g9"
down_revision = "p3b4c5d6e7f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TYPE onboardingguidekey ADD VALUE IF NOT EXISTS "
        "'WEALTH_OVERVIEW_DESKTOP_GUIDE'"
    )
    op.execute(
        "ALTER TYPE onboardingguidekey ADD VALUE IF NOT EXISTS "
        "'WEALTH_OVERVIEW_MOBILE_GUIDE'"
    )


def downgrade() -> None:
    # PostgreSQL enum values cannot be removed safely while preferences may reference them.
    pass
