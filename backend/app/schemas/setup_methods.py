from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.experiment_validation import ExperimentValidationIssue


class SetupMethodTemplateRead(BaseModel):
    template_key: str
    template_version: int
    name: str
    institution: str | None = None
    apparatus_description: str
    methods_text: str
    sample_placement_description: str
    reaction_flow_description: str
    reference_paper_url: str | None = None
    unpublished_reason: str | None = None
    semantic_context: dict[str, Any] = Field(default_factory=dict)
    has_packaged_diagram: bool = False


class SetupMethodTemplateListResponse(BaseModel):
    items: list[SetupMethodTemplateRead]
    total: int


class SetupMethodsUpsert(BaseModel):
    setup_name_snapshot: str = ""
    institution_snapshot: str | None = None
    apparatus_description_snapshot: str = ""
    methods_text_snapshot: str = ""
    sample_placement_description_snapshot: str = ""
    reaction_flow_description_snapshot: str = ""
    reference_paper_url_snapshot: str | None = None
    unpublished_reason_snapshot: str | None = None
    diagram_file_asset_id: UUID | None = None
    is_same_as_template: bool = False
    deviation_note: str | None = None
    semantic_context: dict[str, Any] = Field(default_factory=dict)


class SetupMethodsFromTemplateRequest(BaseModel):
    template_key: str = Field(min_length=1)
    template_version: int = Field(ge=1)


class SetupMethodsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    experiment_run_id: UUID
    source_template_key: str | None
    source_template_version: int | None
    setup_key_snapshot: str | None
    setup_name_snapshot: str
    setup_version_snapshot: int
    institution_snapshot: str | None
    apparatus_description_snapshot: str
    methods_text_snapshot: str
    sample_placement_description_snapshot: str
    reaction_flow_description_snapshot: str
    reference_paper_url_snapshot: str | None
    unpublished_reason_snapshot: str | None
    diagram_file_asset_id: UUID | None
    is_same_as_template: bool
    deviation_note: str | None
    confirmed_by_id: UUID | None
    confirmed_at: datetime | None
    snapshot_hash: str
    semantic_context: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class SetupMethodsMutationResponse(BaseModel):
    data: SetupMethodsRead
    warnings: list[ExperimentValidationIssue] = Field(default_factory=list)
