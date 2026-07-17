from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.sample import SampleRole


class SampleCreate(BaseModel):
    role: SampleRole
    parent_sample_id: UUID | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class SampleUpdate(BaseModel):
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class SampleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sample_code: str
    experiment_run_id: UUID
    run_code: str | None = None
    material_system: str | None = None
    parent_sample_id: UUID | None
    role: str
    source_substrate_id: UUID | None
    source_substrate_snapshot_json: dict[str, Any] | None
    metadata_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    deleted_by_id: UUID | None
    is_deleted: bool


class SampleListResponse(BaseModel):
    items: list[SampleRead]
    total: int
