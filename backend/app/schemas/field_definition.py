from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.field_definition import FieldType


class FieldDefinitionCreate(BaseModel):
    field_key: str = Field(..., min_length=1, max_length=128)
    module_key: str = Field(..., min_length=1, max_length=64)
    label_zh: str = Field(..., min_length=1, max_length=128)
    label_en: str | None = None
    field_type: FieldType = Field(default=FieldType.TEXT)
    unit: str | None = Field(default=None, max_length=32)
    required: bool = False
    default_strategy: str | None = Field(default=None, max_length=64)
    inheritable: bool = False
    vocab_key: str | None = Field(default=None, max_length=64)
    sort_order: int = Field(default=0)
    is_active: bool = True
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class FieldDefinitionUpdate(BaseModel):
    field_key: str | None = None
    module_key: str | None = None
    label_zh: str | None = None
    label_en: str | None = None
    field_type: FieldType | None = None
    unit: str | None = None
    required: bool | None = None
    default_strategy: str | None = None
    inheritable: bool | None = None
    vocab_key: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None
    metadata_json: dict[str, Any] | None = None


class FieldDefinitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    field_key: str
    module_key: str
    label_zh: str
    label_en: str | None = None
    field_type: str
    unit: str | None = None
    required: bool
    default_strategy: str | None = None
    inheritable: bool
    vocab_key: str | None = None
    sort_order: int
    is_active: bool
    metadata_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class FieldDefinitionListResponse(BaseModel):
    items: list[FieldDefinitionRead]
    total: int
