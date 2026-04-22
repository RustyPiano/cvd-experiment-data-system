"""create experiment runs table

Revision ID: 20260423_0002
Revises: 20260423_0001
Create Date: 2026-04-23 00:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260423_0002"
down_revision: str | None = "20260423_0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "experiment_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_code", sa.String(length=32), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=True),
        sa.Column("template_version_id", sa.Uuid(), nullable=True),
        sa.Column("recipe_id", sa.Uuid(), nullable=True),
        sa.Column("derived_from_run_id", sa.Uuid(), nullable=True),
        sa.Column("experiment_type", sa.String(length=64), nullable=False),
        sa.Column("material_system", sa.String(length=64), nullable=True),
        sa.Column("experiment_date", sa.Date(), nullable=False),
        sa.Column("objective", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("draft", "submitted", "locked", "invalid", name="experiment_status"),
            nullable=False,
            server_default="draft",
        ),
        sa.Column(
            "quality_label",
            sa.Enum("success", "partial", "failed", "unknown", name="quality_label"),
            nullable=False,
            server_default="unknown",
        ),
        sa.Column("summary_result", sa.Text(), nullable=True),
        sa.Column("invalid_reason", sa.Text(), nullable=True),
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
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["derived_from_run_id"], ["experiment_runs.id"]),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_experiment_runs_date", "experiment_runs", ["experiment_date"], unique=False)
    op.create_index(
        "ix_experiment_runs_material",
        "experiment_runs",
        ["material_system"],
        unique=False,
    )
    op.create_index("ix_experiment_runs_owner", "experiment_runs", ["owner_id"], unique=False)
    op.create_index("ix_experiment_runs_run_code", "experiment_runs", ["run_code"], unique=True)
    op.create_index("ix_experiment_runs_status", "experiment_runs", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_experiment_runs_status", table_name="experiment_runs")
    op.drop_index("ix_experiment_runs_run_code", table_name="experiment_runs")
    op.drop_index("ix_experiment_runs_owner", table_name="experiment_runs")
    op.drop_index("ix_experiment_runs_material", table_name="experiment_runs")
    op.drop_index("ix_experiment_runs_date", table_name="experiment_runs")
    op.drop_table("experiment_runs")
    sa.Enum("success", "partial", "failed", "unknown", name="quality_label").drop(
        op.get_bind(),
        checkfirst=True,
    )
    sa.Enum("draft", "submitted", "locked", "invalid", name="experiment_status").drop(
        op.get_bind(),
        checkfirst=True,
    )
