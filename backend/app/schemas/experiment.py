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


class ExperimentFromRecipeCreate(BaseModel):
    recipe_id: UUID
    experiment_date: date | None = None
    objective: str | None = None


class ExperimentSaveAsRecipeRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class ExperimentUpdate(BaseModel):
    experiment_type: str | None = Field(default=None, min_length=1, max_length=64)
    material_system: str | None = Field(default=None, max_length=64)
    experiment_date: date | None = None
    objective: str | None = None
    summary_result: str | None = None


class ExperimentInvalidateRequest(BaseModel):
    reason: str = Field(min_length=1)


class ExperimentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    run_code: str
    owner_id: UUID
    recipe_id: UUID | None
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


class ExperimentAnalysisExperimentRow(BaseModel):
    experiment_id: UUID
    run_code: str
    owner_id: UUID
    recipe_id: UUID | None
    derived_from_run_id: UUID | None
    derived_from_run_code: str | None
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


class ExperimentAnalysisPrecursorRow(BaseModel):
    experiment_id: UUID
    run_code: str
    precursor_index: int
    species: str | None
    brand: str | None
    concentration: float | None
    concentration_unit: str | None
    method: str | None
    melting_temperature_C: float | None
    spin_speed_rpm: float | None
    pre_spin_speed_rpm: float | None
    preparation_time_min: float | None
    mass_mg: float | None
    batch_no: str | None


class ExperimentAnalysisSubstrateRow(BaseModel):
    experiment_id: UUID
    run_code: str
    substrate_index: int
    role: str | None
    type: str | None
    brand: str | None
    size_mm: str | None
    treatment_method: str | None
    position_mm: float | None
    treatment_params_temperature_C: float | None
    treatment_params_duration_min: float | None
    treatment_params_power_W: float | None
    treatment_params_gas: str | None


class ExperimentAnalysisFurnacePointRow(BaseModel):
    experiment_id: UUID
    run_code: str
    furnace_zone_index: int
    zone_index: int | None
    temperature_point_index: int
    precursor_placed: bool | None
    zone_note: str | None
    time_min: float | None
    temperature_C: float | None


class ExperimentAnalysisGasSegmentRow(BaseModel):
    experiment_id: UUID
    run_code: str
    gas_segment_index: int
    pre_washing_gas: str | None
    stage: str | None
    start_min: float | None
    end_min: float | None
    gas: str | None
    flow_sccm: float | None
    note: str | None
    component_count: int


class ExperimentAnalysisGasProgramRow(BaseModel):
    experiment_id: UUID
    run_code: str
    gas_program_index: int
    pre_washing_gas: str | None


class ExperimentAnalysisGasComponentRow(BaseModel):
    experiment_id: UUID
    run_code: str
    gas_segment_index: int
    gas_component_index: int
    stage: str | None
    segment_gas: str | None
    component_name: str | None
    component_gas: str | None
    fraction: float | None
    ratio_percent: float | None


class ExperimentAnalysisCharacterizationRow(BaseModel):
    experiment_id: UUID
    run_code: str
    characterization_index: int
    method: str | None
    result: str | None
    enabled: bool | None
    excitation_nm: float | None
    note: str | None


class ExperimentAnalysisSampleRow(BaseModel):
    experiment_id: UUID
    run_code: str
    sample_id: UUID
    sample_code: str
    parent_sample_id: UUID | None
    role: str
    substrate_type: str | None
    brand: str | None
    size_mm: str | None
    treatment: str | None
    position_mm: float | None
    storage_location: str | None
    metadata_json_text: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    deleted_by_id: UUID | None
    is_deleted: bool


class ExperimentAnalysisFileRow(BaseModel):
    experiment_id: UUID
    run_code: str
    file_id: UUID
    sample_id: UUID | None
    original_name: str
    method: str
    file_category: str
    content_type: str | None
    size_bytes: int
    sha256: str
    note: str | None
    metadata_json_text: str
    created_at: datetime
    updated_at: datetime


class ExperimentAnalysisExportRead(BaseModel):
    export_version: str
    exported_at: datetime
    experiment: ExperimentAnalysisExperimentRow
    precursor_rows: list[ExperimentAnalysisPrecursorRow]
    substrate_rows: list[ExperimentAnalysisSubstrateRow]
    furnace_point_rows: list[ExperimentAnalysisFurnacePointRow]
    gas_program_rows: list[ExperimentAnalysisGasProgramRow]
    gas_segment_rows: list[ExperimentAnalysisGasSegmentRow]
    gas_component_rows: list[ExperimentAnalysisGasComponentRow]
    characterization_rows: list[ExperimentAnalysisCharacterizationRow]
    sample_rows: list[ExperimentAnalysisSampleRow]
    file_rows: list[ExperimentAnalysisFileRow]
