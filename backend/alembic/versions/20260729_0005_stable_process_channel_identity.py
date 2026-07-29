"""add stable process channel subject identity

Revision ID: 20260729_0005
Revises: 20260729_0004
Create Date: 2026-07-29 18:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260729_0005"
down_revision: str | None = "20260729_0004"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("process_channels") as batch:
        batch.add_column(sa.Column("subject_type", sa.String(32), nullable=True))
        batch.add_column(sa.Column("subject_ref", sa.String(128), nullable=True))
        batch.add_column(sa.Column("gas_species", sa.String(128), nullable=True))
        batch.add_column(sa.Column("zone_index", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("pressure_location", sa.String(128), nullable=True))
        batch.add_column(sa.Column("pressure_type", sa.String(32), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE process_channels
            SET subject_type = CASE
                    WHEN channel_type = 'temperature' THEN 'temperature_zone'
                    WHEN channel_type = 'flow' THEN 'gas_species'
                    WHEN channel_type = 'pressure' THEN 'pressure_location'
                    ELSE 'device'
                END,
                subject_ref = 'legacy:' || channel_key
            WHERE subject_type IS NULL OR subject_ref IS NULL
            """
        )
    )
    with op.batch_alter_table("process_channels") as batch:
        batch.alter_column("subject_type", existing_type=sa.String(32), nullable=False)
        batch.alter_column("subject_ref", existing_type=sa.String(128), nullable=False)
        batch.create_unique_constraint(
            "uq_process_channels_revision_subject_source",
            ["run_revision_id", "channel_type", "subject_ref", "source_type"],
        )


def downgrade() -> None:
    with op.batch_alter_table("process_channels") as batch:
        batch.drop_constraint(
            "uq_process_channels_revision_subject_source",
            type_="unique",
        )
        batch.drop_column("pressure_type")
        batch.drop_column("pressure_location")
        batch.drop_column("zone_index")
        batch.drop_column("gas_species")
        batch.drop_column("subject_ref")
        batch.drop_column("subject_type")
