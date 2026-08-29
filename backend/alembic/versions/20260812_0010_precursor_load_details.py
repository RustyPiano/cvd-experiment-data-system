"""add precursor roles, concentration, and substrate links

Revision ID: 20260812_0010
Revises: 20260730_0009
Create Date: 2026-08-12 18:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260812_0010"
down_revision: str | None = "20260730_0009"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None
payload = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    with op.batch_alter_table("source_loads") as batch:
        batch.add_column(
            sa.Column(
                "substrate_source_ids",
                payload,
                nullable=False,
                server_default="[]",
            )
        )

    with op.batch_alter_table("source_load_ingredients") as batch:
        batch.alter_column(
            "function_role",
            existing_type=sa.String(64),
            nullable=True,
        )
        batch.add_column(sa.Column("process_roles", payload, nullable=False, server_default="[]"))
        batch.add_column(sa.Column("process_role_other", sa.String(128), nullable=True))
        batch.add_column(sa.Column("concentration_value", sa.Float(), nullable=True))
        batch.add_column(sa.Column("concentration_unit", sa.String(32), nullable=True))
        batch.add_column(sa.Column("concentration_unit_other", sa.String(32), nullable=True))
        batch.create_check_constraint(
            "ck_source_ingredients_concentration_positive",
            "concentration_value IS NULL OR concentration_value > 0",
        )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE source_load_ingredients SET function_role = 'other' WHERE function_role IS NULL"
        )
    )
    with op.batch_alter_table("source_load_ingredients") as batch:
        batch.drop_constraint(
            "ck_source_ingredients_concentration_positive",
            type_="check",
        )
        batch.drop_column("concentration_unit_other")
        batch.drop_column("concentration_unit")
        batch.drop_column("concentration_value")
        batch.drop_column("process_role_other")
        batch.drop_column("process_roles")
        batch.alter_column(
            "function_role",
            existing_type=sa.String(64),
            nullable=False,
        )

    with op.batch_alter_table("source_loads") as batch:
        batch.drop_column("substrate_source_ids")
