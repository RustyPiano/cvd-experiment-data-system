"""allow symmetric solid-solution components

Revision ID: 20260730_0009
Revises: 20260730_0008
Create Date: 2026-07-30 20:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "20260730_0009"
down_revision: str | None = "20260730_0008"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _replace_relation_type_constraint(values: tuple[str, ...]) -> None:
    quoted = ", ".join(f"'{value}'" for value in values)
    with op.batch_alter_table("target_composition_relations") as batch:
        batch.drop_constraint("ck_target_composition_relation_type", type_="check")
        batch.create_check_constraint(
            "ck_target_composition_relation_type",
            f"relation_type IN ({quoted})",
        )


def upgrade() -> None:
    _replace_relation_type_constraint(
        (
            "doped_by",
            "substitutional_alloy",
            "solid_solution_component",
            "intercalated_by",
            "decorated_by",
        )
    )


def downgrade() -> None:
    _replace_relation_type_constraint(
        (
            "doped_by",
            "substitutional_alloy",
            "intercalated_by",
            "decorated_by",
        )
    )
