from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.setup_library import SetupVisibility


class SetupLibraryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    institution: str | None = None
    visibility: SetupVisibility = SetupVisibility.PRIVATE
    apparatus_description: str = ""
    methods_text: str = ""
    sample_placement_description: str = ""
    reaction_flow_description: str = ""
    reference_paper_url: str | None = None
    unpublished_reason: str | None = None
    semantic_context: dict[str, Any] = Field(default_factory=dict)


class SetupLibraryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    institution: str | None = None
    visibility: SetupVisibility | None = None
    apparatus_description: str | None = None
    methods_text: str | None = None
    sample_placement_description: str | None = None
    reaction_flow_description: str | None = None
    reference_paper_url: str | None = None
    unpublished_reason: str | None = None
    semantic_context: dict[str, Any] | None = None


class SetupLibraryRead(BaseModel):
    id: UUID
    owner_id: UUID
    owner_name: str | None = None
    visibility: SetupVisibility
    is_active: bool
    name: str
    institution: str | None
    apparatus_description: str
    methods_text: str
    sample_placement_description: str
    reaction_flow_description: str
    reference_paper_url: str | None
    unpublished_reason: str | None
    has_diagram: bool
    diagram_original_name: str | None
    diagram_download_url: str | None
    content_hash: str
    can_edit: bool
    semantic_context: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class SetupLibraryListResponse(BaseModel):
    items: list[SetupLibraryRead]
    total: int
