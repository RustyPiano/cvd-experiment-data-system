"""retire setup method template columns

Drops the unused source_template_key / source_template_version columns (the
setup-method-template source was removed) and renames is_same_as_template to
the source-neutral is_same_as_source.

Revision ID: 20260606_0021
Revises: 20260606_0020
Create Date: 2026-06-06 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260606_0021"
down_revision: str | None = "20260606_0020"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "experiment_setup_snapshots",
        "is_same_as_template",
        new_column_name="is_same_as_source",
    )
    op.drop_column("experiment_setup_snapshots", "source_template_version")
    op.drop_column("experiment_setup_snapshots", "source_template_key")


def downgrade() -> None:
    op.add_column(
        "experiment_setup_snapshots",
        sa.Column("source_template_key", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "experiment_setup_snapshots",
        sa.Column("source_template_version", sa.Integer(), nullable=True),
    )
    op.alter_column(
        "experiment_setup_snapshots",
        "is_same_as_source",
        new_column_name="is_same_as_template",
    )
