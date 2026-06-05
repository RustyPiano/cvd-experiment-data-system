"""add setup methods v1

Revision ID: 20260605_0019
Revises: 20260513_0018
Create Date: 2026-06-05 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260605_0019"
down_revision: str | None = "20260513_0018"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "file_assets",
        sa.Column(
            "asset_role",
            sa.String(length=64),
            nullable=False,
            server_default="characterization_file",
        ),
    )
    op.create_index("ix_file_assets_asset_role", "file_assets", ["asset_role"], unique=False)
    if op.get_bind().dialect.name != "sqlite":
        op.alter_column("file_assets", "asset_role", server_default=None)

    payload_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")
    op.create_table(
        "experiment_setup_snapshots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("experiment_run_id", sa.Uuid(), nullable=False),
        sa.Column("source_template_key", sa.String(length=128), nullable=True),
        sa.Column("source_template_version", sa.Integer(), nullable=True),
        sa.Column("setup_key_snapshot", sa.String(length=160), nullable=True),
        sa.Column("setup_name_snapshot", sa.String(length=255), nullable=False),
        sa.Column("setup_version_snapshot", sa.Integer(), nullable=False),
        sa.Column("institution_snapshot", sa.String(length=128), nullable=True),
        sa.Column("apparatus_description_snapshot", sa.Text(), nullable=False),
        sa.Column("methods_text_snapshot", sa.Text(), nullable=False),
        sa.Column("sample_placement_description_snapshot", sa.Text(), nullable=False),
        sa.Column("reaction_flow_description_snapshot", sa.Text(), nullable=False),
        sa.Column("reference_paper_url_snapshot", sa.Text(), nullable=True),
        sa.Column("unpublished_reason_snapshot", sa.Text(), nullable=True),
        sa.Column("diagram_file_asset_id", sa.Uuid(), nullable=True),
        sa.Column("is_same_as_template", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deviation_note", sa.Text(), nullable=True),
        sa.Column("confirmed_by_id", sa.Uuid(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("snapshot_hash", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("metadata_json", payload_type, nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["confirmed_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["diagram_file_asset_id"], ["file_assets.id"]),
        sa.ForeignKeyConstraint(["experiment_run_id"], ["experiment_runs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("experiment_run_id", name="uq_setup_snapshot_experiment_run"),
    )
    op.create_index(
        "ix_experiment_setup_snapshots_experiment_run_id",
        "experiment_setup_snapshots",
        ["experiment_run_id"],
        unique=False,
    )
    op.create_index(
        "ix_experiment_setup_snapshots_setup_key_snapshot",
        "experiment_setup_snapshots",
        ["setup_key_snapshot"],
        unique=False,
    )
    op.create_index(
        "ix_experiment_setup_snapshots_diagram_file_asset_id",
        "experiment_setup_snapshots",
        ["diagram_file_asset_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_experiment_setup_snapshots_diagram_file_asset_id",
        table_name="experiment_setup_snapshots",
    )
    op.drop_index(
        "ix_experiment_setup_snapshots_setup_key_snapshot",
        table_name="experiment_setup_snapshots",
    )
    op.drop_index(
        "ix_experiment_setup_snapshots_experiment_run_id",
        table_name="experiment_setup_snapshots",
    )
    op.drop_table("experiment_setup_snapshots")
    op.drop_index("ix_file_assets_asset_role", table_name="file_assets")
    op.drop_column("file_assets", "asset_role")
