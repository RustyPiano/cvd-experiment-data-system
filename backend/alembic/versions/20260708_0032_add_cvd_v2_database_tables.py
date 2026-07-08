"""add cvd v2 database tables

Revision ID: 20260708_0032
Revises: 20260611_0031
Create Date: 2026-07-08 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260708_0032"
down_revision: str | None = "20260611_0031"
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
    op.create_index(
        "ix_material_lot_versions_entity_id",
        "material_lot_versions",
        ["entity_id"],
        unique=False,
    )

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
    op.create_index("ix_setup_versions_entity_id", "setup_versions", ["entity_id"], unique=False)

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
    op.create_index(
        "ix_instrument_versions_entity_id",
        "instrument_versions",
        ["entity_id"],
        unique=False,
    )

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
        sa.ForeignKeyConstraint(["sample_id"], ["samples.id"]),
        sa.ForeignKeyConstraint(["instrument_id"], ["instruments.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_characterization_records_experiment_run_id",
        "characterization_records",
        ["experiment_run_id"],
        unique=False,
    )
    op.create_index(
        "ix_characterization_records_sample_id",
        "characterization_records",
        ["sample_id"],
        unique=False,
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
        sa.ForeignKeyConstraint(["sample_id"], ["samples.id"]),
        sa.ForeignKeyConstraint(["characterization_record_id"], ["characterization_records.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_measured_products_sample_id", "measured_products", ["sample_id"], unique=False
    )
    op.create_index(
        "ix_measured_products_characterization_record_id",
        "measured_products",
        ["characterization_record_id"],
        unique=False,
    )

    op.add_column("experiment_runs", sa.Column("setup_ref", sa.Uuid(), nullable=True))
    op.add_column("experiment_runs", sa.Column("setup_ref_version", sa.Integer(), nullable=True))
    op.add_column(
        "experiment_runs",
        sa.Column("setup_ref_snapshot_json", payload_type, nullable=True),
    )
    op.add_column("experiment_runs", sa.Column("result_missing_todo", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("experiment_runs", "result_missing_todo")
    op.drop_column("experiment_runs", "setup_ref_snapshot_json")
    op.drop_column("experiment_runs", "setup_ref_version")
    op.drop_column("experiment_runs", "setup_ref")

    op.drop_index("ix_measured_products_characterization_record_id", table_name="measured_products")
    op.drop_index("ix_measured_products_sample_id", table_name="measured_products")
    op.drop_table("measured_products")

    op.drop_index("ix_characterization_records_sample_id", table_name="characterization_records")
    op.drop_index(
        "ix_characterization_records_experiment_run_id",
        table_name="characterization_records",
    )
    op.drop_table("characterization_records")

    op.drop_index("ix_instrument_versions_entity_id", table_name="instrument_versions")
    op.drop_table("instrument_versions")
    op.drop_table("instruments")

    op.drop_index("ix_setup_versions_entity_id", table_name="setup_versions")
    op.drop_table("setup_versions")
    op.drop_table("setups")

    op.drop_index("ix_material_lot_versions_entity_id", table_name="material_lot_versions")
    op.drop_table("material_lot_versions")
    op.drop_table("material_lots")
