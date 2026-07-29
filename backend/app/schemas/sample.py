from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ControlSampleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    control_subtype: str | None = Field(default=None, max_length=64)
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class SampleUpdate(BaseModel):
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class SampleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sample_code: str
    experiment_run_id: UUID
    run_revision_id: UUID | None
    run_code: str | None = None
    target_material_system: str | None = None
    material_system: str | None = None
    actual_state: str
    identity_state: str
    actual_material_summary: str | None
    parent_sample_id: UUID | None
    role: str
    current_carrier: str | None
    sample_region: dict[str, Any] | None
    dimensions_json: dict[str, Any] | None
    lifecycle_state: str
    control_subtype: str | None
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
