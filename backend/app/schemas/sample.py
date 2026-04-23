from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.sample import SampleRole


class SampleCreate(BaseModel):
    role: SampleRole
    parent_sample_id: UUID | None = None
    substrate_type: str | None = Field(default=None, max_length=128)
    brand: str | None = Field(default=None, max_length=128)
    size_mm: str | None = Field(default=None, max_length=64)
    treatment: str | None = None
    position_mm: float | None = None
    storage_location: str | None = Field(default=None, max_length=128)
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class SampleUpdate(BaseModel):
    substrate_type: str | None = Field(default=None, max_length=128)
    brand: str | None = Field(default=None, max_length=128)
    size_mm: str | None = Field(default=None, max_length=64)
    treatment: str | None = None
    position_mm: float | None = None
    storage_location: str | None = Field(default=None, max_length=128)
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class SampleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sample_code: str
    experiment_run_id: UUID
    parent_sample_id: UUID | None
    role: str
    substrate_type: str | None
    brand: str | None
    size_mm: str | None
    treatment: str | None
    position_mm: float | None
    storage_location: str | None
    metadata_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class SampleListResponse(BaseModel):
    items: list[SampleRead]
    total: int
