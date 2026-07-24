from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.services.v2_field_source import normalize_offset_datetime, validate_chemical_formula
from app.services.v2_result_evidence import has_measured_product_evidence


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
    attrs: dict[str, Any] = Field(default_factory=dict)


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


class SpectralMetric(BaseModel):
    model_config = ConfigDict(extra="forbid")

    metric_code: str = Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")
    value: float = Field(strict=True, allow_inf_nan=False)
    unit: str = Field(min_length=1, max_length=32)

    @field_validator("unit")
    @classmethod
    def validate_unit(cls, value: str) -> str:
        if not (normalized := value.strip()):
            raise ValueError("unit cannot be blank")
        return normalized


class MeasuredProductMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    observed_phenomena: list[str] | None = None
    detected_phase_stacking: str | None = None
    layer_count: int | None = Field(default=None, strict=True, ge=0)
    coverage_percent: float | None = Field(
        default=None,
        strict=True,
        ge=0,
        le=100,
        allow_inf_nan=False,
    )
    domain_size_um: float | None = Field(
        default=None,
        strict=True,
        gt=0,
        allow_inf_nan=False,
    )
    nucleation_density_cm2: float | None = Field(
        default=None,
        strict=True,
        ge=0,
        allow_inf_nan=False,
    )
    key_spectral_metrics: list[SpectralMetric] | None = None

    @field_validator("detected_phase_stacking")
    @classmethod
    def validate_detected_phase_stacking(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not (normalized := value.strip()):
            raise ValueError("detected_phase_stacking cannot be blank")
        return normalized


class MeasuredProductCreate(MeasuredProductMetrics):
    characterization_record_id: UUID | None = None
    attrs: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def require_evidence(self) -> MeasuredProductCreate:
        if not has_measured_product_evidence(self.model_dump()):
            raise ValueError("Measured product requires at least one evidence field")
        return self


class MeasuredProductUpdate(MeasuredProductMetrics):
    attrs: dict[str, Any] = Field(default_factory=dict)


class MeasuredProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sample_id: UUID
    characterization_record_id: UUID | None
    observed_phenomena: list[str] | None
    detected_phase_stacking: str | None
    layer_count: int | None
    coverage_percent: float | None
    domain_size_um: float | None
    nucleation_density_cm2: float | None
    measured_layers_coverage: str | None
    domain_nucleation_continuity: str | None
    key_spectral_metrics: list[SpectralMetric] | dict[str, Any] | None
    attrs: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class MeasuredProductListResponse(BaseModel):
    items: list[MeasuredProductRead]
    total: int


class V2ResultWrite(MeasuredProductMetrics):
    kind: Literal["direct_observation", "characterization"]
    instrument_id: UUID | None = None
    instrument_version: int | None = Field(default=None, ge=1)
    method_instrument: str | None = Field(default=None, max_length=128)
    test_conditions: str | None = None

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
                    self.layer_count,
                    self.coverage_percent,
                    self.domain_size_um,
                    self.nucleation_density_cm2,
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
    layer_count: int | None
    coverage_percent: float | None
    domain_size_um: float | None
    nucleation_density_cm2: float | None
    measured_layers_coverage: str | None
    domain_nucleation_continuity: str | None
    key_spectral_metrics: list[SpectralMetric] | dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class V2ResultListResponse(BaseModel):
    items: list[V2ResultRead]
    total: int
