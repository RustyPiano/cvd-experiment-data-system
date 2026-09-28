"""Drop legacy result, container, component, lifecycle and parser tables."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260928_0017"
down_revision: str | None = "20260909_0016"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

payload = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def _id() -> sa.Column:
    return sa.Column("id", sa.Uuid(), nullable=False)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            name,
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        )
        for name in ("created_at", "updated_at")
    ]


def upgrade() -> None:
    with op.batch_alter_table("file_assets") as batch:
        batch.drop_index("ix_file_assets_file_kind")
        batch.drop_column("file_kind")
    with op.batch_alter_table("source_loads") as batch:
        batch.drop_index("ix_source_loads_container_instance_id")
        batch.drop_column("container_state_at_loading")
        batch.drop_column("container_snapshot_json")
        batch.drop_column("container_instance_id")
    for table in (
        "measured_products",
        "parser_results",
        "instrument_lifecycle_events",
        "equipment_lifecycle_events",
        "setup_version_components",
        "equipment_component_instances",
        "container_instances",
    ):
        op.drop_table(table)


def downgrade() -> None:
    with op.batch_alter_table("file_assets") as batch:
        batch.add_column(sa.Column("file_kind", sa.String(64), nullable=True))
        batch.create_index("ix_file_assets_file_kind", ["file_kind"])
    op.create_table(
        "measured_products",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("sample_id", sa.Uuid(), nullable=False),
        sa.Column("characterization_record_id", sa.Uuid(), nullable=True),
        sa.Column("observed_phenomena", payload, nullable=True),
        sa.Column("detected_phase_stacking", sa.Text(), nullable=True),
        sa.Column("layer_count", sa.Integer(), nullable=True),
        sa.Column("coverage_percent", sa.Float(), nullable=True),
        sa.Column("domain_size_um", sa.Float(), nullable=True),
        sa.Column("nucleation_density_cm2", sa.Float(), nullable=True),
        sa.Column("measured_layers_coverage", sa.Text(), nullable=True),
        sa.Column("domain_nucleation_continuity", sa.Text(), nullable=True),
        sa.Column("key_spectral_metrics", payload, nullable=True),
        sa.Column("attrs", payload, nullable=False, server_default=sa.text("'{}'")),
        *_timestamps(),
        sa.ForeignKeyConstraint(["characterization_record_id"], ["characterization_records.id"]),
        sa.ForeignKeyConstraint(["sample_id"], ["samples.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("characterization_record_id", "sample_id"):
        op.create_index(f"ix_measured_products_{column}", "measured_products", [column])

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
        *_timestamps(),
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
    for column in ("container_code", "container_type", "status", "material_lot_id"):
        op.create_index(f"ix_container_instances_{column}", "container_instances", [column])

    op.create_table(
        "equipment_component_instances",
        _id(),
        sa.Column("component_code", sa.String(128), nullable=False),
        sa.Column("component_type", sa.String(64), nullable=False),
        sa.Column("manufacturer", sa.String(255), nullable=True),
        sa.Column("model", sa.String(128), nullable=True),
        sa.Column("serial_number", sa.String(128), nullable=True),
        sa.Column("attrs", payload, nullable=False),
        *_timestamps(),
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
        sa.ForeignKeyConstraint(["setup_version_id"], ["setup_versions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["component_id"], ["equipment_component_instances.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "setup_version_id", "component_id", "role", name="uq_setup_version_components_binding"
        ),
    )
    for column in ("setup_version_id", "component_id"):
        op.create_index(
            f"ix_setup_version_components_{column}", "setup_version_components", [column]
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
    for column in ("event_type", "component_id", "certificate_file_id"):
        op.create_index(
            f"ix_equipment_lifecycle_events_{column}", "equipment_lifecycle_events", [column]
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
    for column in ("instrument_id", "certificate_file_id"):
        op.create_index(
            f"ix_instrument_lifecycle_events_{column}", "instrument_lifecycle_events", [column]
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
            "file_asset_id", "parser_name", "parser_version", name="uq_parser_results"
        ),
    )
    op.create_index("ix_parser_results_file_asset_id", "parser_results", ["file_asset_id"])

    with op.batch_alter_table("source_loads") as batch:
        batch.add_column(sa.Column("container_instance_id", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("container_snapshot_json", payload, nullable=True))
        batch.add_column(sa.Column("container_state_at_loading", sa.String(32), nullable=True))
        batch.create_foreign_key(
            "fk_source_loads_container_instance_id",
            "container_instances",
            ["container_instance_id"],
            ["id"],
        )
        batch.create_index("ix_source_loads_container_instance_id", ["container_instance_id"])
