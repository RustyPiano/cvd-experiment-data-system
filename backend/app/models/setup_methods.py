from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.experiment import ExperimentRun
    from app.models.file_asset import FileAsset


json_payload_type = JSON().with_variant(JSONB(), "postgresql")


class ExperimentSetupSnapshot(Base):
    __tablename__ = "experiment_setup_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("experiment_runs.id"),
        unique=True,
        index=True,
    )
    source_setup_library_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        index=True,
    )
    setup_key_snapshot: Mapped[str | None] = mapped_column(String(160), nullable=True, index=True)
    setup_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    setup_version_snapshot: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    institution_snapshot: Mapped[str | None] = mapped_column(String(128), nullable=True)
    apparatus_description_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    methods_text_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    sample_placement_description_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    reaction_flow_description_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    reference_paper_url_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    unpublished_reason_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    diagram_file_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("file_assets.id"),
        nullable=True,
        index=True,
    )
    is_same_as_source: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deviation_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    confirmed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    snapshot_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        json_payload_type,
        nullable=False,
        default=dict,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    experiment_run: Mapped[ExperimentRun] = relationship("ExperimentRun")
    diagram_file: Mapped[FileAsset | None] = relationship(
        "FileAsset",
        foreign_keys=[diagram_file_asset_id],
    )
