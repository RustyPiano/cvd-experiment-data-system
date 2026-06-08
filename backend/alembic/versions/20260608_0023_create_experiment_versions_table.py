"""create experiment_versions table

Revision ID: 20260608_0023
Revises: 20260608_0022
Create Date: 2026-06-08 00:00:01.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260608_0023"
down_revision: str | None = "20260608_0022"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    payload_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")
    op.create_table(
        "experiment_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("experiment_run_id", sa.Uuid(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("snapshot_json", payload_type, nullable=False, server_default=sa.text("'{}'")),
        sa.Column("change_note", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["experiment_run_id"], ["experiment_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "experiment_run_id",
            "version_number",
            name="uq_experiment_version_number",
        ),
    )
    op.create_index(
        "ix_experiment_versions_experiment_run_id",
        "experiment_versions",
        ["experiment_run_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_experiment_versions_experiment_run_id",
        table_name="experiment_versions",
    )
    op.drop_table("experiment_versions")
