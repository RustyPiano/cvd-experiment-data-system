from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RecipeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    material_system: str | None = Field(default=None, max_length=64)
    default_payload_json: dict[str, Any] = Field(default_factory=dict)
    description: str | None = None


class RecipeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    material_system: str | None = Field(default=None, max_length=64)
    default_payload_json: dict[str, Any] | None = None
    description: str | None = None
    is_active: bool | None = None


class RecipeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    template_version_id: UUID | None = None
    project_id: UUID | None = None
    material_system: str | None = None
    default_payload_json: dict[str, Any]
    description: str | None = None
    created_by: UUID | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class RecipeListResponse(BaseModel):
    items: list[RecipeRead]
    total: int
