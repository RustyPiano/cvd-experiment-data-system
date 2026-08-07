from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    event,
    func,
    inspect,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.db.base import Base

json_payload_type = JSON().with_variant(JSONB(), "postgresql")


class RunRevision(Base):
    __tablename__ = "run_revisions"
    __table_args__ = (
        UniqueConstraint(
            "experiment_run_id",
            "revision_number",
            name="uq_run_revisions_run_number",
        ),
        CheckConstraint("revision_number >= 1", name="ck_run_revisions_number_positive"),
        CheckConstraint(
            "status IN ('locked', 'reviewed', 'superseded')",
            name="ck_run_revisions_status",
        ),
        Index("ix_run_revisions_run_status", "experiment_run_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("experiment_runs.id"),
        nullable=False,
        index=True,
    )
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    supersedes_revision_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("run_revisions.id"),
        nullable=True,
        index=True,
    )
    schema_version: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    schema_status: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="locked", index=True)
    content_json: Mapped[dict[str, Any]] = mapped_column(json_payload_type, nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    correction_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    locked_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )
    locked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    superseded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    experiment_run = relationship("ExperimentRun", foreign_keys=[experiment_run_id])
    supersedes = relationship(
        "RunRevision", remote_side=[id], foreign_keys=[supersedes_revision_id]
    )


