from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictFloat, StrictInt

from app.models.module_payload import ExperimentModuleKey


class ModulePayloadBase(BaseModel):
    model_config = ConfigDict(extra="allow")


class BasicInfoPayload(ModulePayloadBase):
    operator_id: str | None = None
    experiment_type: str | None = None
    material_system: str | None = None
    experiment_date: str | None = None
    layer_count: str | None = None
    objective: str | None = None
    recipe_id: str | None = None


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
    batch_no: str | None = None
    treatment_method: str | None = None
    position_mm: StrictFloat | None = None
    treatment_params: SubstrateTreatmentParamsPayload | None = None


class SubstratesPayload(ModulePayloadBase):
    items: list[SubstrateItemPayload] | None = None


class FurnaceInfoPayload(ModulePayloadBase):
    zones_count: StrictInt | None = None
    model: str | None = None
    initial_temperatures_C: dict[str, StrictFloat | None] | None = None


class FurnacePrecursorPayload(ModulePayloadBase):
    material: str | None = None
    position_cm: StrictFloat | None = None
    mass_mg: StrictFloat | None = None
    note: str | None = None


class FurnacePlacementPayload(ModulePayloadBase):
    precursor_index: StrictInt | None = None
    zone_key: str | None = None
    position_cm: StrictFloat | None = None
    note: str | None = None


class FurnaceStepPayload(ModulePayloadBase):
    step_index: StrictInt | None = None
    step_name: str | None = None
    duration_min: StrictFloat | None = None
    is_hold: StrictBool | None = None
    temperatures_C: dict[str, StrictFloat | None] | None = None
    note: str | None = None


class FurnaceTemperatureNodePayload(ModulePayloadBase):
    node_index: StrictInt | None = None
    time_min: StrictFloat | None = None
    temperature_C: StrictFloat | None = None
    note: str | None = None


class FurnaceZonePayload(ModulePayloadBase):
    zone_key: str | None = None
    zone_index: StrictInt | None = None
    temperature_program: list[FurnaceTemperatureNodePayload] | None = None
    note: str | None = None


class FurnaceProgramPayload(ModulePayloadBase):
    furnace_info: FurnaceInfoPayload | None = None
    placements: list[FurnacePlacementPayload] | None = None
    precursors: list[FurnacePrecursorPayload] | None = None
    zones: list[FurnaceZonePayload] | None = None
    steps: list[FurnaceStepPayload] | None = None


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
    ExperimentModuleKey.BASIC_INFO.value: BasicInfoPayload,
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
    validated = model.model_validate(payload_json)
    if module_key == ExperimentModuleKey.BASIC_INFO.value:
        return validated.model_dump(mode="json", exclude_unset=True)

    dumped = validated.model_dump(mode="json", exclude_none=False)
    if module_key == ExperimentModuleKey.SUBSTRATES.value:
        _drop_unset_substrate_batch_numbers(payload_json, dumped)
    return dumped


def _drop_unset_substrate_batch_numbers(
    source_payload: dict[str, Any],
    normalized_payload: dict[str, Any],
) -> None:
    source_items = source_payload.get("items")
    normalized_items = normalized_payload.get("items")
    if not isinstance(source_items, list) or not isinstance(normalized_items, list):
        return

    for source_item, normalized_item in zip(source_items, normalized_items, strict=False):
        if not isinstance(source_item, dict) or not isinstance(normalized_item, dict):
            continue
        if "batch_no" not in source_item:
            normalized_item.pop("batch_no", None)


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
