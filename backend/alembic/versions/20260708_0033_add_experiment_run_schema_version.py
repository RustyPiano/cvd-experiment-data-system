"""add experiment run schema version

Revision ID: 20260708_0033
Revises: 20260708_0032
Create Date: 2026-07-08 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260708_0033"
down_revision: str | None = "20260708_0032"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("experiment_runs", sa.Column("schema_version", sa.String(64), nullable=True))
    op.create_index("ix_experiment_runs_schema_version", "experiment_runs", ["schema_version"])


def downgrade() -> None:
    op.drop_index("ix_experiment_runs_schema_version", table_name="experiment_runs")
    op.drop_column("experiment_runs", "schema_version")
