from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, Numeric, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.experiment import ExperimentRun
    from app.models.file_asset import FileAsset


json_payload_type = JSON().with_variant(JSONB(), "postgresql")


class SampleRole(StrEnum):
    TOP = "top"
    BOTTOM = "bottom"
    PRODUCT = "product"
    CONTROL = "control"


class Sample(Base):
    __tablename__ = "samples"

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
    parent_sample_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("samples.id"),
        nullable=True,
    )
    role: Mapped[SampleRole] = mapped_column(String(32), index=True)
    substrate_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    brand: Mapped[str | None] = mapped_column(String(128), nullable=True)
    size_mm: Mapped[str | None] = mapped_column(String(64), nullable=True)
    treatment: Mapped[str | None] = mapped_column(Text, nullable=True)
    position_mm: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    storage_location: Mapped[str | None] = mapped_column(String(128), nullable=True)
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
