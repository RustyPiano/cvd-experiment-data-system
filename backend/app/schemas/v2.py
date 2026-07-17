from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    run_code: str | None = Field(
        default=None,
        max_length=32,
        pattern=r"^CVD-\d{4}-\d{4}$",
    )
    chemical_formula: str | None = Field(default=None, max_length=64)
    objective: str | None = None


class V2ExperimentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    run_code: str
    owner_id: UUID
    operator: str | None
    schema_version: str
    material_system: str | None
    experiment_date: date
    objective: str | None
    status: Literal["draft", "locked", "invalid"]
    invalid_reason: str | None
    result_missing_todo: bool | None
    locked_at: datetime | None
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


class CharacterizationRecordCreate(BaseModel):
    sample_id: UUID
    instrument_id: UUID | None = None
    instrument_version: int | None = None
    method_instrument: str = Field(min_length=1, max_length=128)
    test_conditions: str | None = None
    raw_data: dict[str, Any] | None = None
    attrs: dict[str, Any] = Field(default_factory=dict)


class CharacterizationRecordUpdate(BaseModel):
    method_instrument: str | None = Field(default=None, min_length=1, max_length=128)
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


class V2ResultWrite(BaseModel):
    kind: Literal["direct_observation", "characterization"]
    instrument_id: UUID | None = None
    instrument_version: int | None = Field(default=None, ge=1)
    method_instrument: str | None = Field(default=None, max_length=128)
    test_conditions: str | None = None
    observed_phenomena: list[str] | None = None
    detected_phase_stacking: str | None = None
    measured_layers_coverage: str | None = None
    domain_nucleation_continuity: str | None = None
    key_spectral_metrics: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_kind_fields(self) -> V2ResultWrite:
        if (self.instrument_id is None) != (self.instrument_version is None):
            raise ValueError("instrument_id and instrument_version must be provided together")
        if self.kind == "direct_observation":
            if not self.observed_phenomena:
                raise ValueError("Direct observation requires observed_phenomena")
            if any(
                value is not None
                for value in (
                    self.instrument_id,
                    self.method_instrument,
                    self.test_conditions,
                    self.detected_phase_stacking,
                    self.measured_layers_coverage,
                    self.domain_nucleation_continuity,
                    self.key_spectral_metrics,
                )
            ):
                raise ValueError("Direct observation cannot include characterization fields")
        elif not (self.method_instrument or "").strip():
            raise ValueError("Characterization result requires method_instrument")
        return self


class V2ResultRead(BaseModel):
    id: UUID
    sample_id: UUID
    kind: Literal["direct_observation", "characterization"]
    characterization_record_id: UUID | None
    instrument_id: UUID | None
    instrument_version: int | None
    instrument_snapshot_json: dict[str, Any] | None
    method_instrument: str | None
    test_conditions: str | None
    observed_phenomena: list[str] | None
    detected_phase_stacking: str | None
    measured_layers_coverage: str | None
    domain_nucleation_continuity: str | None
    key_spectral_metrics: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class V2ResultListResponse(BaseModel):
    items: list[V2ResultRead]
    total: int