class SampleRevisionAssociation(Base):
    __tablename__ = "sample_revision_associations"
    __table_args__ = (
        UniqueConstraint(
            "sample_id",
            "run_revision_id",
            name="uq_sample_revision_associations_sample_revision",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sample_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("samples.id"),
        nullable=False,
        index=True,
    )
    run_revision_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("run_revisions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sample_snapshot_json: Mapped[dict[str, Any]] = mapped_column(
        json_payload_type,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class SampleRevisionState(Base):
    __tablename__ = "sample_revision_states"
    __table_args__ = (
        UniqueConstraint(
            "sample_id",
            "run_revision_id",
            name="uq_sample_revision_states_sample_revision",
        ),
        CheckConstraint(
            "growth_state IN ('unknown', 'present', 'absent', 'uncertain')",
            name="ck_sample_revision_states_growth",
        ),
        CheckConstraint(
            "identity_state IN ('unknown', 'asserted', 'conflicting')",
            name="ck_sample_revision_states_identity",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sample_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("samples.id"),
        nullable=False,
        index=True,
    )
    run_revision_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("run_revisions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    growth_state: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    identity_state: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    material_summary: Mapped[str | None] = mapped_column(String(255), nullable=True)
    evidence_assertion_ids: Mapped[list[str]] = mapped_column(
        json_payload_type,
        nullable=False,
        default=list,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class RunContributor(Base):
    __tablename__ = "run_contributors"
    __table_args__ = (
        UniqueConstraint(
            "run_revision_id",
            "user_id",
            "role",
            name="uq_run_contributors_revision_user_role",
        ),
        CheckConstraint(
            "role IN ('performed_by', 'recorded_by', 'reviewed_by')",
            name="ck_run_contributors_role",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_revision_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("run_revisions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    contribution_role: Mapped[str | None] = mapped_column(String(128), nullable=True)
    user_snapshot_json: Mapped[dict[str, Any]] = mapped_column(json_payload_type, nullable=False)


class TargetSpec(Base):
    __tablename__ = "target_specs"
    __table_args__ = (UniqueConstraint("run_revision_id", name="uq_target_specs_run_revision"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_revision_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("run_revisions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    architecture_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    dimensional_form: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    coverage_state: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    orientation: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    optimization_objective: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class TargetMaterialRegion(Base):
    __tablename__ = "target_material_regions"
    __table_args__ = (
        UniqueConstraint("target_spec_id", "region_key", name="uq_target_regions_spec_key"),
        CheckConstraint(
            "target_layer_count IS NULL OR target_layer_count >= 1",
            name="ck_target_regions_layer_count_positive",
        ),
        CheckConstraint(
            "target_bulk_space_group_number IS NULL OR "
            "target_bulk_space_group_number BETWEEN 1 AND 230",
            name="ck_target_regions_space_group_range",
        ),
        Index("ix_target_regions_formula", "formula"),
        Index(
            "ix_target_regions_bulk_space_group_number",
            "target_bulk_space_group_number",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    target_spec_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("target_specs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    region_key: Mapped[str] = mapped_column(String(64), nullable=False)
    formula: Mapped[str] = mapped_column(String(128), nullable=False)
    spatial_role: Mapped[str] = mapped_column(String(64), nullable=False)
    layer_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lateral_region: Mapped[str | None] = mapped_column(String(128), nullable=True)
    target_layer_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_bulk_phase: Mapped[str | None] = mapped_column(String(128), nullable=True)
    target_bulk_space_group_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    attrs: Mapped[dict[str, Any]] = mapped_column(json_payload_type, nullable=False, default=dict)


class TargetCompositionRelation(Base):
    __tablename__ = "target_composition_relations"
    __table_args__ = (
        CheckConstraint(
            "relation_type IN "
            "('doped_by', 'substitutional_alloy', 'solid_solution_component', "
            "'intercalated_by', 'decorated_by')",
            name="ck_target_composition_relation_type",
        ),
        CheckConstraint(
            "value_basis IN "
            "('at_percent', 'mol_fraction', 'site_fraction', 'ratio', 'unspecified')",
            name="ck_target_composition_value_basis",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    target_spec_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("target_specs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    host_region_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("target_material_regions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    relation_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    species: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    nominal_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_basis: Mapped[str] = mapped_column(String(32), nullable=False)
    site_or_location: Mapped[str | None] = mapped_column(String(128), nullable=True)


class SourceLoad(Base):
    __tablename__ = "source_loads"
    __table_args__ = (
        UniqueConstraint("run_revision_id", "load_key", name="uq_source_loads_revision_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_revision_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("run_revisions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    load_key: Mapped[str] = mapped_column(String(64), nullable=False)
    container_instance_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("container_instances.id"),
        nullable=True,
        index=True,
    )
    container_snapshot_json: Mapped[dict[str, Any] | None] = mapped_column(
        json_payload_type,
        nullable=True,
    )
    container_state_at_loading: Mapped[str | None] = mapped_column(
        String(32),
        nullable=True,
    )
    loading_method: Mapped[str] = mapped_column(String(64), nullable=False)
    preparation_steps: Mapped[list[dict[str, Any]]] = mapped_column(
        json_payload_type,
        nullable=False,
        default=list,
    )
    initial_position: Mapped[dict[str, Any] | None] = mapped_column(
        json_payload_type,
        nullable=True,
    )
    position_program: Mapped[list[dict[str, Any]]] = mapped_column(
        json_payload_type,
        nullable=False,
        default=list,
    )
    heating_zone_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    attrs: Mapped[dict[str, Any]] = mapped_column(json_payload_type, nullable=False, default=dict)


class SourceLoadIngredient(Base):
    __tablename__ = "source_load_ingredients"
    __table_args__ = (
        CheckConstraint("amount IS NULL OR amount >= 0", name="ck_source_ingredients_amount"),
        CheckConstraint(
            "uncertainty IS NULL OR uncertainty >= 0",
            name="ck_source_ingredients_uncertainty",
        ),
        Index("ix_source_ingredients_lot_version", "material_lot_id", "material_lot_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_load_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("source_loads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    material_lot_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("material_lots.id"),
        nullable=False,
        index=True,
    )
    material_lot_version: Mapped[int] = mapped_column(Integer, nullable=False)
    material_snapshot_json: Mapped[dict[str, Any]] = mapped_column(
        json_payload_type,
        nullable=False,
    )
    function_role: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    composition_basis: Mapped[str | None] = mapped_column(String(64), nullable=True)
    uncertainty: Mapped[float | None] = mapped_column(Float, nullable=True)
    attrs: Mapped[dict[str, Any]] = mapped_column(json_payload_type, nullable=False, default=dict)


class ProcessSegment(Base):
    __tablename__ = "process_segments"
    __table_args__ = (
        UniqueConstraint("run_revision_id", "segment_key", name="uq_process_segments_revision_key"),
        CheckConstraint("start_s >= 0", name="ck_process_segments_start_nonnegative"),
        CheckConstraint("end_s > start_s", name="ck_process_segments_order"),
        Index("ix_process_segments_revision_sequence", "run_revision_id", "sequence"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_revision_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("run_revisions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    segment_key: Mapped[str] = mapped_column(String(64), nullable=False)
    segment_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    start_s: Mapped[float] = mapped_column(Float, nullable=False)
    end_s: Mapped[float] = mapped_column(Float, nullable=False)
    label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class ProcessChannel(Base):
    __tablename__ = "process_channels"
    __table_args__ = (
        UniqueConstraint("run_revision_id", "channel_key", name="uq_process_channels_revision_key"),
        UniqueConstraint(
            "run_revision_id",
            "channel_type",
            "subject_instance_ref",
            "source_type",
            name="uq_process_channels_revision_instance_source",
        ),
        CheckConstraint(
            "source_type IN ('setpoint', 'measured', 'inferred')",
            name="ck_process_channels_source_type",
        ),
        CheckConstraint(
            "data_kind IN ('scalar', 'interval_series', 'timeseries_file')",
            name="ck_process_channels_data_kind",
        ),
        Index("ix_process_channels_revision_type", "run_revision_id", "channel_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_revision_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("run_revisions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel_key: Mapped[str] = mapped_column(String(128), nullable=False)
    channel_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    subject_type: Mapped[str] = mapped_column(String(32), nullable=False)
    subject_ref: Mapped[str] = mapped_column(String(128), nullable=False)
    subject_instance_ref: Mapped[str] = mapped_column(String(128), nullable=False)
    subject_snapshot_json: Mapped[dict[str, Any] | None] = mapped_column(
        json_payload_type,
        nullable=True,
    )
    gas_species_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    gas_lot_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("material_lots.id"),
        nullable=True,
        index=True,
    )
    gas_lot_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gas_lot_snapshot_json: Mapped[dict[str, Any] | None] = mapped_column(
        json_payload_type,
        nullable=True,
    )
    zone_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pressure_location: Mapped[str | None] = mapped_column(String(128), nullable=True)
    pressure_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    unit: Mapped[str] = mapped_column(String(32), nullable=False)
    data_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    scalar_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    series_json: Mapped[list[dict[str, Any]] | None] = mapped_column(
        json_payload_type,
        nullable=True,
    )
    file_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("file_assets.id"),
        nullable=True,
        index=True,
    )
    canonical_unit: Mapped[str] = mapped_column(String(32), nullable=False)
    canonical_scalar_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    canonical_series_json: Mapped[list[dict[str, Any]] | None] = mapped_column(
        json_payload_type,
        nullable=True,
    )
    projection_status: Mapped[str] = mapped_column(String(32), nullable=False)
    statistics_json: Mapped[dict[str, Any] | None] = mapped_column(
        json_payload_type,
        nullable=True,
    )
    source_file_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    parser_version: Mapped[str | None] = mapped_column(String(64), nullable=True)


class ScientificProcessEvent(Base):
    __tablename__ = "scientific_process_events"
    __table_args__ = (
        UniqueConstraint("run_revision_id", "event_key", name="uq_process_events_revision_key"),
        CheckConstraint("start_s >= 0", name="ck_scientific_events_start_nonnegative"),
        CheckConstraint(
            "end_s IS NULL OR end_s >= start_s",
            name="ck_scientific_events_order",
        ),
        Index("ix_scientific_events_revision_start", "run_revision_id", "start_s"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_revision_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("run_revisions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_key: Mapped[str] = mapped_column(String(64), nullable=False)
    start_s: Mapped[float] = mapped_column(Float, nullable=False)
    end_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    affected_objects: Mapped[list[str]] = mapped_column(
        json_payload_type, nullable=False, default=list
    )
    observed_deviations: Mapped[list[str]] = mapped_column(
        json_payload_type,
        nullable=False,
        default=list,
    )
    suspected_causes: Mapped[list[str]] = mapped_column(
        json_payload_type,
        nullable=False,
        default=list,
    )
    intervention_actions: Mapped[list[str]] = mapped_column(
        json_payload_type,
        nullable=False,
        default=list,
    )
    outcome: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    data_validity_impact: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    excluded_time_ranges: Mapped[list[dict[str, Any]]] = mapped_column(
        json_payload_type,
        nullable=False,
        default=list,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    attachment_file_ids: Mapped[list[str]] = mapped_column(
        json_payload_type,
        nullable=False,
        default=list,
    )


class TransformationRun(Base):
    __tablename__ = "transformation_runs"
    __table_args__ = (
        CheckConstraint(
            "transformation_type IN "
            "('cut', 'split', 'transfer', 'stack', 'anneal', 'etch', 'clean', "
            "'encapsulate', 'contact_fabrication', 'other')",
            name="ck_transformation_runs_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    output_experiment_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("experiment_runs.id"),
        nullable=False,
        index=True,
    )
    transformation_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    operator_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    parameters_json: Mapped[dict[str, Any]] = mapped_column(
        json_payload_type,
        nullable=False,
        default=dict,
    )
    destination_substrate_snapshot: Mapped[dict[str, Any] | None] = mapped_column(
        json_payload_type,
        nullable=True,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class TransformationInput(Base):
    __tablename__ = "transformation_inputs"
    __table_args__ = (
        UniqueConstraint(
            "transformation_run_id",
            "sample_id",
            name="uq_transformation_inputs_run_sample",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transformation_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("transformation_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sample_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("samples.id"),
        nullable=False,
        index=True,
    )
    input_role: Mapped[str | None] = mapped_column(String(64), nullable=True)
    run_revision_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("run_revisions.id"),
        nullable=True,
        index=True,
    )
    provenance_json: Mapped[dict[str, Any]] = mapped_column(
        json_payload_type,
        nullable=False,
    )


class TransformationOutput(Base):
    __tablename__ = "transformation_outputs"
    __table_args__ = (
        UniqueConstraint(
            "transformation_run_id",
            "sample_id",
            name="uq_transformation_outputs_run_sample",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transformation_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("transformation_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sample_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("samples.id"),
        nullable=False,
        index=True,
    )
    output_role: Mapped[str | None] = mapped_column(String(64), nullable=True)


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    measurement_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("characterization_records.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    performed_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    software_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    software_version: Mapped[str] = mapped_column(String(128), nullable=False)
    code_commit: Mapped[str | None] = mapped_column(String(128), nullable=True)
    parameters_json: Mapped[dict[str, Any]] = mapped_column(
        json_payload_type,
        nullable=False,
        default=dict,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PropertyValue(Base):
    __tablename__ = "property_values"
    __table_args__ = (
        CheckConstraint("sample_count IS NULL OR sample_count >= 1", name="ck_property_values_n"),
        CheckConstraint(
            "uncertainty_value IS NULL OR uncertainty_value >= 0",
            name="ck_property_values_uncertainty",
        ),
        CheckConstraint(
            "quality_flag IN ('valid', 'suspect', 'invalid', 'below_detection_limit')",
            name="ck_property_values_quality",
        ),
        Index("ix_property_values_code_numeric", "property_code", "numeric_value"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sample_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("samples.id"),
        nullable=False,
        index=True,
    )
    measurement_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("characterization_records.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    analysis_run_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("analysis_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    property_code: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    numeric_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    text_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    structured_value: Mapped[dict[str, Any] | None] = mapped_column(
        json_payload_type,
        nullable=True,
    )
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    statistic: Mapped[str | None] = mapped_column(String(32), nullable=True)
    uncertainty_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    uncertainty_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sample_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quality_flag: Mapped[str] = mapped_column(String(32), nullable=False, default="valid")


class MaterialAssertion(Base):
    __tablename__ = "material_assertions"
    __table_args__ = (
        CheckConstraint(
            "assertion_type IN "
            "('growth_presence', 'phase_identity', 'composition', 'polytype', "
            "'stacking_order', 'orientation_relationship', 'layer_count')",
            name="ck_material_assertions_type",
        ),
        CheckConstraint(
            "validity IN ('active', 'superseded', 'disputed')",
            name="ck_material_assertions_validity",
        ),
        Index("ix_material_assertions_sample_type", "sample_id", "assertion_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sample_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("samples.id"),
        nullable=False,
        index=True,
    )
    measurement_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("characterization_records.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    analysis_run_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("analysis_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    assertion_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    value_json: Mapped[dict[str, Any]] = mapped_column(json_payload_type, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    validity: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class DataDerivationEdge(Base):
    __tablename__ = "data_derivation_edges"
    __table_args__ = (
        UniqueConstraint(
            "analysis_run_id",
            "file_asset_id",
            "direction",
            name="uq_data_derivation_edges_analysis_file_direction",
        ),
        CheckConstraint(
            "direction IN ('input', 'output')",
            name="ck_data_derivation_edges_direction",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("analysis_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_asset_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("file_assets.id"),
        nullable=False,
        index=True,
    )
    direction: Mapped[str] = mapped_column(String(16), nullable=False)
    role: Mapped[str | None] = mapped_column(String(64), nullable=True)


class ParserResult(Base):
    __tablename__ = "parser_results"
    __table_args__ = (
        UniqueConstraint(
            "file_asset_id", "parser_name", "parser_version", name="uq_parser_results"
        ),
        CheckConstraint(
            "status IN ('pending', 'parsed', 'failed', 'unsupported')",
            name="ck_parser_results_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    file_asset_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("file_assets.id"),
        nullable=False,
        index=True,
    )
    parser_name: Mapped[str] = mapped_column(String(128), nullable=False)
    parser_version: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    schema_json: Mapped[dict[str, Any] | None] = mapped_column(json_payload_type, nullable=True)
    columns_json: Mapped[list[dict[str, Any]] | None] = mapped_column(
        json_payload_type,
        nullable=True,
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class RunFeature(Base):
    __tablename__ = "run_features"
    __table_args__ = (
        UniqueConstraint(
            "run_revision_id",
            "feature_code",
            "ordinal",
            name="uq_run_features_revision_code_ordinal",
        ),
        Index("ix_run_features_code_numeric", "feature_code", "numeric_value"),
        Index("ix_run_features_code_text", "feature_code", "text_value"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_revision_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("run_revisions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    feature_code: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    numeric_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    text_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    boolean_value: Mapped[bool | None] = mapped_column(nullable=True)
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_path: Mapped[str] = mapped_column(String(255), nullable=False)


_IMMUTABLE_REVISION_FIELDS = (
    "experiment_run_id",
    "revision_number",
    "supersedes_revision_id",
    "schema_version",
    "schema_status",
    "content_json",
    "content_sha256",
    "correction_reason",
    "locked_by_id",
    "locked_at",
)


def _reject_revision_content_update(
    _mapper: object, _connection: object, target: RunRevision
) -> None:
    state = inspect(target)
    if any(state.attrs[name].history.has_changes() for name in _IMMUTABLE_REVISION_FIELDS):
        raise ValueError("Run revision scientific content is immutable")


event.listen(RunRevision, "before_update", _reject_revision_content_update)
