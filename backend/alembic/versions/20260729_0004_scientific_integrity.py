"""fix transformation provenance and canonical process channels

Revision ID: 20260729_0004
Revises: 20260728_0003
Create Date: 2026-07-29 10:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260729_0004"
down_revision: str | None = "20260728_0003"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _json_type() -> sa.TypeEngine:
    return sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    payload = _json_type()
    with op.batch_alter_table("characterization_records") as batch:
        batch.create_check_constraint(
            "ck_characterization_records_scientific_identity",
            "run_revision_id IS NULL OR "
            "(performed_by_id IS NOT NULL AND measured_at IS NOT NULL "
            "AND sample_region IS NOT NULL AND method_instrument IS NOT NULL)",
        )
    with op.batch_alter_table("process_channels") as batch:
        batch.add_column(
            sa.Column("canonical_unit", sa.String(32), nullable=False, server_default="unknown")
        )
        batch.add_column(sa.Column("canonical_scalar_value", sa.Float(), nullable=True))
        batch.add_column(sa.Column("canonical_series_json", payload, nullable=True))
        batch.add_column(
            sa.Column(
                "projection_status",
                sa.String(32),
                nullable=False,
                server_default="unavailable",
            )
        )

    with op.batch_alter_table("source_loads") as batch:
        batch.add_column(sa.Column("container_snapshot_json", payload, nullable=True))
        batch.add_column(sa.Column("container_state_at_loading", sa.String(32), nullable=True))

    op.create_table(
        "sample_revision_associations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("sample_id", sa.Uuid(), nullable=False),
        sa.Column("run_revision_id", sa.Uuid(), nullable=False),
        sa.Column("sample_snapshot_json", payload, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["run_revision_id"], ["run_revisions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sample_id"], ["samples.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "sample_id",
            "run_revision_id",
            name="uq_sample_revision_associations_sample_revision",
        ),
    )
    op.create_index(
        "ix_sample_revision_associations_sample_id",
        "sample_revision_associations",
        ["sample_id"],
    )
    op.create_index(
        "ix_sample_revision_associations_run_revision_id",
        "sample_revision_associations",
        ["run_revision_id"],
    )

    with op.batch_alter_table("transformation_runs") as batch:
        batch.add_column(sa.Column("output_experiment_run_id", sa.Uuid(), nullable=True))
    op.execute(
        """
        UPDATE transformation_runs
        SET output_experiment_run_id = (
            SELECT samples.experiment_run_id
            FROM transformation_inputs
            JOIN samples ON samples.id = transformation_inputs.sample_id
            WHERE transformation_inputs.transformation_run_id = transformation_runs.id
            ORDER BY transformation_inputs.id
            LIMIT 1
        )
        """
    )
    missing_context = (
        op.get_bind()
        .execute(
            sa.text(
                "SELECT id FROM transformation_runs WHERE output_experiment_run_id IS NULL LIMIT 1"
            )
        )
        .scalar_one_or_none()
    )
    if missing_context is not None:
        raise RuntimeError(f"Transformation {missing_context} has no input sample")
    with op.batch_alter_table("transformation_runs") as batch:
        batch.alter_column("output_experiment_run_id", nullable=False)
        batch.create_foreign_key(
            "fk_transformation_runs_output_experiment_run_id",
            "experiment_runs",
            ["output_experiment_run_id"],
            ["id"],
        )
        batch.drop_index("ix_transformation_runs_run_revision_id")
        batch.drop_column("run_revision_id")
        batch.create_index(
            "ix_transformation_runs_output_experiment_run_id",
            ["output_experiment_run_id"],
        )

    with op.batch_alter_table("transformation_inputs") as batch:
        batch.add_column(sa.Column("run_revision_id", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("provenance_json", payload, nullable=False, server_default="{}"))
        batch.create_foreign_key(
            "fk_transformation_inputs_run_revision_id",
            "run_revisions",
            ["run_revision_id"],
            ["id"],
        )
        batch.create_index(
            "ix_transformation_inputs_run_revision_id",
            ["run_revision_id"],
        )
    op.execute(
        """
        UPDATE transformation_inputs
        SET run_revision_id = (
            SELECT samples.run_revision_id
            FROM samples
            WHERE samples.id = transformation_inputs.sample_id
        )
        """
    )


def downgrade() -> None:
    with op.batch_alter_table("characterization_records") as batch:
        batch.drop_constraint(
            "ck_characterization_records_scientific_identity",
            type_="check",
        )
    with op.batch_alter_table("transformation_runs") as batch:
        batch.add_column(sa.Column("run_revision_id", sa.Uuid(), nullable=True))
    op.execute(
        """
        UPDATE transformation_runs
        SET run_revision_id = (
            SELECT experiment_runs.current_revision_id
            FROM experiment_runs
            WHERE experiment_runs.id = transformation_runs.output_experiment_run_id
        )
        """
    )
    with op.batch_alter_table("transformation_runs") as batch:
        batch.alter_column("run_revision_id", nullable=False)
        batch.create_foreign_key(
            "fk_transformation_runs_run_revision_id",
            "run_revisions",
            ["run_revision_id"],
            ["id"],
        )
        batch.create_index("ix_transformation_runs_run_revision_id", ["run_revision_id"])
        batch.drop_index("ix_transformation_runs_output_experiment_run_id")
        batch.drop_constraint(
            "fk_transformation_runs_output_experiment_run_id",
            type_="foreignkey",
        )
        batch.drop_column("output_experiment_run_id")

    with op.batch_alter_table("transformation_inputs") as batch:
        batch.drop_index("ix_transformation_inputs_run_revision_id")
        batch.drop_constraint(
            "fk_transformation_inputs_run_revision_id",
            type_="foreignkey",
        )
        batch.drop_column("provenance_json")
        batch.drop_column("run_revision_id")

    with op.batch_alter_table("process_channels") as batch:
        batch.drop_column("projection_status")
        batch.drop_column("canonical_series_json")
        batch.drop_column("canonical_scalar_value")
        batch.drop_column("canonical_unit")

    op.drop_index(
        "ix_sample_revision_associations_run_revision_id",
        table_name="sample_revision_associations",
    )
    op.drop_index(
        "ix_sample_revision_associations_sample_id",
        table_name="sample_revision_associations",
    )
    op.drop_table("sample_revision_associations")

    with op.batch_alter_table("source_loads") as batch:
        batch.drop_column("container_state_at_loading")
        batch.drop_column("container_snapshot_json")
