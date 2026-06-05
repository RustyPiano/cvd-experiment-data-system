"""add setup library entries

Revision ID: 20260606_0020
Revises: 20260605_0019
Create Date: 2026-06-06 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260606_0020"
down_revision: str | None = "20260605_0019"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    payload_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")
    visibility_type = sa.Enum("private", "group", name="setup_visibility")
    op.create_table(
        "setup_library_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("visibility", visibility_type, nullable=False, server_default="private"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("institution", sa.String(length=128), nullable=True),
        sa.Column("apparatus_description", sa.Text(), nullable=False, server_default=""),
        sa.Column("methods_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("sample_placement_description", sa.Text(), nullable=False, server_default=""),
        sa.Column("reaction_flow_description", sa.Text(), nullable=False, server_default=""),
        sa.Column("reference_paper_url", sa.Text(), nullable=True),
        sa.Column("unpublished_reason", sa.Text(), nullable=True),
        sa.Column("diagram_storage_path", sa.String(length=1024), nullable=True),
        sa.Column("diagram_sha256", sa.String(length=64), nullable=True),
        sa.Column("diagram_content_type", sa.String(length=255), nullable=True),
        sa.Column("diagram_size_bytes", sa.Integer(), nullable=True),
        sa.Column("diagram_original_name", sa.String(length=255), nullable=True),
        sa.Column("content_hash", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("semantic_context", payload_type, nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_setup_library_entries_owner_id",
        "setup_library_entries",
        ["owner_id"],
        unique=False,
    )
    op.create_index(
        "ix_setup_library_entries_visibility",
        "setup_library_entries",
        ["visibility"],
        unique=False,
    )
    op.create_index(
        "ix_setup_library_entries_is_active",
        "setup_library_entries",
        ["is_active"],
        unique=False,
    )

    op.add_column(
        "experiment_setup_snapshots",
        sa.Column("source_setup_library_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        "ix_experiment_setup_snapshots_source_setup_library_id",
        "experiment_setup_snapshots",
        ["source_setup_library_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_experiment_setup_snapshots_source_setup_library_id",
        table_name="experiment_setup_snapshots",
    )
    op.drop_column("experiment_setup_snapshots", "source_setup_library_id")
    op.drop_index("ix_setup_library_entries_is_active", table_name="setup_library_entries")
    op.drop_index("ix_setup_library_entries_visibility", table_name="setup_library_entries")
    op.drop_index("ix_setup_library_entries_owner_id", table_name="setup_library_entries")
    op.drop_table("setup_library_entries")
    if op.get_bind().dialect.name == "postgresql":
        sa.Enum(name="setup_visibility").drop(op.get_bind(), checkfirst=True)
