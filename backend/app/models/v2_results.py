from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.experiment import ExperimentRun
    from app.models.file_asset import FileAsset
    from app.models.sample import Sample
    from app.models.v2_entities import Instrument


json_payload_type = JSON().with_variant(JSONB(), "postgresql")


class CharacterizationRecord(Base):
    __tablename__ = "characterization_records"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("experiment_runs.id"),
        index=True,
    )
    sample_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("samples.id"),
        index=True,
    )
    instrument_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("instruments.id"),
        nullable=True,
    )
    instrument_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    instrument_snapshot_json: Mapped[dict[str, Any] | None] = mapped_column(
        json_payload_type,
        nullable=True,
    )
    method_instrument: Mapped[str | None] = mapped_column(String(128), nullable=True)
    test_conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_data: Mapped[dict[str, Any] | None] = mapped_column(json_payload_type, nullable=True)
    attrs: Mapped[dict[str, Any]] = mapped_column(json_payload_type, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    experiment_run: Mapped[ExperimentRun] = relationship("ExperimentRun")
    sample: Mapped[Sample] = relationship("Sample")
    instrument: Mapped[Instrument | None] = relationship("Instrument")
    file_assets: Mapped[list[FileAsset]] = relationship(back_populates="characterization_record")


class MeasuredProduct(Base):
    __tablename__ = "measured_products"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sample_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("samples.id"),
        index=True,
    )
    characterization_record_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("characterization_records.id"),
        nullable=True,
        index=True,
    )
    observed_phenomena: Mapped[list[str] | None] = mapped_column(json_payload_type, nullable=True)
    detected_phase_stacking: Mapped[str | None] = mapped_column(Text, nullable=True)
    layer_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    coverage_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    domain_size_um: Mapped[float | None] = mapped_column(Float, nullable=True)
    nucleation_density_cm2: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Legacy free-text columns remain read-only so old exports stay lossless.
    measured_layers_coverage: Mapped[str | None] = mapped_column(Text, nullable=True)
    domain_nucleation_continuity: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_spectral_metrics: Mapped[list[dict[str, Any]] | dict[str, Any] | None] = mapped_column(
        json_payload_type,
        nullable=True,
    )
    attrs: Mapped[dict[str, Any]] = mapped_column(json_payload_type, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    sample: Mapped[Sample] = relationship("Sample")
    characterization_record: Mapped[CharacterizationRecord | None] = relationship(
        "CharacterizationRecord"
    )
