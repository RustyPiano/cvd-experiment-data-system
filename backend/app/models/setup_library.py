from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    JSON,
    Boolean,
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

if TYPE_CHECKING:
    from app.models.user import User


json_payload_type = JSON().with_variant(JSONB(), "postgresql")


class SetupVisibility(StrEnum):
    PRIVATE = "private"
    GROUP = "group"


class SetupLibraryEntry(Base):
    """A reusable, authored-once experimental setup / methods description.

    Members author a setup here once (apparatus diagram, methods text, reference)
    and reference it from many experiments. Group-visible entries can be reused by
    everyone and curated by admins (e.g. pre-filled external-collaborator setups).
    When an experiment references an entry the content is frozen into an
    ``ExperimentSetupSnapshot`` so later edits to the library never alter history.
    """

    __tablename__ = "setup_library_entries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id"),
        index=True,
    )
    visibility: Mapped[SetupVisibility] = mapped_column(
        Enum(
            SetupVisibility,
            name="setup_visibility",
            values_callable=lambda enum_class: [item.value for item in enum_class],
        ),
        nullable=False,
        default=SetupVisibility.PRIVATE,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    institution: Mapped[str | None] = mapped_column(String(128), nullable=True)
    apparatus_description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    methods_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sample_placement_description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    reaction_flow_description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    reference_paper_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    unpublished_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    diagram_storage_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    diagram_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    diagram_content_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    diagram_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    diagram_original_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    semantic_context: Mapped[dict[str, Any]] = mapped_column(
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

    owner: Mapped[User] = relationship(foreign_keys=[owner_id])

    @property
    def has_diagram(self) -> bool:
        return self.diagram_storage_path is not None
