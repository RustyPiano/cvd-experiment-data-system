import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import Date, DateTime, Enum, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import User


class ExperimentStatus(StrEnum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    LOCKED = "locked"
    INVALID = "invalid"


class QualityLabel(StrEnum):
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"
    UNKNOWN = "unknown"


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
    project_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    template_version_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    recipe_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    derived_from_run_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("experiment_runs.id"),
        nullable=True,
    )
    experiment_type: Mapped[str] = mapped_column(String(64))
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
    quality_label: Mapped[QualityLabel] = mapped_column(
        Enum(
            QualityLabel,
            name="quality_label",
            values_callable=lambda enum_class: [item.value for item in enum_class],
        ),
        default=QualityLabel.UNKNOWN,
    )
    summary_result: Mapped[str | None] = mapped_column(Text, nullable=True)
    invalid_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    owner: Mapped[User] = relationship(foreign_keys=[owner_id])
    derived_from_run: Mapped["ExperimentRun | None"] = relationship(
        remote_side="ExperimentRun.id",
        foreign_keys=[derived_from_run_id],
    )
