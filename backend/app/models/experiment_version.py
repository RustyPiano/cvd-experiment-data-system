import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import User

json_payload_type = JSON().with_variant(JSONB(), "postgresql")


class ExperimentVersion(Base):
    """An immutable snapshot of an experiment record captured at submit time.

    Each submit (and each subsequent "save as new version") of an experiment run
    appends one row here. The ``snapshot_json`` holds the experiment scalar fields
    plus every module payload at that moment, so a version can be viewed, diffed
    against another, or restored back into the live editable record.
    """

    __tablename__ = "experiment_versions"
    __table_args__ = (
        UniqueConstraint(
            "experiment_run_id",
            "version_number",
            name="uq_experiment_version_number",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    experiment_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("experiment_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_json: Mapped[dict] = mapped_column(
        json_payload_type,
        nullable=False,
        default=dict,
    )
    change_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    created_by: Mapped[User] = relationship("User", foreign_keys=[created_by_id])
