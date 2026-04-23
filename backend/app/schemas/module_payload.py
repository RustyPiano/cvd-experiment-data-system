from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ExperimentModulePayloadUpsert(BaseModel):
    payload_json: dict[str, Any] = Field(default_factory=dict)
    schema_version: str = Field(default="cvd_v1", min_length=1, max_length=64)


class ExperimentModulePayloadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    experiment_run_id: UUID
    module_key: str
    schema_version: str
    payload_json: dict[str, Any]
    note: str | None
    created_at: datetime
    updated_at: datetime


class ExperimentModulePayloadListResponse(BaseModel):
    items: list[ExperimentModulePayloadRead]
    total: int
