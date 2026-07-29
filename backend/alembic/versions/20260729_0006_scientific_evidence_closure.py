"""close revision evidence and process projection gaps

Revision ID: 20260729_0006
Revises: 20260729_0005
Create Date: 2026-07-29 22:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260729_0006"
down_revision: str | None = "20260729_0005"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None
payload = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    with op.batch_alter_table("samples") as batch:
        batch.add_column(
            sa.Column(
                "identity_state",
                sa.String(32),
                nullable=False,
                server_default="unknown",
            )
        )
        batch.create_index("ix_samples_identity_state", ["identity_state"])

    op.create_table(
        "sample_revision_states",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("sample_id", sa.Uuid(), nullable=False),
        sa.Column("run_revision_id", sa.Uuid(), nullable=False),
        sa.Column("growth_state", sa.String(32), nullable=False, server_default="unknown"),
        sa.Column("identity_state", sa.String(32), nullable=False, server_default="unknown"),
        sa.Column("material_summary", sa.String(255), nullable=True),
        sa.Column("evidence_assertion_ids", payload, nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "growth_state IN ('unknown', 'present', 'absent', 'uncertain')",
            name="ck_sample_revision_states_growth",
        ),
        sa.CheckConstraint(
            "identity_state IN ('unknown', 'asserted', 'conflicting')",
            name="ck_sample_revision_states_identity",
        ),
        sa.ForeignKeyConstraint(["run_revision_id"], ["run_revisions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sample_id"], ["samples.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "sample_id",
            "run_revision_id",
            name="uq_sample_revision_states_sample_revision",
        ),
    )
    op.create_index(
        "ix_sample_revision_states_sample_id",
        "sample_revision_states",
        ["sample_id"],
    )
    op.create_index(
        "ix_sample_revision_states_run_revision_id",
        "sample_revision_states",
        ["run_revision_id"],
    )

    with op.batch_alter_table("source_loads") as batch:
        batch.add_column(sa.Column("heating_zone_ref", sa.String(64), nullable=True))
        batch.drop_column("heating_channel")

    with op.batch_alter_table("process_channels") as batch:
        batch.drop_constraint(
            "uq_process_channels_revision_subject_source",
            type_="unique",
        )
        batch.add_column(sa.Column("subject_instance_ref", sa.String(128), nullable=True))
        batch.add_column(sa.Column("subject_snapshot_json", payload, nullable=True))
        batch.add_column(sa.Column("gas_species_code", sa.String(32), nullable=True))
        batch.add_column(sa.Column("gas_lot_id", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("gas_lot_version", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("gas_lot_snapshot_json", payload, nullable=True))
        batch.add_column(sa.Column("statistics_json", payload, nullable=True))
        batch.add_column(sa.Column("source_file_sha256", sa.String(64), nullable=True))
        batch.add_column(sa.Column("parser_version", sa.String(64), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE process_channels
            SET subject_instance_ref = subject_ref,
                gas_species_code = gas_species
            WHERE subject_instance_ref IS NULL
            """
        )
    )
    with op.batch_alter_table("process_channels") as batch:
        batch.alter_column(
            "subject_instance_ref",
            existing_type=sa.String(128),
            nullable=False,
        )
        batch.create_foreign_key(
            "fk_process_channels_gas_lot_id_material_lots",
            "material_lots",
            ["gas_lot_id"],
            ["id"],
        )
        batch.create_index("ix_process_channels_gas_lot_id", ["gas_lot_id"])
        batch.create_unique_constraint(
            "uq_process_channels_revision_instance_source",
            [
                "run_revision_id",
                "channel_type",
                "subject_instance_ref",
                "source_type",
            ],
        )
        batch.drop_column("sensor_or_controller_snapshot")
        batch.drop_column("gas_species")


def downgrade() -> None:
    with op.batch_alter_table("process_channels") as batch:
        batch.add_column(sa.Column("gas_species", sa.String(128), nullable=True))
        batch.add_column(sa.Column("sensor_or_controller_snapshot", payload, nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE process_channels
            SET gas_species = gas_species_code,
                sensor_or_controller_snapshot = subject_snapshot_json
            """
        )
    )
    with op.batch_alter_table("process_channels") as batch:
        batch.drop_constraint(
            "uq_process_channels_revision_instance_source",
            type_="unique",
        )
        batch.drop_index("ix_process_channels_gas_lot_id")
        batch.drop_constraint(
            "fk_process_channels_gas_lot_id_material_lots",
            type_="foreignkey",
        )
        batch.drop_column("parser_version")
        batch.drop_column("source_file_sha256")
        batch.drop_column("statistics_json")
        batch.drop_column("gas_lot_snapshot_json")
        batch.drop_column("gas_lot_version")
        batch.drop_column("gas_lot_id")
        batch.drop_column("gas_species_code")
        batch.drop_column("subject_snapshot_json")
        batch.drop_column("subject_instance_ref")
        batch.create_unique_constraint(
            "uq_process_channels_revision_subject_source",
            ["run_revision_id", "channel_type", "subject_ref", "source_type"],
        )
    with op.batch_alter_table("source_loads") as batch:
        batch.add_column(sa.Column("heating_channel", sa.String(128), nullable=True))
        batch.drop_column("heating_zone_ref")
    op.drop_index(
        "ix_sample_revision_states_run_revision_id",
        table_name="sample_revision_states",
    )
    op.drop_index(
        "ix_sample_revision_states_sample_id",
        table_name="sample_revision_states",
    )
    op.drop_table("sample_revision_states")
    with op.batch_alter_table("samples") as batch:
        batch.drop_index("ix_samples_identity_state")
        batch.drop_column("identity_state")
