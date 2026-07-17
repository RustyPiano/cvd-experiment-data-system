"""initial v2 schema

Revision ID: 20260711_0001
Revises:
Create Date: 2026-07-11 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260711_0001"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _payload_type() -> sa.JSON:
    return sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def _timestamps() -> tuple[sa.Column, sa.Column]:
    return (
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
    )


def upgrade() -> None:
    payload_type = _payload_type()

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "role",
            sa.Enum("admin", "member", name="user_role"),
            nullable=False,
            server_default="member",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_timestamps(),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "experiment_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_code", sa.String(length=32), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("schema_version", sa.String(length=64), nullable=False),
        sa.Column("material_system", sa.String(length=64), nullable=True),
        sa.Column("experiment_date", sa.Date(), nullable=False),
        sa.Column("objective", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("draft", "locked", "invalid", name="experiment_status"),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("invalid_reason", sa.Text(), nullable=True),
        *_timestamps(),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("setup_ref", sa.Uuid(), nullable=True),
        sa.Column("setup_ref_version", sa.Integer(), nullable=True),
        sa.Column("setup_ref_snapshot_json", payload_type, nullable=True),
        sa.Column("result_missing_todo", sa.Boolean(), nullable=True),
        sa.Column("not_characterized_by_id", sa.Uuid(), nullable=True),
        sa.Column("not_characterized_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["not_characterized_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_experiment_runs_experiment_date", "experiment_runs", ["experiment_date"])
    op.create_index("ix_experiment_runs_material_system", "experiment_runs", ["material_system"])
    op.create_index(
        "ix_experiment_runs_not_characterized_by_id",
        "experiment_runs",
        ["not_characterized_by_id"],
    )
    op.create_index("ix_experiment_runs_owner_id", "experiment_runs", ["owner_id"])
    op.create_index("ix_experiment_runs_run_code", "experiment_runs", ["run_code"], unique=True)
    op.create_index("ix_experiment_runs_schema_version", "experiment_runs", ["schema_version"])
    op.create_index("ix_experiment_runs_status", "experiment_runs", ["status"])

    op.create_table(
        "audit_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("before_json", sa.JSON(), nullable=True),
        sa.Column("after_json", sa.JSON(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_events_actor_id", "audit_events", ["actor_id"])
    op.create_index("ix_audit_events_entity_id", "audit_events", ["entity_id"])
    op.create_index("ix_audit_events_entity_type", "audit_events", ["entity_type"])
    op.create_index(
        "ix_audit_events_entity_type_entity_id",
        "audit_events",
        ["entity_type", "entity_id"],
    )

    op.create_table(
        "experiment_module_payloads",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("experiment_run_id", sa.Uuid(), nullable=False),
        sa.Column("module_key", sa.String(length=64), nullable=False),
        sa.Column("schema_version", sa.String(length=64), nullable=False, server_default="cvd_v2"),
        sa.Column("payload_json", payload_type, nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["experiment_run_id"], ["experiment_runs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("experiment_run_id", "module_key", name="uq_module_payload_run_key"),
    )
    op.create_index(
        "ix_experiment_module_payloads_experiment_run_id",
        "experiment_module_payloads",
        ["experiment_run_id"],
    )

    op.create_table(
        "samples",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("sample_code", sa.String(length=64), nullable=False),
        sa.Column("experiment_run_id", sa.Uuid(), nullable=False),
        sa.Column("parent_sample_id", sa.Uuid(), nullable=True),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("source_substrate_id", sa.Uuid(), nullable=True),
        sa.Column("source_substrate_snapshot_json", payload_type, nullable=True),
        sa.Column("metadata_json", payload_type, nullable=False),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["deleted_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["experiment_run_id"], ["experiment_runs.id"]),
        sa.ForeignKeyConstraint(["parent_sample_id"], ["samples.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "experiment_run_id",
            "source_substrate_id",
            name="uq_samples_run_source_substrate",
        ),
    )
    op.create_index("ix_samples_deleted_by_id", "samples", ["deleted_by_id"])
    op.create_index("ix_samples_experiment_run_id", "samples", ["experiment_run_id"])
    op.create_index("ix_samples_role", "samples", ["role"])
    op.create_index("ix_samples_sample_code", "samples", ["sample_code"], unique=True)
    op.create_index("ix_samples_source_substrate_id", "samples", ["source_substrate_id"])

    op.create_table(
        "material_lots",
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "material_lot_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("lot_category", sa.String(length=64), nullable=False),
        sa.Column("substance_name", sa.String(length=255), nullable=False),
        sa.Column("chemical_formula", sa.String(length=128), nullable=False),
        sa.Column("batch_number", sa.String(length=128), nullable=False),
        sa.Column("attrs", payload_type, nullable=False, server_default=sa.text("'{}'")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["entity_id"], ["material_lots.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entity_id", "version", name="uq_material_lot_versions_entity_version"),
    )
    op.create_index("ix_material_lot_versions_entity_id", "material_lot_versions", ["entity_id"])

    op.create_table(
        "setups",
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "setup_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("setup_code", sa.String(length=128), nullable=False),
        sa.Column("setup_name", sa.String(length=255), nullable=False),
        sa.Column("zone_count", sa.Integer(), nullable=False),
        sa.Column("orientation", sa.String(length=64), nullable=False),
        sa.Column("coordinate_system", sa.Text(), nullable=False),
        sa.Column("attrs", payload_type, nullable=False, server_default=sa.text("'{}'")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["entity_id"], ["setups.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entity_id", "version", name="uq_setup_versions_entity_version"),
    )
    op.create_index("ix_setup_versions_entity_id", "setup_versions", ["entity_id"])

    op.create_table(
        "instruments",
        sa.Column("id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "instrument_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("instrument_code", sa.String(length=128), nullable=False),
        sa.Column("name_type", sa.String(length=128), nullable=False),
        sa.Column("attrs", payload_type, nullable=False, server_default=sa.text("'{}'")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["entity_id"], ["instruments.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entity_id", "version", name="uq_instrument_versions_entity_version"),
    )
    op.create_index("ix_instrument_versions_entity_id", "instrument_versions", ["entity_id"])

    op.create_table(
        "characterization_records",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("experiment_run_id", sa.Uuid(), nullable=False),
        sa.Column("sample_id", sa.Uuid(), nullable=False),
        sa.Column("instrument_id", sa.Uuid(), nullable=True),
        sa.Column("instrument_version", sa.Integer(), nullable=True),
        sa.Column("instrument_snapshot_json", payload_type, nullable=True),
        sa.Column("method_instrument", sa.String(length=128), nullable=True),
        sa.Column("test_conditions", sa.Text(), nullable=True),
        sa.Column("raw_data", payload_type, nullable=True),
        sa.Column("attrs", payload_type, nullable=False, server_default=sa.text("'{}'")),
        *_timestamps(),
        sa.ForeignKeyConstraint(["experiment_run_id"], ["experiment_runs.id"]),
        sa.ForeignKeyConstraint(["instrument_id"], ["instruments.id"]),
        sa.ForeignKeyConstraint(["sample_id"], ["samples.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_characterization_records_experiment_run_id",
        "characterization_records",
        ["experiment_run_id"],
    )
    op.create_index(
        "ix_characterization_records_sample_id", "characterization_records", ["sample_id"]
    )

    op.create_table(
        "measured_products",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("sample_id", sa.Uuid(), nullable=False),
        sa.Column("characterization_record_id", sa.Uuid(), nullable=True),
        sa.Column("observed_phenomena", payload_type, nullable=True),
        sa.Column("detected_phase_stacking", sa.Text(), nullable=True),
        sa.Column("measured_layers_coverage", sa.Text(), nullable=True),
        sa.Column("domain_nucleation_continuity", sa.Text(), nullable=True),
        sa.Column("key_spectral_metrics", payload_type, nullable=True),
        sa.Column("attrs", payload_type, nullable=False, server_default=sa.text("'{}'")),
        *_timestamps(),
        sa.ForeignKeyConstraint(["characterization_record_id"], ["characterization_records.id"]),
        sa.ForeignKeyConstraint(["sample_id"], ["samples.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_measured_products_characterization_record_id",
        "measured_products",
        ["characterization_record_id"],
    )
    op.create_index("ix_measured_products_sample_id", "measured_products", ["sample_id"])

    op.create_table(
        "file_assets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("experiment_run_id", sa.Uuid(), nullable=False),
        sa.Column("sample_id", sa.Uuid(), nullable=True),
        sa.Column("characterization_record_id", sa.Uuid(), nullable=True),
        sa.Column("uploaded_by_id", sa.Uuid(), nullable=False),
        sa.Column("deleted_by_id", sa.Uuid(), nullable=True),
        sa.Column("original_name", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("method", sa.String(length=64), nullable=False),
        sa.Column("file_category", sa.String(length=32), nullable=False, server_default="raw"),
        sa.Column(
            "asset_role",
            sa.String(length=64),
            nullable=False,
            server_default="characterization_file",
        ),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("file_kind", sa.String(length=64), nullable=True),
        sa.Column("metadata_json", payload_type, nullable=False),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["characterization_record_id"], ["characterization_records.id"]),
        sa.ForeignKeyConstraint(["deleted_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["experiment_run_id"], ["experiment_runs.id"]),
        sa.ForeignKeyConstraint(["sample_id"], ["samples.id"]),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_path"),
    )
    for column, unique in (
        ("asset_role", False),
        ("characterization_record_id", False),
        ("deleted_by_id", False),
        ("experiment_run_id", False),
        ("file_category", False),
        ("file_kind", False),
        ("method", False),
        ("sample_id", False),
        ("sha256", False),
        ("uploaded_by_id", False),
    ):
        op.create_index(f"ix_file_assets_{column}", "file_assets", [column], unique=unique)


def downgrade() -> None:
    for table_name in (
        "file_assets",
        "measured_products",
        "characterization_records",
        "instrument_versions",
        "instruments",
        "setup_versions",
        "setups",
        "material_lot_versions",
        "material_lots",
        "samples",
        "experiment_module_payloads",
        "audit_events",
        "experiment_runs",
        "users",
    ):
        op.drop_table(table_name)

    bind = op.get_bind()
    sa.Enum("draft", "locked", "invalid", name="experiment_status").drop(bind, checkfirst=True)
    sa.Enum("admin", "member", name="user_role").drop(bind, checkfirst=True)
