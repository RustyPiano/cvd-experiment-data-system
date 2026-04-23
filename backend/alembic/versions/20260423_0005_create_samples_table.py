"""create samples table

Revision ID: 20260423_0005
Revises: 20260423_0004
Create Date: 2026-04-23 03:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260423_0005"
down_revision: str | None = "20260423_0004"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    payload_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")
    op.create_table(
        "samples",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("sample_code", sa.String(length=64), nullable=False),
        sa.Column("experiment_run_id", sa.Uuid(), nullable=False),
        sa.Column("parent_sample_id", sa.Uuid(), nullable=True),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("substrate_type", sa.String(length=128), nullable=True),
        sa.Column("brand", sa.String(length=128), nullable=True),
        sa.Column("size_mm", sa.String(length=64), nullable=True),
        sa.Column("treatment", sa.Text(), nullable=True),
        sa.Column("position_mm", sa.Numeric(8, 2), nullable=True),
        sa.Column("storage_location", sa.String(length=128), nullable=True),
        sa.Column("metadata_json", payload_type, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["experiment_run_id"], ["experiment_runs.id"]),
        sa.ForeignKeyConstraint(["parent_sample_id"], ["samples.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_samples_experiment_run_id", "samples", ["experiment_run_id"], unique=False)
    op.create_index("ix_samples_role", "samples", ["role"], unique=False)
    op.create_index("ix_samples_sample_code", "samples", ["sample_code"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_samples_sample_code", table_name="samples")
    op.drop_index("ix_samples_role", table_name="samples")
    op.drop_index("ix_samples_experiment_run_id", table_name="samples")
    op.drop_table("samples")
