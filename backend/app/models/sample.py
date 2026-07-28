from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, String, UniqueConstraint, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.experiment import ExperimentRun
    from app.models.file_asset import FileAsset


json_payload_type = JSON().with_variant(JSONB(), "postgresql")


class SampleRole(StrEnum):
    GROWTH = "growth"
    DERIVED = "derived"
    CONTROL = "control"


class Sample(Base):
    __tablename__ = "samples"
    __table_args__ = (
        UniqueConstraint(
            "experiment_run_id",
            "source_substrate_id",
            name="uq_samples_run_source_substrate",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    sample_code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    experiment_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("experiment_runs.id"),
        index=True,
    )
    run_revision_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("run_revisions.id"),
        nullable=True,
        index=True,
    )
    parent_sample_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("samples.id"),
        nullable=True,
    )
    role: Mapped[str] = mapped_column(String(32), index=True)
    actual_state: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="unknown",
        index=True,
    )
    actual_material_summary: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )
    current_carrier: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sample_region: Mapped[dict | None] = mapped_column(json_payload_type, nullable=True)
    dimensions_json: Mapped[dict | None] = mapped_column(json_payload_type, nullable=True)
    lifecycle_state: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="active",
        index=True,
    )
    control_subtype: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_substrate_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        index=True,
    )
    source_substrate_snapshot_json: Mapped[dict | None] = mapped_column(
        json_payload_type,
        nullable=True,
    )
    metadata_json: Mapped[dict] = mapped_column(json_payload_type, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    experiment_run: Mapped[ExperimentRun] = relationship(back_populates="samples")
    parent_sample: Mapped[Sample | None] = relationship(remote_side="Sample.id")
    file_assets: Mapped[list[FileAsset]] = relationship(back_populates="sample")

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    @property
    def run_code(self) -> str | None:
        return self.experiment_run.run_code if self.experiment_run else None

    @property
    def material_system(self) -> str | None:
        return self.actual_material_summary

    @property
    def target_material_system(self) -> str | None:
        return self.experiment_run.material_system if self.experiment_run else None
