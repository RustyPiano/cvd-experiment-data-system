from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ControlledVocabularyCreate(BaseModel):
    vocab_key: str = Field(min_length=1, max_length=64)
    value: str = Field(min_length=1, max_length=128)
    label_zh: str = Field(min_length=1, max_length=128)
    label_en: str | None = Field(default=None, max_length=128)
    sort_order: int = 0
    is_active: bool = True
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class ControlledVocabularyUpdate(BaseModel):
    value: str | None = Field(default=None, max_length=128)
    label_zh: str | None = Field(default=None, max_length=128)
    label_en: str | None = Field(default=None, max_length=128)
    sort_order: int | None = None
    is_active: bool | None = None
    metadata_json: dict[str, Any] | None = None


class ControlledVocabularyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    vocab_key: str
    value: str
    label_zh: str
    label_en: str | None
    sort_order: int
    is_active: bool
    metadata_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class ControlledVocabularyListResponse(BaseModel):
    items: list[ControlledVocabularyRead]
    total: int
