"""allow gas-cylinder lots without a single chemical formula

Revision ID: 20260813_0011
Revises: 20260812_0010
Create Date: 2026-08-13 12:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260813_0011"
down_revision: str | None = "20260812_0010"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _restore_sqlite_immutability_guards() -> None:
    if op.get_bind().dialect.name != "sqlite":
        return
    op.execute(
        """
        CREATE TRIGGER trg_material_lot_versions_immutable
        BEFORE UPDATE ON material_lot_versions
        BEGIN
            SELECT RAISE(ABORT, 'v2 entity version rows are immutable');
        END
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_material_lot_versions_immutable_delete
        BEFORE DELETE ON material_lot_versions
        BEGIN
            SELECT RAISE(ABORT, 'v2 entity version rows are immutable');
        END
        """
    )


def upgrade() -> None:
    with op.batch_alter_table("material_lot_versions") as batch:
        batch.alter_column(
            "chemical_formula",
            existing_type=sa.String(128),
            nullable=True,
        )
    _restore_sqlite_immutability_guards()


def downgrade() -> None:
    null_count = op.get_bind().scalar(
        sa.text("SELECT COUNT(*) FROM material_lot_versions WHERE chemical_formula IS NULL")
    )
    if null_count:
        raise RuntimeError(
            "cannot downgrade while gas-cylinder versions without a single formula exist"
        )
    with op.batch_alter_table("material_lot_versions") as batch:
        batch.alter_column(
            "chemical_formula",
            existing_type=sa.String(128),
            nullable=False,
        )
    _restore_sqlite_immutability_guards()
