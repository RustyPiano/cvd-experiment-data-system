from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.experiment import ExperimentRun
    from app.models.sample import Sample
    from app.models.v2_results import CharacterizationRecord


json_payload_type = JSON().with_variant(JSONB(), "postgresql")
FILE_NOTE_MAX_LENGTH = 500


class FileAsset(Base):
    __tablename__ = "file_assets"
    __table_args__ = (
        Index(
            "ix_file_assets_entity_binding",
            "entity_type",
            "entity_id",
            "entity_version",
        ),
        CheckConstraint(
            """
            (
                experiment_run_id IS NOT NULL
                AND entity_type IS NULL
                AND entity_id IS NULL
                AND entity_version IS NULL
            )
            OR
            (
                experiment_run_id IS NULL
                AND (
                    (
                        entity_type IS NULL
                        AND entity_id IS NULL
                        AND entity_version IS NULL
                    )
                    OR
                    (
                        entity_type IS NOT NULL
                        AND entity_id IS NOT NULL
                        AND entity_version >= 1
                    )
                )
            )
            """,
            name="ck_file_assets_single_scope",
        ),
        CheckConstraint(
            "entity_type IS NULL OR entity_type IN ('material_lot', 'setup', 'instrument')",
            name="ck_file_assets_entity_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    experiment_run_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("experiment_runs.id"),
        nullable=True,
        index=True,
    )
    sample_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("samples.id"),
        nullable=True,
        index=True,
    )
    characterization_record_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("characterization_records.id"),
        nullable=True,
        index=True,
    )
    entity_type: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        index=True,
    )
    entity_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uploaded_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id"),
        index=True,
    )
    deleted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )
    original_name: Mapped[str] = mapped_column(String(255))
    storage_path: Mapped[str] = mapped_column(String(1024), unique=True)
    content_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    method: Mapped[str] = mapped_column(String(64), index=True)
    file_category: Mapped[str] = mapped_column(String(32), index=True, default="raw")
    asset_role: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="characterization_file",
        index=True,
    )
    note: Mapped[str | None] = mapped_column(String(FILE_NOTE_MAX_LENGTH), nullable=True)
    file_kind: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    metadata_json: Mapped[dict] = mapped_column(json_payload_type, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    experiment_run: Mapped[ExperimentRun | None] = relationship(back_populates="file_assets")
    sample: Mapped[Sample | None] = relationship(back_populates="file_assets")
    characterization_record: Mapped[CharacterizationRecord | None] = relationship(
        back_populates="file_assets"
    )
