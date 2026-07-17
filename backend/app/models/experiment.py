import uuid
from datetime import date, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.file_asset import FileAsset
from app.models.module_payload import ExperimentModulePayload
from app.models.sample import Sample
from app.models.user import User

json_payload_type = JSON().with_variant(JSONB(), "postgresql")


class ExperimentStatus(StrEnum):
    DRAFT = "draft"
    LOCKED = "locked"
    INVALID = "invalid"


class ExperimentRun(Base):
    __tablename__ = "experiment_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    run_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id"),
        index=True,
    )
    schema_version: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    material_system: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    experiment_date: Mapped[date] = mapped_column(Date, index=True)
    objective: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ExperimentStatus] = mapped_column(
        Enum(
            ExperimentStatus,
            name="experiment_status",
            values_callable=lambda enum_class: [item.value for item in enum_class],
        ),
        default=ExperimentStatus.DRAFT,
        index=True,
    )
    invalid_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    setup_ref: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    setup_ref_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    setup_ref_snapshot_json: Mapped[dict[str, Any] | None] = mapped_column(
        json_payload_type,
        nullable=True,
    )
    result_missing_todo: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
        default=False,
    )
    not_characterized_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )
    not_characterized_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    owner: Mapped[User] = relationship(foreign_keys=[owner_id])
    module_payloads: Mapped[list[ExperimentModulePayload]] = relationship(
        back_populates="experiment_run",
        cascade="all, delete-orphan",
    )
    samples: Mapped[list[Sample]] = relationship(
        back_populates="experiment_run",
        cascade="all, delete-orphan",
    )
    file_assets: Mapped[list[FileAsset]] = relationship(
        back_populates="experiment_run",
        cascade="all, delete-orphan",
    )

    @property
    def owner_name(self) -> str | None:
        if self.owner is None:
            return None
        return self.owner.name
