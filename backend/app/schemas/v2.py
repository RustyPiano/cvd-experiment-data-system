from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.generated.v2_module_payload import TubeUsageHistoryPayload
from app.schemas.scientific import AmbientMeasurement
from app.services.v2_field_source import normalize_offset_datetime, validate_chemical_formula


class V2EntityVersionPayload(BaseModel):
    model_config = ConfigDict(extra="allow")


class V2EntityVersionRead(BaseModel):
    id: UUID
    entity_id: UUID
    version: int
    data: dict[str, Any]
    created_at: datetime


class V2EntityRead(BaseModel):
    id: UUID
    created_at: datetime
    updated_at: datetime
    latest_version: V2EntityVersionRead | None = None


class V2EntityListResponse(BaseModel):
    items: list[V2EntityRead]
    total: int


class V2EntityVersionListResponse(BaseModel):
    items: list[V2EntityVersionRead]
    total: int


class V2ExperimentCreate(BaseModel):
    started_at: datetime
    synthesis_method: Literal["CVD"]
    performed_by_user_ids: list[UUID] | None = Field(default=None, min_length=1)
    ambient_temperature: AmbientMeasurement = Field(
        default_factory=lambda: AmbientMeasurement(source_type="not_measured")
    )
    ambient_humidity: AmbientMeasurement = Field(
        default_factory=lambda: AmbientMeasurement(source_type="not_measured")
    )
    precheck_confirmed: bool | None = None
    run_code: str | None = Field(
        default=None,
        max_length=32,
        pattern=r"^CVD-\d{4}-\d{4}$",
    )
    chemical_formula: str | None = Field(default=None, max_length=64)
    objective: str | None = None

    @field_validator("started_at", mode="before")
    @classmethod
    def normalize_started_at(cls, value: object) -> datetime:
        return normalize_offset_datetime(value)

    @field_validator("chemical_formula", mode="before")
    @classmethod
    def normalize_formula(cls, value: object) -> object:
        if value in (None, ""):
            return value
        if not isinstance(value, str):
            raise ValueError("invalid chemical formula")
        return validate_chemical_formula(value)

    @field_validator("performed_by_user_ids")
    @classmethod
    def unique_performers(cls, value: list[UUID] | None) -> list[UUID] | None:
        if value is not None and len(value) != len(set(value)):
            raise ValueError("performed_by_user_ids must be unique")
        return value

    @model_validator(mode="after")
    def validate_ambient_humidity(self) -> V2ExperimentCreate:
        if self.ambient_humidity.value is not None and not 0 <= self.ambient_humidity.value <= 100:
            raise ValueError("ambient humidity must be between 0 and 100 percent")
        return self


class V2ExperimentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    run_code: str
    owner_id: UUID
    operator: str | None
    schema_version: str
    target_material_system: str | None
    experiment_date: date
    objective: str | None
    status: Literal["draft", "locked", "reviewed", "invalid"]
    invalid_reason: str | None
    result_missing_todo: bool | None
    locked_at: datetime | None
    current_revision_id: UUID | None
    draft_supersedes_revision_id: UUID | None
    correction_reason: str | None
    not_characterized_by_id: UUID | None
    not_characterized_at: datetime | None
    setup_ref: UUID | None
    setup_ref_version: int | None
    setup_ref_snapshot_json: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class V2ExperimentListResponse(BaseModel):
    items: list[V2ExperimentRead]
    total: int


class V2RunAuditEventRead(BaseModel):
    actor_name: str
    action: str
    reason: str | None
    created_at: datetime


class V2RunAuditEventListResponse(BaseModel):
    items: list[V2RunAuditEventRead]
    total: int


class V2InvalidateRequest(BaseModel):
    reason: str = Field(min_length=1)


class V2NotCharacterizedRequest(BaseModel):
    confirmed: bool


class V2ModulePayloadUpsert(BaseModel):
    payload_json: dict[str, Any] = Field(default_factory=dict)


class V2ModulePayloadRead(BaseModel):
    id: UUID
    experiment_run_id: UUID
    module_key: str
    schema_version: str
    payload_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class V2SetupReferenceRequest(BaseModel):
    setup_id: UUID
    version: int
    tube_usage_history: TubeUsageHistoryPayload
