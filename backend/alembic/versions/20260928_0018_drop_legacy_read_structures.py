"""Drop material assertions, sample state projections, process segments and precursor roles."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260928_0018"
down_revision: str | None = "20260928_0017"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

payload = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    for table in ("material_assertions", "sample_revision_states", "process_segments"):
        op.drop_table(table)
    with op.batch_alter_table("samples") as batch:
        for column in ("actual_state", "actual_material_summary", "identity_state"):
            batch.drop_index(f"ix_samples_{column}")
            batch.drop_column(column)
    with op.batch_alter_table("source_load_ingredients") as batch:
        batch.drop_index("ix_source_load_ingredients_function_role")
        batch.drop_column("function_role")
        batch.drop_column("process_roles")
        batch.drop_column("process_role_other")


def downgrade() -> None:
    with op.batch_alter_table("source_load_ingredients") as batch:
        batch.add_column(sa.Column("function_role", sa.String(64), nullable=True))
        batch.add_column(sa.Column("process_roles", payload, nullable=False, server_default="[]"))
        batch.add_column(sa.Column("process_role_other", sa.String(128), nullable=True))
        batch.create_index("ix_source_load_ingredients_function_role", ["function_role"])
    with op.batch_alter_table("samples") as batch:
        batch.add_column(
            sa.Column("actual_state", sa.String(32), nullable=False, server_default="unknown")
        )
        batch.add_column(sa.Column("actual_material_summary", sa.String(255), nullable=True))
        batch.add_column(
            sa.Column("identity_state", sa.String(32), nullable=False, server_default="unknown")
        )
        for column in ("actual_state", "actual_material_summary", "identity_state"):
            batch.create_index(f"ix_samples_{column}", [column])

    op.create_table(
        "process_segments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_revision_id", sa.Uuid(), nullable=False),
        sa.Column("segment_key", sa.String(64), nullable=False),
        sa.Column("segment_type", sa.String(64), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("start_s", sa.Float(), nullable=False),
        sa.Column("end_s", sa.Float(), nullable=False),
        sa.Column("label", sa.String(128), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.CheckConstraint("start_s >= 0", name="ck_process_segments_start_nonnegative"),
        sa.CheckConstraint("end_s > start_s", name="ck_process_segments_order"),
        sa.ForeignKeyConstraint(["run_revision_id"], ["run_revisions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "run_revision_id", "segment_key", name="uq_process_segments_revision_key"
        ),
    )
    op.create_index(
        "ix_process_segments_revision_sequence", "process_segments", ["run_revision_id", "sequence"]
    )
    op.create_index("ix_process_segments_segment_type", "process_segments", ["segment_type"])
    op.create_index("ix_process_segments_run_revision_id", "process_segments", ["run_revision_id"])

    op.create_table(
        "sample_revision_states",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("sample_id", sa.Uuid(), nullable=False),
        sa.Column("run_revision_id", sa.Uuid(), nullable=False),
        sa.Column("growth_state", sa.String(32), nullable=False, server_default="unknown"),
        sa.Column("identity_state", sa.String(32), nullable=False, server_default="unknown"),
        sa.Column("material_summary", sa.String(255), nullable=True),
        sa.Column("evidence_assertion_ids", payload, nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "growth_state IN ('unknown', 'present', 'absent', 'uncertain')",
            name="ck_sample_revision_states_growth",
        ),
        sa.CheckConstraint(
            "identity_state IN ('unknown', 'asserted', 'conflicting')",
            name="ck_sample_revision_states_identity",
        ),
        sa.ForeignKeyConstraint(["run_revision_id"], ["run_revisions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sample_id"], ["samples.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "sample_id", "run_revision_id", name="uq_sample_revision_states_sample_revision"
        ),
    )
    op.create_index("ix_sample_revision_states_sample_id", "sample_revision_states", ["sample_id"])
    op.create_index(
        "ix_sample_revision_states_run_revision_id", "sample_revision_states", ["run_revision_id"]
    )

    op.create_table(
        "material_assertions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("sample_id", sa.Uuid(), nullable=False),
        sa.Column("measurement_run_id", sa.Uuid(), nullable=False),
        sa.Column("analysis_run_id", sa.Uuid(), nullable=True),
        sa.Column("assertion_type", sa.String(64), nullable=False),
        sa.Column("value_json", payload, nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("validity", sa.String(32), nullable=False, server_default="active"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint(
            "assertion_type IN "
            "('growth_presence', 'phase_identity', 'composition', 'polytype', "
            "'stacking_order', 'orientation_relationship', 'layer_count')",
            name="ck_material_assertions_type",
        ),
        sa.CheckConstraint(
            "validity IN ('active', 'superseded', 'disputed')",
            name="ck_material_assertions_validity",
        ),
        sa.ForeignKeyConstraint(["analysis_run_id"], ["analysis_runs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["measurement_run_id"], ["characterization_records.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["sample_id"], ["samples.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_material_assertions_assertion_type", "material_assertions", ["assertion_type"]
    )
    op.create_index(
        "ix_material_assertions_sample_type", "material_assertions", ["sample_id", "assertion_type"]
    )
    for column in ("sample_id", "measurement_run_id", "analysis_run_id"):
        op.create_index(f"ix_material_assertions_{column}", "material_assertions", [column])
