"""add sample soft delete fields

Revision ID: 20260425_0011
Revises: 20260424_0010
Create Date: 2026-04-25 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260425_0011"
down_revision: str | None = "20260424_0010"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("samples") as batch_op:
        batch_op.add_column(sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("deleted_by_id", sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            "fk_samples_deleted_by_id_users",
            "users",
            ["deleted_by_id"],
            ["id"],
        )
        batch_op.create_index("ix_samples_deleted_by_id", ["deleted_by_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("samples") as batch_op:
        batch_op.drop_index("ix_samples_deleted_by_id")
        batch_op.drop_constraint("fk_samples_deleted_by_id_users", type_="foreignkey")
        batch_op.drop_column("deleted_by_id")
        batch_op.drop_column("deleted_at")
