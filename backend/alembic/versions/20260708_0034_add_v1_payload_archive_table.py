"""add v1 payload archive table

Revision ID: 20260708_0034
Revises: 20260708_0033
Create Date: 2026-07-08 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260708_0034"
down_revision: str | None = "20260708_0033"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _payload_type() -> sa.JSON:
    return sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    op.create_table(
        "experiment_module_payloads_v1_archive",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source_payload_id", sa.Uuid(), nullable=False),
        sa.Column("experiment_run_id", sa.Uuid(), nullable=False),
        sa.Column("module_key", sa.String(length=64), nullable=False),
        sa.Column("schema_version", sa.String(length=64), nullable=False),
        sa.Column("payload_json", _payload_type(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("source_created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "archived_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["experiment_run_id"], ["experiment_runs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_payload_id",
            name="uq_module_payloads_v1_archive_source_payload_id",
        ),
    )
    op.create_index(
        "ix_module_payloads_v1_archive_source_payload_id",
        "experiment_module_payloads_v1_archive",
        ["source_payload_id"],
        unique=False,
    )
    op.create_index(
        "ix_module_payloads_v1_archive_experiment_run_id",
        "experiment_module_payloads_v1_archive",
        ["experiment_run_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_module_payloads_v1_archive_experiment_run_id",
        table_name="experiment_module_payloads_v1_archive",
    )
    op.drop_index(
        "ix_module_payloads_v1_archive_source_payload_id",
        table_name="experiment_module_payloads_v1_archive",
    )
    op.drop_table("experiment_module_payloads_v1_archive")
