"""replace target coverage with product morphology details

Revision ID: 20260903_0012
Revises: 20260813_0011
Create Date: 2026-09-03 12:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260903_0012"
down_revision: str | None = "20260813_0011"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _rewrite_target_payloads(*, upgrade: bool) -> None:
    bind = op.get_bind()
    table = sa.Table("experiment_module_payloads", sa.MetaData(), autoload_with=bind)
    rows = bind.execute(
        sa.select(table.c.id, table.c.payload_json).where(table.c.module_key == "target_product")
    ).mappings()
    for row in rows:
        payload = row["payload_json"]
        if not isinstance(payload, dict):
            continue
        rewritten = dict(payload)
        if upgrade:
            coverage = rewritten.pop("coverage_state", None)
            rewritten.pop("orientation", None)
            if rewritten.get("dimensional_form") == "sheet":
                rewritten["dimensional_form"] = (
                    "continuous_film" if coverage == "continuous" else "discrete_planar_crystal"
                )
        else:
            dimensional_form = rewritten.get("dimensional_form")
            if dimensional_form == "continuous_film":
                rewritten["dimensional_form"] = "sheet"
                rewritten["coverage_state"] = "continuous"
            elif dimensional_form == "discrete_planar_crystal":
                rewritten["dimensional_form"] = "sheet"
                rewritten["coverage_state"] = "isolated"
            rewritten.pop("in_plane_outline", None)
        if rewritten != payload:
            bind.execute(
                table.update().where(table.c.id == row["id"]).values(payload_json=rewritten)
            )


def upgrade() -> None:
    with op.batch_alter_table("target_specs") as batch:
        batch.add_column(sa.Column("in_plane_outline", sa.String(64), nullable=True))
        batch.create_index("ix_target_specs_in_plane_outline", ["in_plane_outline"])

    op.execute(
        """
        UPDATE target_specs
        SET dimensional_form = CASE
            WHEN dimensional_form = 'sheet' AND coverage_state = 'continuous'
                THEN 'continuous_film'
            WHEN dimensional_form = 'sheet' THEN 'discrete_planar_crystal'
            ELSE dimensional_form
        END
        """
    )
    _rewrite_target_payloads(upgrade=True)

    with op.batch_alter_table("target_specs") as batch:
        batch.drop_index("ix_target_specs_coverage_state")
        batch.drop_index("ix_target_specs_orientation")
        batch.drop_column("coverage_state")
        batch.drop_column("orientation")


def downgrade() -> None:
    with op.batch_alter_table("target_specs") as batch:
        batch.add_column(sa.Column("coverage_state", sa.String(64), nullable=True))
        batch.add_column(sa.Column("orientation", sa.String(64), nullable=True))
        batch.create_index("ix_target_specs_coverage_state", ["coverage_state"])
        batch.create_index("ix_target_specs_orientation", ["orientation"])

    op.execute(
        """
        UPDATE target_specs
        SET coverage_state = CASE
                WHEN dimensional_form = 'continuous_film' THEN 'continuous'
                WHEN dimensional_form = 'discrete_planar_crystal' THEN 'isolated'
                ELSE NULL
            END,
            dimensional_form = CASE
                WHEN dimensional_form IN ('continuous_film', 'discrete_planar_crystal')
                    THEN 'sheet'
                ELSE dimensional_form
            END
        """
    )
    _rewrite_target_payloads(upgrade=False)

    with op.batch_alter_table("target_specs") as batch:
        batch.drop_index("ix_target_specs_in_plane_outline")
        batch.drop_column("in_plane_outline")
