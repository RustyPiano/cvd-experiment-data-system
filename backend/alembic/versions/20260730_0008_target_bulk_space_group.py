"""add target material region bulk space group

Revision ID: 20260730_0008
Revises: 20260729_0007
Create Date: 2026-07-30 18:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260730_0008"
down_revision: str | None = "20260729_0007"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("target_material_regions") as batch:
        batch.add_column(sa.Column("target_bulk_space_group_number", sa.Integer(), nullable=True))
        batch.create_check_constraint(
            "ck_target_regions_space_group_range",
            "target_bulk_space_group_number IS NULL OR "
            "target_bulk_space_group_number BETWEEN 1 AND 230",
        )
        batch.create_index(
            "ix_target_regions_bulk_space_group_number",
            ["target_bulk_space_group_number"],
        )


def downgrade() -> None:
    with op.batch_alter_table("target_material_regions") as batch:
        batch.drop_index("ix_target_regions_bulk_space_group_number")
        batch.drop_constraint("ck_target_regions_space_group_range", type_="check")
        batch.drop_column("target_bulk_space_group_number")
