from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ImportProfileInfo(BaseModel):
    key: str
    display_name: str
    description: str | None = None


class ImportProfileListResponse(BaseModel):
    profiles: list[ImportProfileInfo]


class ParsedExperimentDraft(BaseModel):
    """One experiment parsed from a source row, before persistence.

    ``run_level`` holds top-level experiment fields (experiment_type,
    material_system, objective, experiment_date). ``module_payloads`` maps a
    module_key to its payload_json. ``warnings`` flags values the user should
    review in the confirmation step.
    """

    source_row: int
    run_level: dict[str, Any] = Field(default_factory=dict)
    module_payloads: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class ImportPreviewResponse(BaseModel):
    profile_key: str
    drafts: list[ParsedExperimentDraft]
    global_warnings: list[str] = Field(default_factory=list)


class ImportCommitRequest(BaseModel):
    profile_key: str
    drafts: list[ParsedExperimentDraft] = Field(min_length=1)


class ImportCommitResultItem(BaseModel):
    source_row: int
    experiment_id: UUID
    run_code: str


class ImportCommitResponse(BaseModel):
    created: list[ImportCommitResultItem]
