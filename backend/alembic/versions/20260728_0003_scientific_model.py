"""add orthogonal scientific model and immutable run revisions

Revision ID: 20260728_0003
Revises: 20260728_0002
Create Date: 2026-07-28 12:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260728_0003"
down_revision: str | None = "20260728_0002"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _json_type() -> sa.TypeEngine:
    return sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def _id() -> sa.Column:
    return sa.Column("id", sa.Uuid(), nullable=False)


def _created_at() -> sa.Column:
    return sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("CURRENT_TIMESTAMP"),
    )


def _updated_at() -> sa.Column:
    return sa.Column(
        "updated_at",
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("CURRENT_TIMESTAMP"),
    )


def _index_foreign_keys() -> None:
    indexes = {
        "analysis_runs": ("measurement_run_id", "performed_by_id"),
        "commercial_products": ("substance_id",),
        "container_instances": ("material_lot_id",),
        "data_derivation_edges": ("analysis_run_id", "file_asset_id"),
        "equipment_lifecycle_events": ("component_id", "certificate_file_id"),
        "instrument_capabilities": ("instrument_version_id",),
        "instrument_lifecycle_events": ("instrument_id", "certificate_file_id"),
        "material_assertions": (
            "sample_id",
            "measurement_run_id",
            "analysis_run_id",
        ),
        "parser_results": ("file_asset_id",),
        "process_channels": ("run_revision_id", "file_asset_id"),
        "process_segments": ("run_revision_id",),
        "property_values": (
            "sample_id",
            "measurement_run_id",
            "analysis_run_id",
        ),
        "run_contributors": ("run_revision_id", "user_id"),
        "run_features": ("run_revision_id",),
        "run_revisions": (
            "experiment_run_id",
            "supersedes_revision_id",
            "locked_by_id",
            "reviewed_by_id",
        ),
        "scientific_process_events": ("run_revision_id",),
        "setup_version_components": ("setup_version_id", "component_id"),
        "source_load_ingredients": ("source_load_id", "material_lot_id"),
        "source_loads": ("run_revision_id", "container_instance_id"),
        "substrate_layers": ("substrate_stack_id", "supplier_lot_id"),
        "substrate_stacks": ("material_lot_version_id",),
        "target_composition_relations": (
            "target_spec_id",
            "host_region_id",
        ),
        "target_material_regions": ("target_spec_id",),
        "target_specs": ("run_revision_id",),
        "transformation_inputs": ("transformation_run_id", "sample_id"),
        "transformation_outputs": ("transformation_run_id", "sample_id"),
        "transformation_runs": ("run_revision_id", "operator_id"),
    }
    for table, columns in indexes.items():
        for column in columns:
            op.create_index(f"ix_{table}_{column}", table, [column])


def upgrade() -> None:
    payload = _json_type()
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE experiment_status ADD VALUE IF NOT EXISTS 'reviewed'")
    else:
        with op.batch_alter_table("experiment_runs") as batch:
            batch.alter_column(
                "status",
                existing_type=sa.String(length=7),
                type_=sa.Enum(
                    "draft",
                    "locked",
                    "reviewed",
                    "invalid",
                    name="experiment_status",
                    native_enum=False,
                ),
                existing_nullable=False,
                existing_server_default="draft",
            )

    op.create_table(
        "substances",
        _id(),
        sa.Column("canonical_name", sa.String(255), nullable=False),
        sa.Column("chemical_formula", sa.String(128), nullable=True),
        sa.Column("synonyms", payload, nullable=False),
        sa.Column("identifiers", payload, nullable=False),
        _created_at(),
        _updated_at(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_substances_canonical_name", "substances", ["canonical_name"])
    op.create_index("ix_substances_chemical_formula", "substances", ["chemical_formula"])

    op.create_table(
        "commercial_products",
        _id(),
        sa.Column("substance_id", sa.Uuid(), nullable=True),
        sa.Column("supplier", sa.String(255), nullable=False),
        sa.Column("catalog_number", sa.String(128), nullable=False),
        sa.Column("declared_grade", sa.String(128), nullable=True),
        sa.Column("specification_json", payload, nullable=False),
        _created_at(),
        _updated_at(),
        sa.ForeignKeyConstraint(["substance_id"], ["substances.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "supplier",
            "catalog_number",
            name="uq_commercial_products_supplier_catalog",
        ),
    )
    op.create_index("ix_commercial_products_supplier", "commercial_products", ["supplier"])
    op.create_index(
        "ix_commercial_products_catalog_number",
        "commercial_products",
        ["catalog_number"],
    )

    with op.batch_alter_table("material_lots") as batch:
        batch.add_column(sa.Column("substance_id", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("commercial_product_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key(
            "fk_material_lots_substance_id",
            "substances",
            ["substance_id"],
            ["id"],
        )
        batch.create_foreign_key(
            "fk_material_lots_commercial_product_id",
            "commercial_products",
            ["commercial_product_id"],
            ["id"],
        )
        batch.create_index("ix_material_lots_substance_id", ["substance_id"])
        batch.create_index("ix_material_lots_commercial_product_id", ["commercial_product_id"])

    op.create_table(
        "container_instances",
        _id(),
        sa.Column("material_lot_id", sa.Uuid(), nullable=False),
        sa.Column("container_code", sa.String(128), nullable=False),
        sa.Column("container_type", sa.String(64), nullable=False),
        sa.Column("opened_date", sa.Date(), nullable=True),
        sa.Column("storage_history", payload, nullable=False),
        sa.Column("remaining_amount", sa.Float(), nullable=True),
        sa.Column("remaining_unit", sa.String(32), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="available"),
        sa.Column("attrs", payload, nullable=False),
        _created_at(),
        _updated_at(),
        sa.CheckConstraint(
            "remaining_amount IS NULL OR remaining_amount >= 0",
            name="ck_container_instances_remaining_amount",
        ),
        sa.CheckConstraint(
            "status IN ('available', 'in_use', 'empty', 'quarantined', 'disposed')",
            name="ck_container_instances_status",
        ),
        sa.ForeignKeyConstraint(["material_lot_id"], ["material_lots.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("container_code", name="uq_container_instances_code"),
    )
    op.create_index(
        "ix_container_instances_container_code", "container_instances", ["container_code"]
    )
    op.create_index(
        "ix_container_instances_container_type", "container_instances", ["container_type"]
    )
    op.create_index("ix_container_instances_status", "container_instances", ["status"])

    op.create_table(
        "substrate_stacks",
        _id(),
        sa.Column("material_lot_version_id", sa.Uuid(), nullable=False),
        sa.Column("top_surface", sa.String(128), nullable=True),
        _created_at(),
        sa.ForeignKeyConstraint(
            ["material_lot_version_id"],
            ["material_lot_versions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "material_lot_version_id",
            name="uq_substrate_stacks_material_lot_version",
        ),
    )
    op.create_table(
        "substrate_layers",
        _id(),
        sa.Column("substrate_stack_id", sa.Uuid(), nullable=False),
        sa.Column("layer_index", sa.Integer(), nullable=False),
        sa.Column("material_name", sa.String(255), nullable=False),
        sa.Column("chemical_formula", sa.String(128), nullable=True),
        sa.Column("thickness_nm", sa.Float(), nullable=True),
        sa.Column("orientation", sa.String(128), nullable=True),
        sa.Column("supplier_lot_id", sa.Uuid(), nullable=True),
        sa.CheckConstraint("layer_index >= 1", name="ck_substrate_layers_index_positive"),
        sa.CheckConstraint(
            "thickness_nm IS NULL OR thickness_nm > 0",
            name="ck_substrate_layers_thickness_positive",
        ),
        sa.ForeignKeyConstraint(
            ["substrate_stack_id"],
            ["substrate_stacks.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["supplier_lot_id"], ["material_lots.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "substrate_stack_id",
            "layer_index",
            name="uq_substrate_layers_stack_index",
        ),
    )

    op.create_table(
        "equipment_component_instances",
        _id(),
        sa.Column("component_code", sa.String(128), nullable=False),
        sa.Column("component_type", sa.String(64), nullable=False),
        sa.Column("manufacturer", sa.String(255), nullable=True),
        sa.Column("model", sa.String(128), nullable=True),
        sa.Column("serial_number", sa.String(128), nullable=True),
        sa.Column("attrs", payload, nullable=False),
        _created_at(),
        _updated_at(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("component_code", name="uq_equipment_components_code"),
    )
    for column in ("component_code", "component_type", "serial_number"):
        op.create_index(
            f"ix_equipment_component_instances_{column}", "equipment_component_instances", [column]
        )

    op.create_table(
        "setup_version_components",
        _id(),
        sa.Column("setup_version_id", sa.Uuid(), nullable=False),
        sa.Column("component_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(64), nullable=False),
        sa.Column("position_json", payload, nullable=True),
        sa.ForeignKeyConstraint(
            ["setup_version_id"],
            ["setup_versions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["component_id"], ["equipment_component_instances.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "setup_version_id",
            "component_id",
            "role",
            name="uq_setup_version_components_binding",
        ),
    )
    op.create_table(
        "equipment_lifecycle_events",
        _id(),
        sa.Column("component_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(32), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("quantity", sa.String(128), nullable=True),
        sa.Column("correction", sa.Float(), nullable=True),
        sa.Column("expanded_uncertainty", sa.Float(), nullable=True),
        sa.Column("details_json", payload, nullable=False),
        sa.Column("certificate_file_id", sa.Uuid(), nullable=True),
        sa.CheckConstraint(
            "event_type IN ('install', 'remove', 'calibration', 'maintenance')",
            name="ck_equipment_lifecycle_events_type",
        ),
        sa.ForeignKeyConstraint(["certificate_file_id"], ["file_assets.id"]),
        sa.ForeignKeyConstraint(["component_id"], ["equipment_component_instances.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_equipment_events_component_time",
        "equipment_lifecycle_events",
        ["component_id", "occurred_at"],
    )
    op.create_index(
        "ix_equipment_lifecycle_events_event_type", "equipment_lifecycle_events", ["event_type"]
    )

    op.create_table(
        "instrument_capabilities",
        _id(),
        sa.Column("instrument_version_id", sa.Uuid(), nullable=False),
        sa.Column("capability_code", sa.String(128), nullable=False),
        sa.Column("configuration_json", payload, nullable=False),
        sa.ForeignKeyConstraint(
            ["instrument_version_id"],
            ["instrument_versions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "instrument_version_id",
            "capability_code",
            name="uq_instrument_capabilities_version_code",
        ),
    )
    op.create_index(
        "ix_instrument_capabilities_capability_code", "instrument_capabilities", ["capability_code"]
    )
    op.create_table(
        "instrument_lifecycle_events",
        _id(),
        sa.Column("instrument_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(32), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("affected_component", sa.String(128), nullable=True),
        sa.Column("quantity", sa.String(128), nullable=True),
        sa.Column("correction", sa.Float(), nullable=True),
        sa.Column("expanded_uncertainty", sa.Float(), nullable=True),
        sa.Column("details_json", payload, nullable=False),
        sa.Column("certificate_file_id", sa.Uuid(), nullable=True),
        sa.CheckConstraint(
            "event_type IN ('calibration', 'maintenance')",
            name="ck_instrument_lifecycle_events_type",
        ),
        sa.ForeignKeyConstraint(["certificate_file_id"], ["file_assets.id"]),
        sa.ForeignKeyConstraint(["instrument_id"], ["instruments.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_instrument_events_instrument_time",
        "instrument_lifecycle_events",
        ["instrument_id", "occurred_at"],
    )

    op.create_table(
        "run_revisions",
        _id(),
        sa.Column("experiment_run_id", sa.Uuid(), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("supersedes_revision_id", sa.Uuid(), nullable=True),
        sa.Column("schema_version", sa.String(64), nullable=False),
        sa.Column("schema_status", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="locked"),
        sa.Column("content_json", payload, nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("correction_reason", sa.Text(), nullable=True),
        sa.Column("locked_by_id", sa.Uuid(), nullable=False),
        sa.Column("reviewed_by_id", sa.Uuid(), nullable=True),
        sa.Column(
            "locked_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("superseded_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("revision_number >= 1", name="ck_run_revisions_number_positive"),
        sa.CheckConstraint(
            "status IN ('locked', 'reviewed', 'superseded')",
            name="ck_run_revisions_status",
        ),
        sa.ForeignKeyConstraint(["experiment_run_id"], ["experiment_runs.id"]),
        sa.ForeignKeyConstraint(["locked_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["reviewed_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["supersedes_revision_id"], ["run_revisions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "experiment_run_id",
            "revision_number",
            name="uq_run_revisions_run_number",
        ),
    )
    for column in ("schema_version", "status", "content_sha256"):
        op.create_index(f"ix_run_revisions_{column}", "run_revisions", [column])
    op.create_index(
        "ix_run_revisions_run_status",
        "run_revisions",
        ["experiment_run_id", "status"],
    )

    with op.batch_alter_table("experiment_runs") as batch:
        batch.add_column(sa.Column("current_revision_id", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("draft_supersedes_revision_id", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("correction_reason", sa.Text(), nullable=True))
        batch.create_foreign_key(
            "fk_experiment_runs_current_revision_id",
            "run_revisions",
            ["current_revision_id"],
            ["id"],
        )
        batch.create_foreign_key(
            "fk_experiment_runs_draft_supersedes_revision_id",
            "run_revisions",
            ["draft_supersedes_revision_id"],
            ["id"],
        )
        batch.create_index("ix_experiment_runs_current_revision_id", ["current_revision_id"])
        batch.create_index(
            "ix_experiment_runs_draft_supersedes_revision_id",
            ["draft_supersedes_revision_id"],
        )

    op.create_table(
        "run_contributors",
        _id(),
        sa.Column("run_revision_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("contribution_role", sa.String(128), nullable=True),
        sa.Column("user_snapshot_json", payload, nullable=False),
        sa.CheckConstraint(
            "role IN ('performed_by', 'recorded_by', 'reviewed_by')",
            name="ck_run_contributors_role",
        ),
        sa.ForeignKeyConstraint(["run_revision_id"], ["run_revisions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "run_revision_id",
            "user_id",
            "role",
            name="uq_run_contributors_revision_user_role",
        ),
    )

    op.create_table(
        "target_specs",
        _id(),
        sa.Column("run_revision_id", sa.Uuid(), nullable=False),
        sa.Column("architecture_type", sa.String(64), nullable=False),
        sa.Column("dimensional_form", sa.String(64), nullable=True),
        sa.Column("coverage_state", sa.String(64), nullable=True),
        sa.Column("orientation", sa.String(64), nullable=True),
        sa.Column("optimization_objective", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["run_revision_id"], ["run_revisions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "run_revision_id",
            name="uq_target_specs_run_revision",
        ),
    )
    for column in ("architecture_type", "dimensional_form", "coverage_state", "orientation"):
        op.create_index(f"ix_target_specs_{column}", "target_specs", [column])
    op.create_table(
        "target_material_regions",
        _id(),
        sa.Column("target_spec_id", sa.Uuid(), nullable=False),
        sa.Column("region_key", sa.String(64), nullable=False),
        sa.Column("formula", sa.String(128), nullable=False),
        sa.Column("spatial_role", sa.String(64), nullable=False),
        sa.Column("layer_index", sa.Integer(), nullable=True),
        sa.Column("lateral_region", sa.String(128), nullable=True),
        sa.Column("target_layer_count", sa.Integer(), nullable=True),
        sa.Column("target_bulk_phase", sa.String(128), nullable=True),
        sa.Column("attrs", payload, nullable=False),
        sa.CheckConstraint(
            "target_layer_count IS NULL OR target_layer_count >= 1",
            name="ck_target_regions_layer_count_positive",
        ),
        sa.ForeignKeyConstraint(["target_spec_id"], ["target_specs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("target_spec_id", "region_key", name="uq_target_regions_spec_key"),
    )
    op.create_index("ix_target_regions_formula", "target_material_regions", ["formula"])
    op.create_table(
        "target_composition_relations",
        _id(),
        sa.Column("target_spec_id", sa.Uuid(), nullable=False),
        sa.Column("host_region_id", sa.Uuid(), nullable=False),
        sa.Column("relation_type", sa.String(64), nullable=False),
        sa.Column("species", sa.String(128), nullable=False),
        sa.Column("nominal_value", sa.Float(), nullable=True),
        sa.Column("value_basis", sa.String(32), nullable=False),
        sa.Column("site_or_location", sa.String(128), nullable=True),
        sa.CheckConstraint(
            "relation_type IN "
            "('doped_by', 'substitutional_alloy', 'intercalated_by', 'decorated_by')",
            name="ck_target_composition_relation_type",
        ),
        sa.CheckConstraint(
            "value_basis IN "
            "('at_percent', 'mol_fraction', 'site_fraction', 'ratio', 'unspecified')",
            name="ck_target_composition_value_basis",
        ),
        sa.ForeignKeyConstraint(
            ["host_region_id"],
            ["target_material_regions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["target_spec_id"], ["target_specs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_target_composition_relations_relation_type",
        "target_composition_relations",
        ["relation_type"],
    )
    op.create_index(
        "ix_target_composition_relations_species",
        "target_composition_relations",
        ["species"],
    )

    op.create_table(
        "source_loads",
        _id(),
        sa.Column("run_revision_id", sa.Uuid(), nullable=False),
        sa.Column("load_key", sa.String(64), nullable=False),
        sa.Column("container_instance_id", sa.Uuid(), nullable=True),
        sa.Column("loading_method", sa.String(64), nullable=False),
        sa.Column("preparation_steps", payload, nullable=False),
        sa.Column("initial_position", payload, nullable=True),
        sa.Column("position_program", payload, nullable=False),
        sa.Column("heating_channel", sa.String(128), nullable=True),
        sa.Column("attrs", payload, nullable=False),
        sa.ForeignKeyConstraint(["container_instance_id"], ["container_instances.id"]),
        sa.ForeignKeyConstraint(["run_revision_id"], ["run_revisions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_revision_id", "load_key", name="uq_source_loads_revision_key"),
    )
    op.create_table(
        "source_load_ingredients",
        _id(),
        sa.Column("source_load_id", sa.Uuid(), nullable=False),
        sa.Column("material_lot_id", sa.Uuid(), nullable=False),
        sa.Column("material_lot_version", sa.Integer(), nullable=False),
        sa.Column("material_snapshot_json", payload, nullable=False),
        sa.Column("function_role", sa.String(64), nullable=False),
        sa.Column("amount", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(32), nullable=True),
        sa.Column("composition_basis", sa.String(64), nullable=True),
        sa.Column("uncertainty", sa.Float(), nullable=True),
        sa.Column("attrs", payload, nullable=False),
        sa.CheckConstraint("amount IS NULL OR amount >= 0", name="ck_source_ingredients_amount"),
        sa.CheckConstraint(
            "uncertainty IS NULL OR uncertainty >= 0",
            name="ck_source_ingredients_uncertainty",
        ),
        sa.ForeignKeyConstraint(["material_lot_id"], ["material_lots.id"]),
        sa.ForeignKeyConstraint(["source_load_id"], ["source_loads.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_source_ingredients_lot_version",
        "source_load_ingredients",
        ["material_lot_id", "material_lot_version"],
    )
    op.create_index(
        "ix_source_load_ingredients_function_role",
        "source_load_ingredients",
        ["function_role"],
    )

    op.create_table(
        "process_segments",
        _id(),
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
            "run_revision_id",
            "segment_key",
            name="uq_process_segments_revision_key",
        ),
    )
    op.create_index(
        "ix_process_segments_revision_sequence",
        "process_segments",
        ["run_revision_id", "sequence"],
    )
    op.create_index("ix_process_segments_segment_type", "process_segments", ["segment_type"])
    op.create_table(
        "process_channels",
        _id(),
        sa.Column("run_revision_id", sa.Uuid(), nullable=False),
        sa.Column("channel_key", sa.String(128), nullable=False),
        sa.Column("channel_type", sa.String(64), nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False),
        sa.Column("unit", sa.String(32), nullable=False),
        sa.Column("data_kind", sa.String(32), nullable=False),
        sa.Column("scalar_value", sa.Float(), nullable=True),
        sa.Column("series_json", payload, nullable=True),
        sa.Column("file_asset_id", sa.Uuid(), nullable=True),
        sa.Column("sensor_or_controller_snapshot", payload, nullable=True),
        sa.CheckConstraint(
            "source_type IN ('setpoint', 'measured', 'inferred')",
            name="ck_process_channels_source_type",
        ),
        sa.CheckConstraint(
            "data_kind IN ('scalar', 'interval_series', 'timeseries_file')",
            name="ck_process_channels_data_kind",
        ),
        sa.ForeignKeyConstraint(["file_asset_id"], ["file_assets.id"]),
        sa.ForeignKeyConstraint(["run_revision_id"], ["run_revisions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "run_revision_id",
            "channel_key",
            name="uq_process_channels_revision_key",
        ),
    )
    op.create_index(
        "ix_process_channels_revision_type",
        "process_channels",
        ["run_revision_id", "channel_type"],
    )
    op.create_index("ix_process_channels_channel_type", "process_channels", ["channel_type"])
    op.create_table(
        "scientific_process_events",
        _id(),
        sa.Column("run_revision_id", sa.Uuid(), nullable=False),
        sa.Column("event_key", sa.String(64), nullable=False),
        sa.Column("start_s", sa.Float(), nullable=False),
        sa.Column("end_s", sa.Float(), nullable=True),
        sa.Column("affected_objects", payload, nullable=False),
        sa.Column("observed_deviations", payload, nullable=False),
        sa.Column("suspected_causes", payload, nullable=False),
        sa.Column("intervention_actions", payload, nullable=False),
        sa.Column("outcome", sa.String(64), nullable=True),
        sa.Column("data_validity_impact", sa.String(64), nullable=True),
        sa.Column("excluded_time_ranges", payload, nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("attachment_file_ids", payload, nullable=False),
        sa.CheckConstraint("start_s >= 0", name="ck_scientific_events_start_nonnegative"),
        sa.CheckConstraint(
            "end_s IS NULL OR end_s >= start_s",
            name="ck_scientific_events_order",
        ),
        sa.ForeignKeyConstraint(["run_revision_id"], ["run_revisions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "run_revision_id",
            "event_key",
            name="uq_process_events_revision_key",
        ),
    )
    op.create_index(
        "ix_scientific_events_revision_start",
        "scientific_process_events",
        ["run_revision_id", "start_s"],
    )
    op.create_index(
        "ix_scientific_process_events_outcome", "scientific_process_events", ["outcome"]
    )
    op.create_index(
        "ix_scientific_process_events_data_validity_impact",
        "scientific_process_events",
        ["data_validity_impact"],
    )

    with op.batch_alter_table("samples") as batch:
        batch.add_column(sa.Column("run_revision_id", sa.Uuid(), nullable=True))
        batch.add_column(
            sa.Column("actual_state", sa.String(32), nullable=False, server_default="unknown")
        )
        batch.add_column(sa.Column("actual_material_summary", sa.String(255), nullable=True))
        batch.add_column(sa.Column("current_carrier", sa.String(255), nullable=True))
        batch.add_column(sa.Column("sample_region", payload, nullable=True))
        batch.add_column(sa.Column("dimensions_json", payload, nullable=True))
        batch.add_column(
            sa.Column("lifecycle_state", sa.String(32), nullable=False, server_default="active")
        )
        batch.add_column(sa.Column("control_subtype", sa.String(64), nullable=True))
        batch.create_foreign_key(
            "fk_samples_run_revision_id",
            "run_revisions",
            ["run_revision_id"],
            ["id"],
        )
        batch.create_index("ix_samples_run_revision_id", ["run_revision_id"])
        batch.create_index("ix_samples_actual_state", ["actual_state"])
        batch.create_index("ix_samples_actual_material_summary", ["actual_material_summary"])
        batch.create_index("ix_samples_lifecycle_state", ["lifecycle_state"])

    op.create_table(
        "transformation_runs",
        _id(),
        sa.Column("run_revision_id", sa.Uuid(), nullable=False),
        sa.Column("transformation_type", sa.String(64), nullable=False),
        sa.Column("operator_id", sa.Uuid(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("parameters_json", payload, nullable=False),
        sa.Column("destination_substrate_snapshot", payload, nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "transformation_type IN "
            "('cut', 'split', 'transfer', 'stack', 'anneal', 'etch', 'clean', "
            "'encapsulate', 'contact_fabrication', 'other')",
            name="ck_transformation_runs_type",
        ),
        sa.ForeignKeyConstraint(["operator_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["run_revision_id"], ["run_revisions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_transformation_runs_transformation_type", "transformation_runs", ["transformation_type"]
    )
    op.create_index("ix_transformation_runs_occurred_at", "transformation_runs", ["occurred_at"])
    for table, role in (("transformation_inputs", "input"), ("transformation_outputs", "output")):
        op.create_table(
            table,
            _id(),
            sa.Column("transformation_run_id", sa.Uuid(), nullable=False),
            sa.Column("sample_id", sa.Uuid(), nullable=False),
            sa.Column(f"{role}_role", sa.String(64), nullable=True),
            sa.ForeignKeyConstraint(
                ["transformation_run_id"],
                ["transformation_runs.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(["sample_id"], ["samples.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "transformation_run_id",
                "sample_id",
                name=f"uq_{table}_run_sample",
            ),
        )

    with op.batch_alter_table("characterization_records") as batch:
        batch.add_column(sa.Column("run_revision_id", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("performed_by_id", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("measured_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("sample_region", payload, nullable=True))
        batch.add_column(
            sa.Column("typed_conditions", payload, nullable=False, server_default="{}")
        )
        batch.add_column(
            sa.Column("quality_flag", sa.String(32), nullable=False, server_default="valid")
        )
        batch.create_foreign_key(
            "fk_characterization_records_run_revision_id",
            "run_revisions",
            ["run_revision_id"],
            ["id"],
        )
        batch.create_foreign_key(
            "fk_characterization_records_performed_by_id",
            "users",
            ["performed_by_id"],
            ["id"],
        )
        batch.create_index("ix_characterization_records_run_revision_id", ["run_revision_id"])
        batch.create_index("ix_characterization_records_performed_by_id", ["performed_by_id"])
        batch.create_index("ix_characterization_records_quality_flag", ["quality_flag"])

    op.create_table(
        "analysis_runs",
        _id(),
        sa.Column("measurement_run_id", sa.Uuid(), nullable=False),
        sa.Column("performed_by_id", sa.Uuid(), nullable=False),
        sa.Column("software_name", sa.String(128), nullable=False),
        sa.Column("software_version", sa.String(128), nullable=False),
        sa.Column("code_commit", sa.String(128), nullable=True),
        sa.Column("parameters_json", payload, nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["measurement_run_id"],
            ["characterization_records.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["performed_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_analysis_runs_software_name", "analysis_runs", ["software_name"])
    op.create_table(
        "property_values",
        _id(),
        sa.Column("sample_id", sa.Uuid(), nullable=False),
        sa.Column("measurement_run_id", sa.Uuid(), nullable=False),
        sa.Column("analysis_run_id", sa.Uuid(), nullable=True),
        sa.Column("property_code", sa.String(128), nullable=False),
        sa.Column("numeric_value", sa.Float(), nullable=True),
        sa.Column("text_value", sa.Text(), nullable=True),
        sa.Column("structured_value", payload, nullable=True),
        sa.Column("unit", sa.String(32), nullable=True),
        sa.Column("statistic", sa.String(32), nullable=True),
        sa.Column("uncertainty_value", sa.Float(), nullable=True),
        sa.Column("uncertainty_type", sa.String(64), nullable=True),
        sa.Column("sample_count", sa.Integer(), nullable=True),
        sa.Column("quality_flag", sa.String(32), nullable=False, server_default="valid"),
        sa.CheckConstraint(
            "sample_count IS NULL OR sample_count >= 1", name="ck_property_values_n"
        ),
        sa.CheckConstraint(
            "uncertainty_value IS NULL OR uncertainty_value >= 0",
            name="ck_property_values_uncertainty",
        ),
        sa.CheckConstraint(
            "quality_flag IN ('valid', 'suspect', 'invalid', 'below_detection_limit')",
            name="ck_property_values_quality",
        ),
        sa.ForeignKeyConstraint(["analysis_run_id"], ["analysis_runs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["measurement_run_id"],
            ["characterization_records.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["sample_id"], ["samples.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_property_values_property_code", "property_values", ["property_code"])
    op.create_index(
        "ix_property_values_code_numeric",
        "property_values",
        ["property_code", "numeric_value"],
    )
    op.create_table(
        "material_assertions",
        _id(),
        sa.Column("sample_id", sa.Uuid(), nullable=False),
        sa.Column("measurement_run_id", sa.Uuid(), nullable=False),
        sa.Column("analysis_run_id", sa.Uuid(), nullable=True),
        sa.Column("assertion_type", sa.String(64), nullable=False),
        sa.Column("value_json", payload, nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("validity", sa.String(32), nullable=False, server_default="active"),
        _created_at(),
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
            ["measurement_run_id"],
            ["characterization_records.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["sample_id"], ["samples.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_material_assertions_assertion_type", "material_assertions", ["assertion_type"]
    )
    op.create_index(
        "ix_material_assertions_sample_type",
        "material_assertions",
        ["sample_id", "assertion_type"],
    )

    op.create_table(
        "data_derivation_edges",
        _id(),
        sa.Column("analysis_run_id", sa.Uuid(), nullable=False),
        sa.Column("file_asset_id", sa.Uuid(), nullable=False),
        sa.Column("direction", sa.String(16), nullable=False),
        sa.Column("role", sa.String(64), nullable=True),
        sa.CheckConstraint(
            "direction IN ('input', 'output')",
            name="ck_data_derivation_edges_direction",
        ),
        sa.ForeignKeyConstraint(["analysis_run_id"], ["analysis_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["file_asset_id"], ["file_assets.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "analysis_run_id",
            "file_asset_id",
            "direction",
            name="uq_data_derivation_edges_analysis_file_direction",
        ),
    )
    op.create_table(
        "parser_results",
        _id(),
        sa.Column("file_asset_id", sa.Uuid(), nullable=False),
        sa.Column("parser_name", sa.String(128), nullable=False),
        sa.Column("parser_version", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("schema_json", payload, nullable=True),
        sa.Column("columns_json", payload, nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'parsed', 'failed', 'unsupported')",
            name="ck_parser_results_status",
        ),
        sa.ForeignKeyConstraint(["file_asset_id"], ["file_assets.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "file_asset_id",
            "parser_name",
            "parser_version",
            name="uq_parser_results",
        ),
    )
    op.create_table(
        "run_features",
        _id(),
        sa.Column("run_revision_id", sa.Uuid(), nullable=False),
        sa.Column("feature_code", sa.String(128), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("numeric_value", sa.Float(), nullable=True),
        sa.Column("text_value", sa.String(255), nullable=True),
        sa.Column("boolean_value", sa.Boolean(), nullable=True),
        sa.Column("unit", sa.String(32), nullable=True),
        sa.Column("source_path", sa.String(255), nullable=False),
        sa.ForeignKeyConstraint(["run_revision_id"], ["run_revisions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "run_revision_id",
            "feature_code",
            "ordinal",
            name="uq_run_features_revision_code_ordinal",
        ),
    )
    op.create_index("ix_run_features_feature_code", "run_features", ["feature_code"])
    op.create_index(
        "ix_run_features_code_numeric",
        "run_features",
        ["feature_code", "numeric_value"],
    )
    op.create_index(
        "ix_run_features_code_text",
        "run_features",
        ["feature_code", "text_value"],
    )

    _index_foreign_keys()

    if bind.dialect.name == "postgresql":
        op.execute(
            """
            CREATE FUNCTION reject_run_revision_content_update()
            RETURNS trigger AS $$
            BEGIN
              IF ROW(
                NEW.experiment_run_id,
                NEW.revision_number,
                NEW.supersedes_revision_id,
                NEW.schema_version,
                NEW.schema_status,
                NEW.content_json,
                NEW.content_sha256,
                NEW.correction_reason,
                NEW.locked_by_id,
                NEW.locked_at
              ) IS DISTINCT FROM ROW(
                OLD.experiment_run_id,
                OLD.revision_number,
                OLD.supersedes_revision_id,
                OLD.schema_version,
                OLD.schema_status,
                OLD.content_json,
                OLD.content_sha256,
                OLD.correction_reason,
                OLD.locked_by_id,
                OLD.locked_at
              ) THEN
                RAISE EXCEPTION 'run revision scientific content is immutable';
              END IF;
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
            """
        )
        op.execute(
            """
            CREATE TRIGGER trg_run_revisions_immutable
            BEFORE UPDATE ON run_revisions
            FOR EACH ROW EXECUTE FUNCTION reject_run_revision_content_update()
            """
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS trg_run_revisions_immutable ON run_revisions")
        op.execute("DROP FUNCTION IF EXISTS reject_run_revision_content_update()")

    for table in (
        "run_features",
        "parser_results",
        "data_derivation_edges",
        "material_assertions",
        "property_values",
        "analysis_runs",
    ):
        op.drop_table(table)

    with op.batch_alter_table("characterization_records") as batch:
        batch.drop_index("ix_characterization_records_quality_flag")
        batch.drop_index("ix_characterization_records_performed_by_id")
        batch.drop_index("ix_characterization_records_run_revision_id")
        batch.drop_constraint(
            "fk_characterization_records_performed_by_id",
            type_="foreignkey",
        )
        batch.drop_constraint(
            "fk_characterization_records_run_revision_id",
            type_="foreignkey",
        )
        for column in (
            "quality_flag",
            "typed_conditions",
            "sample_region",
            "measured_at",
            "performed_by_id",
            "run_revision_id",
        ):
            batch.drop_column(column)

    for table in (
        "transformation_outputs",
        "transformation_inputs",
        "transformation_runs",
    ):
        op.drop_table(table)

    with op.batch_alter_table("samples") as batch:
        for index in (
            "ix_samples_lifecycle_state",
            "ix_samples_actual_material_summary",
            "ix_samples_actual_state",
            "ix_samples_run_revision_id",
        ):
            batch.drop_index(index)
        batch.drop_constraint("fk_samples_run_revision_id", type_="foreignkey")
        for column in (
            "control_subtype",
            "lifecycle_state",
            "dimensions_json",
            "sample_region",
            "current_carrier",
            "actual_material_summary",
            "actual_state",
            "run_revision_id",
        ):
            batch.drop_column(column)

    for table in (
        "scientific_process_events",
        "process_channels",
        "process_segments",
        "source_load_ingredients",
        "source_loads",
        "target_composition_relations",
        "target_material_regions",
        "target_specs",
        "run_contributors",
    ):
        op.drop_table(table)

    with op.batch_alter_table("experiment_runs") as batch:
        batch.drop_index("ix_experiment_runs_draft_supersedes_revision_id")
        batch.drop_index("ix_experiment_runs_current_revision_id")
        batch.drop_constraint(
            "fk_experiment_runs_draft_supersedes_revision_id",
            type_="foreignkey",
        )
        batch.drop_constraint("fk_experiment_runs_current_revision_id", type_="foreignkey")
        batch.drop_column("correction_reason")
        batch.drop_column("draft_supersedes_revision_id")
        batch.drop_column("current_revision_id")

    op.drop_table("run_revisions")
    for table in (
        "instrument_lifecycle_events",
        "instrument_capabilities",
        "equipment_lifecycle_events",
        "setup_version_components",
        "equipment_component_instances",
        "substrate_layers",
        "substrate_stacks",
        "container_instances",
    ):
        op.drop_table(table)

    with op.batch_alter_table("material_lots") as batch:
        batch.drop_index("ix_material_lots_commercial_product_id")
        batch.drop_index("ix_material_lots_substance_id")
        batch.drop_constraint(
            "fk_material_lots_commercial_product_id",
            type_="foreignkey",
        )
        batch.drop_constraint("fk_material_lots_substance_id", type_="foreignkey")
        batch.drop_column("commercial_product_id")
        batch.drop_column("substance_id")

    op.drop_table("commercial_products")
    op.drop_table("substances")
    if bind.dialect.name != "postgresql":
        with op.batch_alter_table("experiment_runs") as batch:
            batch.alter_column(
                "status",
                existing_type=sa.Enum(
                    "draft",
                    "locked",
                    "reviewed",
                    "invalid",
                    name="experiment_status",
                    native_enum=False,
                ),
                type_=sa.Enum(
                    "draft",
                    "locked",
                    "invalid",
                    name="experiment_status",
                    native_enum=False,
                ),
                existing_nullable=False,
                existing_server_default="draft",
            )
