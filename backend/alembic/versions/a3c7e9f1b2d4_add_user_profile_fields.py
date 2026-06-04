"""add user profile fields

Revision ID: a3c7e9f1b2d4
Revises: f2a4b6c8d0e1
Create Date: 2026-06-04 14:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a3c7e9f1b2d4"
down_revision = "f2a4b6c8d0e1"
branch_labels = None
depends_on = None

user_gender = postgresql.ENUM(
    "male",
    "female",
    "other",
    "prefer_not_to_say",
    name="usergender",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    user_gender.create(bind, checkfirst=True)

    op.add_column("users", sa.Column("mobile_number", sa.String(length=32), nullable=True))
    op.add_column("users", sa.Column("gender", user_gender, nullable=True))
    op.add_column("users", sa.Column("address", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("profile_pic_url", sa.String(length=500), nullable=True))
    op.create_unique_constraint("uq_users_mobile_number", "users", ["mobile_number"])


def downgrade() -> None:
    op.drop_constraint("uq_users_mobile_number", "users", type_="unique")
    op.drop_column("users", "profile_pic_url")
    op.drop_column("users", "address")
    op.drop_column("users", "gender")
    op.drop_column("users", "mobile_number")

    bind = op.get_bind()
    user_gender.drop(bind, checkfirst=True)
