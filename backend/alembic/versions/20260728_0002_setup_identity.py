"""make setup identity unique and immutable

Revision ID: 20260728_0002
Revises: 20260711_0001
Create Date: 2026-07-28 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260728_0002"
down_revision: str | None = "20260711_0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("setups") as batch_op:
        batch_op.add_column(sa.Column("setup_code", sa.String(length=128), nullable=True))

    op.execute(
        """
        UPDATE setups
        SET setup_code = (
            SELECT setup_versions.setup_code
            FROM setup_versions
            WHERE setup_versions.entity_id = setups.id
            ORDER BY setup_versions.version ASC
            LIMIT 1
        )
        """
    )

    duplicate = (
        op.get_bind()
        .execute(
            sa.text(
                """
            SELECT COALESCE(setup_code, '<missing>')
            FROM setups
            GROUP BY setup_code
            HAVING setup_code IS NULL OR COUNT(*) > 1
            LIMIT 1
            """
            )
        )
        .scalar_one_or_none()
    )
    if duplicate is not None:
        raise RuntimeError(f"Cannot enforce unique setup identity: duplicate code {duplicate!r}")

    with op.batch_alter_table("setups") as batch_op:
        batch_op.alter_column("setup_code", existing_type=sa.String(length=128), nullable=False)
        batch_op.create_unique_constraint("uq_setups_setup_code", ["setup_code"])


def downgrade() -> None:
    with op.batch_alter_table("setups") as batch_op:
        batch_op.drop_constraint("uq_setups_setup_code", type_="unique")
        batch_op.drop_column("setup_code")
