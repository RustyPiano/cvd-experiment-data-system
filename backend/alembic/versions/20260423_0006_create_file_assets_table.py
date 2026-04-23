"""create file assets table

Revision ID: 20260423_0006
Revises: 20260423_0005
Create Date: 2026-04-23 04:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260423_0006"
down_revision: str | None = "20260423_0005"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    payload_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")
    op.create_table(
        "file_assets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("experiment_run_id", sa.Uuid(), nullable=False),
        sa.Column("sample_id", sa.Uuid(), nullable=True),
        sa.Column("uploaded_by_id", sa.Uuid(), nullable=False),
        sa.Column("deleted_by_id", sa.Uuid(), nullable=True),
        sa.Column("original_name", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("file_kind", sa.String(length=64), nullable=True),
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
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["deleted_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["experiment_run_id"], ["experiment_runs.id"]),
        sa.ForeignKeyConstraint(["sample_id"], ["samples.id"]),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_file_assets_deleted_by_id", "file_assets", ["deleted_by_id"], unique=False)
    op.create_index(
        "ix_file_assets_experiment_run_id", "file_assets", ["experiment_run_id"], unique=False
    )
    op.create_index("ix_file_assets_file_kind", "file_assets", ["file_kind"], unique=False)
    op.create_index("ix_file_assets_sample_id", "file_assets", ["sample_id"], unique=False)
    op.create_index("ix_file_assets_sha256", "file_assets", ["sha256"], unique=False)
    op.create_index("ix_file_assets_storage_path", "file_assets", ["storage_path"], unique=True)
    op.create_index(
        "ix_file_assets_uploaded_by_id", "file_assets", ["uploaded_by_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_file_assets_uploaded_by_id", table_name="file_assets")
    op.drop_index("ix_file_assets_storage_path", table_name="file_assets")
    op.drop_index("ix_file_assets_sha256", table_name="file_assets")
    op.drop_index("ix_file_assets_sample_id", table_name="file_assets")
    op.drop_index("ix_file_assets_file_kind", table_name="file_assets")
    op.drop_index("ix_file_assets_experiment_run_id", table_name="file_assets")
    op.drop_index("ix_file_assets_deleted_by_id", table_name="file_assets")
    op.drop_table("file_assets")
