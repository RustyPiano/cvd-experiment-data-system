from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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
    synthesis_method: str = Field(min_length=1)
    operator: str = Field(min_length=1)
    run_code: str | None = Field(default=None, max_length=32)
    chemical_formula: str | None = None
    objective: str | None = None


class V2ExperimentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    run_code: str
    owner_id: UUID
    schema_version: str
    material_system: str | None
    experiment_date: date
    objective: str | None
    status: str
    result_missing_todo: bool | None
    submitted_at: datetime | None
    locked_at: datetime | None
    setup_ref: UUID | None
    setup_ref_version: int | None
    setup_ref_snapshot_json: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class V2ExperimentListResponse(BaseModel):
    items: list[V2ExperimentRead]
    total: int


class V2InvalidateRequest(BaseModel):
    reason: str = Field(min_length=1)


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


class CharacterizationRecordCreate(BaseModel):
    sample_id: UUID
    instrument_id: UUID | None = None
    instrument_version: int | None = None
    method_instrument: str | None = None
    test_conditions: str | None = None
    raw_data: dict[str, Any] | None = None
    attrs: dict[str, Any] = Field(default_factory=dict)


class CharacterizationRecordUpdate(BaseModel):
    method_instrument: str | None = None
    test_conditions: str | None = None
    raw_data: dict[str, Any] | None = None
    attrs: dict[str, Any] | None = None


class CharacterizationRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    experiment_run_id: UUID
    sample_id: UUID
    instrument_id: UUID | None
    instrument_version: int | None
    instrument_snapshot_json: dict[str, Any] | None
    method_instrument: str | None
    test_conditions: str | None
    raw_data: dict[str, Any] | None
    attrs: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class CharacterizationRecordListResponse(BaseModel):
    items: list[CharacterizationRecordRead]
    total: int


class MeasuredProductCreate(BaseModel):
    characterization_record_id: UUID | None = None
    observed_phenomena: list[str] | None = None
    detected_phase_stacking: str | None = None
    measured_layers_coverage: str | None = None
    domain_nucleation_continuity: str | None = None
    key_spectral_metrics: dict[str, Any] | None = None
    attrs: dict[str, Any] = Field(default_factory=dict)


class MeasuredProductUpdate(BaseModel):
    characterization_record_id: UUID | None = None
    observed_phenomena: list[str] | None = None
    detected_phase_stacking: str | None = None
    measured_layers_coverage: str | None = None
    domain_nucleation_continuity: str | None = None
    key_spectral_metrics: dict[str, Any] | None = None
    attrs: dict[str, Any] | None = None


class MeasuredProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sample_id: UUID
    characterization_record_id: UUID | None
    observed_phenomena: list[str] | None
    detected_phase_stacking: str | None
    measured_layers_coverage: str | None
    domain_nucleation_continuity: str | None
    key_spectral_metrics: dict[str, Any] | None
    attrs: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class MeasuredProductListResponse(BaseModel):
    items: list[MeasuredProductRead]
    total: int
