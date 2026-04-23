from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.audit import AuditEventRead
from app.schemas.file_asset import FileAssetRead
from app.schemas.module_payload import ExperimentModulePayloadRead
from app.schemas.sample import SampleRead


class ExperimentCreate(BaseModel):
    experiment_type: str = Field(min_length=1, max_length=64)
    material_system: str | None = Field(default=None, max_length=64)
    experiment_date: date
    objective: str | None = None


class ExperimentUpdate(BaseModel):
    material_system: str | None = Field(default=None, max_length=64)
    objective: str | None = None
    summary_result: str | None = None


class ExperimentInvalidateRequest(BaseModel):
    reason: str = Field(min_length=1)


class ExperimentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    run_code: str
    owner_id: UUID
    derived_from_run_id: UUID | None
    derived_from_run_code: str | None = None
    experiment_type: str
    material_system: str | None
    experiment_date: date
    objective: str | None
    status: str
    quality_label: str
    summary_result: str | None
    invalid_reason: str | None
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime | None
    locked_at: datetime | None


class ExperimentListResponse(BaseModel):
    items: list[ExperimentRead]
    total: int
    page: int = 1
    page_size: int = 20


class ExperimentExportCounts(BaseModel):
    modules: int
    samples: int
    files: int
    audit_events: int


class ExperimentExportProvenance(BaseModel):
    derived_from_run_id: UUID | None
    derived_from_run_code: str | None


class ExperimentExportRead(BaseModel):
    export_version: str
    exported_at: datetime
    experiment: ExperimentRead
    modules: list[ExperimentModulePayloadRead]
    samples: list[SampleRead]
    files: list[FileAssetRead]
    features: list[dict[str, Any]]
    provenance: ExperimentExportProvenance
    audit_events: list[AuditEventRead]
    counts: ExperimentExportCounts
