from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictFloat, StrictInt

from app.models.module_payload import ExperimentModuleKey


class ModulePayloadBase(BaseModel):
    model_config = ConfigDict(extra="allow")


class EnvironmentPayload(ModulePayloadBase):
    indoor_temperature_C: StrictFloat | None = None
    indoor_humidity_percent: StrictFloat | None = None
    sample_env: str | None = None
    abnormal_note: str | None = None


class PrecheckPayload(ModulePayloadBase):
    seal_intact: StrictBool | None = None
    risk_note: str | None = None
    hood_clean: StrictBool | None = None
    flange_blocked: StrictBool | None = None
    boat_contamination_level: StrictBool | None = None
    tube_contamination_level: StrictBool | None = None


class PrecursorItemPayload(ModulePayloadBase):
    model_config = ConfigDict(extra="forbid")

    species: str | None = None
    brand: str | None = None
    concentration: StrictFloat | None = None
    concentration_unit: str | None = None
    method: str | None = None
    melting_temperature_C: StrictFloat | None = None
    spin_speed_rpm: StrictFloat | None = None
    pre_spin_speed_rpm: StrictFloat | None = None
    preparation_time_min: StrictFloat | None = None
    mass_mg: StrictFloat | None = None
    batch_no: str | None = None


class PrecursorsPayload(ModulePayloadBase):
    items: list[PrecursorItemPayload] | None = None


class SubstrateTreatmentParamsPayload(ModulePayloadBase):
    temperature_C: StrictFloat | None = None
    duration_min: StrictFloat | None = None
    power_W: StrictFloat | None = None
    gas: str | None = None


class SubstrateItemPayload(ModulePayloadBase):
    role: str | None = None
    type: str | None = None
    brand: str | None = None
    size_mm: str | None = None
    treatment_method: str | None = None
    position_mm: StrictFloat | None = None
    treatment_params: SubstrateTreatmentParamsPayload | None = None


class SubstratesPayload(ModulePayloadBase):
    items: list[SubstrateItemPayload] | None = None


class FurnacePointPayload(ModulePayloadBase):
    time_min: StrictFloat | None = None
    temperature_C: StrictFloat | None = None


class FurnaceZonePayload(ModulePayloadBase):
    zone_index: StrictInt | None = None
    precursor_placed: StrictBool | None = None
    temperature_program: list[FurnacePointPayload] | None = None
    note: str | None = None


class FurnaceProgramPayload(ModulePayloadBase):
    zones: list[FurnaceZonePayload] | None = None


class GasComponentPayload(ModulePayloadBase):
    name: str | None = None
    gas: str | None = None
    flow_sccm: StrictFloat | None = None
    fraction: StrictFloat | None = None
    ratio_percent: StrictFloat | None = None


class GasSegmentPayload(ModulePayloadBase):
    stage: str | None = None
    start_min: StrictFloat | None = None
    end_min: StrictFloat | None = None
    gas: str | None = None
    flow_sccm: StrictFloat | None = None
    note: str | None = None
    components: list[GasComponentPayload] | None = None


class GasProgramPayload(ModulePayloadBase):
    pre_washing_gas: str | None = None
    segments: list[GasSegmentPayload] | None = None


class ProcessObservationPayload(ModulePayloadBase):
    color_change: str | None = None
    abnormal_events: list[str] | None = None
    note: str | None = None


class CharacterizationMethodPayload(ModulePayloadBase):
    method: str | None = None
    result: str | None = None
    enabled: StrictBool | None = None
    excitation_nm: StrictFloat | None = None
    note: str | None = None


class CharacterizationPayload(ModulePayloadBase):
    methods: list[CharacterizationMethodPayload] | None = None


class ResultSummaryPayload(ModulePayloadBase):
    summary_result: str | None = None
    quality_label: str | None = None
    next_step: str | None = None


MODULE_PAYLOAD_MODELS: dict[str, type[BaseModel]] = {
    ExperimentModuleKey.ENVIRONMENT.value: EnvironmentPayload,
    ExperimentModuleKey.PRECHECK.value: PrecheckPayload,
    ExperimentModuleKey.PRECURSORS.value: PrecursorsPayload,
    ExperimentModuleKey.SUBSTRATES.value: SubstratesPayload,
    ExperimentModuleKey.FURNACE_PROGRAM.value: FurnaceProgramPayload,
    ExperimentModuleKey.GAS_PROGRAM.value: GasProgramPayload,
    ExperimentModuleKey.PROCESS_OBSERVATION.value: ProcessObservationPayload,
    ExperimentModuleKey.CHARACTERIZATION.value: CharacterizationPayload,
    ExperimentModuleKey.RESULT_SUMMARY.value: ResultSummaryPayload,
}


def validate_module_payload(module_key: str, payload_json: dict[str, Any]) -> dict[str, Any]:
    model = MODULE_PAYLOAD_MODELS.get(module_key)
    if model is None:
        return payload_json
    return model.model_validate(payload_json).model_dump(mode="json", exclude_none=False)


class ExperimentModulePayloadUpsert(BaseModel):
    payload_json: dict[str, Any] = Field(default_factory=dict)
    schema_version: str = Field(default="cvd_v1", min_length=1, max_length=64)


class ExperimentModulePayloadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    experiment_run_id: UUID
    module_key: str
    schema_version: str
    payload_json: dict[str, Any]
    note: str | None
    created_at: datetime
    updated_at: datetime


class ExperimentModulePayloadListResponse(BaseModel):
    items: list[ExperimentModulePayloadRead]
    total: int
