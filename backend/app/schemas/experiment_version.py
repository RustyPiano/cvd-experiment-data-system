from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ExperimentVersionSummary(BaseModel):
    """Lightweight version-history list entry (no snapshot payload)."""

    id: UUID
    version_number: int
    change_note: str | None
    created_by_id: UUID
    created_by_name: str | None
    created_at: datetime


class ExperimentVersionRead(ExperimentVersionSummary):
    """A full version including its snapshot payload."""

    snapshot_json: dict[str, Any]


class ExperimentVersionListResponse(BaseModel):
    items: list[ExperimentVersionSummary]
    total: int


class ExperimentVersionCreateRequest(BaseModel):
    """Finalize the current state of a submitted experiment as a new version."""

    change_note: str | None = Field(default=None, max_length=500)
