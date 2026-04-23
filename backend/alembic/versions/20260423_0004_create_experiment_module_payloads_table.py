"""create experiment module payloads table

Revision ID: 20260423_0004
Revises: 20260423_0003
Create Date: 2026-04-23 02:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260423_0004"
down_revision: str | None = "20260423_0003"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    payload_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")
    op.create_table(
        "experiment_module_payloads",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("experiment_run_id", sa.Uuid(), nullable=False),
        sa.Column("module_key", sa.String(length=64), nullable=False),
        sa.Column("schema_version", sa.String(length=64), nullable=False, server_default="cvd_v1"),
        sa.Column("payload_json", payload_type, nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("experiment_run_id", "module_key", name="uq_module_payload_run_key"),
    )
    op.create_index(
        "ix_experiment_module_payloads_experiment_run_id",
        "experiment_module_payloads",
        ["experiment_run_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_experiment_module_payloads_experiment_run_id",
        table_name="experiment_module_payloads",
    )
    op.drop_table("experiment_module_payloads")
