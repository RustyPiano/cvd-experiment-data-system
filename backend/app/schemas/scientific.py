from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.scientific_units import normalize_process_value, validate_process_unit
from app.services.v2_field_source import (
    canonical_gas_species,
    characterization_profiles,
    characterization_property_units,
    normalize_offset_datetime,
    validate_chemical_formula,
)


class AmbientMeasurement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: float | None = Field(default=None, allow_inf_nan=False)
    measured_at: datetime | None = None
    source_type: Literal[
        "room_sensor",
        "setup_sensor",
        "manual_estimate",
        "not_measured",
    ]
    sensor_ref: str | None = Field(default=None, max_length=255)

    @field_validator("measured_at", mode="before")
    @classmethod
    def normalize_measured_at(cls, value: object) -> datetime | None:
        if value is None:
            return None
        return normalize_offset_datetime(value)

    @model_validator(mode="after")
    def validate_source_evidence(self) -> Self:
        if self.source_type == "not_measured":
            if self.value is not None or self.measured_at is not None or self.sensor_ref:
                raise ValueError("not_measured ambient values cannot include evidence")
            return self
        if self.value is None or self.measured_at is None:
            raise ValueError("ambient values require value and measured_at")
        if self.source_type in {"room_sensor", "setup_sensor"} and not (
            self.sensor_ref and self.sensor_ref.strip()
        ):
            raise ValueError("measured ambient values require sensor_ref")
        if self.source_type == "manual_estimate" and self.sensor_ref:
            raise ValueError("manual estimates cannot reference a sensor")
        return self


class PrecheckRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    checklist_version: str = Field(min_length=1, max_length=64)
    confirmed: bool
    confirmed_at: datetime
    exception_note: str | None = Field(default=None, max_length=1000)

    @field_validator("confirmed_at", mode="before")
    @classmethod
    def normalize_confirmed_at(cls, value: object) -> datetime:
        return normalize_offset_datetime(value)


class ScientificBasicInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    started_at: datetime
    synthesis_method: Literal["CVD"]
    run_code: str = Field(pattern=r"^CVD-\d{4}-\d{4}$")
    created_by_user_id: UUID
    performed_by_user_ids: list[UUID] = Field(min_length=1)
    recorded_by_user_id: UUID
    ambient_temperature: AmbientMeasurement = Field(
        default_factory=lambda: AmbientMeasurement(source_type="not_measured")
    )
    ambient_humidity: AmbientMeasurement = Field(
        default_factory=lambda: AmbientMeasurement(source_type="not_measured")
    )
    precheck: PrecheckRecord

    @field_validator("started_at", mode="before")
    @classmethod
    def normalize_started_at(cls, value: object) -> datetime:
        return normalize_offset_datetime(value)

    @field_validator("performed_by_user_ids")
    @classmethod
    def unique_performers(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("performed_by_user_ids must be unique")
        return value


class TargetMaterialRegionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    region_key: str = Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")
    formula: str = Field(min_length=1, max_length=128)
    spatial_role: Literal["single_region", "layer", "lateral_region", "mixed_region"]
    layer_index: int | None = Field(default=None, ge=1)
    lateral_region: str | None = Field(default=None, max_length=128)
    target_layer_count: int | None = Field(default=None, ge=1)
    target_bulk_phase: str | None = Field(default=None, max_length=128)
    attrs: dict[str, Any] = Field(default_factory=dict)

    @field_validator("formula")
    @classmethod
    def normalize_formula(cls, value: str) -> str:
        return validate_chemical_formula(value)


class TargetCompositionRelationPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    relation_type: Literal[
        "doped_by",
        "substitutional_alloy",
        "intercalated_by",
        "decorated_by",
    ]
    host_region_key: str = Field(min_length=1, max_length=64)
    species: str = Field(min_length=1, max_length=128)
    nominal_value: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    value_basis: Literal[
        "at_percent",
        "mol_fraction",
        "site_fraction",
        "ratio",
        "unspecified",
    ]
    site_or_location: str | None = Field(default=None, max_length=128)

    @model_validator(mode="after")
    def validate_value_basis(self) -> Self:
        if self.nominal_value is not None and self.value_basis == "unspecified":
            raise ValueError("a numeric nominal value requires an explicit value basis")
        if self.value_basis == "at_percent" and (
            self.nominal_value is None or self.nominal_value > 100
        ):
            raise ValueError("at_percent requires a value from 0 to 100")
        if self.value_basis in {"mol_fraction", "site_fraction"} and (
            self.nominal_value is None or self.nominal_value > 1
        ):
            raise ValueError("fraction basis requires a value from 0 to 1")
        return self


class TargetSpecPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    architecture_type: Literal[
        "single_region",
        "vertical_stack",
        "lateral_junction",
        "mixed_architecture",
    ]
    material_regions: list[TargetMaterialRegionPayload] = Field(min_length=1)
    composition_relations: list[TargetCompositionRelationPayload] = Field(default_factory=list)
    dimensional_form: Literal["sheet", "ribbon", "tube", "rod", "particle"] | None = None
    coverage_state: (
        Literal[
            "isolated",
            "discontinuous",
            "percolated",
            "continuous",
        ]
        | None
    ) = None
    orientation: Literal["in_plane", "vertical", "mixed"] | None = None
    optimization_objective: str | None = Field(default=None, max_length=2000)
    note: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_orthogonal_target(self) -> Self:
        keys = [region.region_key for region in self.material_regions]
        if len(keys) != len(set(keys)):
            raise ValueError("material region keys must be unique")
        key_set = set(keys)
        if any(relation.host_region_key not in key_set for relation in self.composition_relations):
            raise ValueError("composition relation host_region_key does not exist")
        if self.architecture_type == "single_region" and len(self.material_regions) != 1:
            raise ValueError("single_region requires exactly one material region")
        if self.architecture_type == "vertical_stack":
            indices = [region.layer_index for region in self.material_regions]
            if len(indices) < 2 or any(index is None for index in indices):
                raise ValueError("vertical_stack requires at least two indexed layers")
            if sorted(indices) != list(range(1, len(indices) + 1)):
                raise ValueError("vertical layer indices must be consecutive from one")
        if self.architecture_type == "lateral_junction":
            labels = [region.lateral_region for region in self.material_regions]
            if len(labels) < 2 or any(not label for label in labels):
                raise ValueError("lateral_junction requires at least two named regions")
        return self


class SourcePosition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    axial_mm: float = Field(allow_inf_nan=False)
    radial_mm: float | None = Field(default=None, allow_inf_nan=False)
    azimuth_deg: float | None = Field(default=None, ge=0, lt=360, allow_inf_nan=False)
    reference: Literal["setup_origin"]


class SourcePositionPoint(SourcePosition):
    t_s: float = Field(ge=0, allow_inf_nan=False)


class PreparationStepPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_type: Literal[
        "direct_load",
        "grind",
        "mix",
        "pelletize",
        "spin_coat",
        "pre_anneal",
        "other",
    ]
    sequence: int = Field(ge=1)
    parameters: dict[str, Any] = Field(default_factory=dict)


class SourceIngredientPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    material_lot_id: UUID
    material_lot_version: int = Field(ge=1)
    function_role: Literal[
        "metal_source",
        "chalcogen_source",
        "carbon_source",
        "dopant_source",
        "promoter",
        "transport_agent",
        "etchant",
        "reducing_agent",
        "oxidizing_agent",
        "carrier_gas",
        "other",
    ]
    amount: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    unit: str | None = Field(default=None, max_length=32)
    composition_basis: str | None = Field(default=None, max_length=64)
    uncertainty: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    attrs: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_quantity(self) -> Self:
        if (self.amount is None) != (self.unit is None):
            raise ValueError("amount and unit must be provided together")
        return self


class SourceLoadPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    load_key: str = Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")
    container_instance_id: UUID | None = None
    loading_method: Literal[
        "boat",
        "crucible",
        "substrate_surface",
        "gas_line",
        "bubbler",
        "other",
    ]
    preparation_steps: list[PreparationStepPayload] = Field(default_factory=list)
    initial_position: SourcePosition | None = None
    position_program: list[SourcePositionPoint] = Field(default_factory=list)
    heating_zone_ref: str | None = Field(
        default=None,
        max_length=64,
        pattern=r"^zone_[1-9][0-9]*$",
    )
    ingredients: list[SourceIngredientPayload] = Field(min_length=1)
    attrs: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_load(self) -> Self:
        if len({item.material_lot_id for item in self.ingredients}) != len(self.ingredients):
            raise ValueError("a material lot may appear only once in one source load")
        sequences = [step.sequence for step in self.preparation_steps]
        if sorted(sequences) != list(range(1, len(sequences) + 1)):
            raise ValueError("preparation step sequence must be consecutive from one")
        times = [point.t_s for point in self.position_program]
        if times != sorted(times) or len(times) != len(set(times)):
            raise ValueError("position program times must be unique and ascending")
        return self


class SourceLoadsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[SourceLoadPayload] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_load_keys(self) -> Self:
        keys = [item.load_key for item in self.items]
        if len(keys) != len(set(keys)):
            raise ValueError("source load keys must be unique")
        return self


class ProcessSegmentPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    segment_key: str = Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")
    segment_type: Literal[
        "purge",
        "ramp",
        "nucleation",
        "growth",
        "anneal",
        "cooling",
        "transfer",
        "other",
    ]
    sequence: int = Field(ge=1)
    start_s: float = Field(ge=0, allow_inf_nan=False)
    end_s: float = Field(gt=0, allow_inf_nan=False)
    label: str | None = Field(default=None, max_length=128)
    note: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_interval(self) -> Self:
        if self.end_s <= self.start_s:
            raise ValueError("segment end must be after start")
        return self


class ProcessChannelPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_s: float = Field(ge=0, allow_inf_nan=False)
    end_s: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    value: float | str | bool

    @model_validator(mode="after")
    def validate_interval(self) -> Self:
        if self.end_s is not None and self.end_s <= self.start_s:
            raise ValueError("channel interval end must be after start")
        if isinstance(self.value, float) and not (-1e300 < self.value < 1e300):
            raise ValueError("channel value must be finite")
        return self


class ProcessChannelPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    channel_key: str = Field(pattern=r"^channel_[0-9a-f]{8}(?:_[0-9a-f]{4}){3}_[0-9a-f]{12}$")
    channel_type: Literal[
        "temperature",
        "flow",
        "pressure",
        "valve_state",
        "source_position",
        "furnace_position",
        "plasma_power",
        "shutter_state",
    ]
    source_type: Literal["setpoint", "measured", "inferred"]
    subject_type: Literal[
        "temperature_zone",
        "gas_species",
        "pressure_location",
        "device",
    ]
    subject_ref: str = Field(min_length=1, max_length=128)
    subject_instance_ref: str = Field(min_length=1, max_length=128)
    subject_snapshot: dict[str, Any] | None = None
    gas_species_code: str | None = Field(default=None, max_length=32)
    gas_lot_id: UUID | None = None
    gas_lot_version: int | None = Field(default=None, ge=1)
    zone_index: int | None = Field(default=None, ge=1)
    pressure_location: str | None = Field(default=None, max_length=128)
    pressure_type: Literal["absolute", "gauge", "differential"] | None = None
    unit: str = Field(min_length=1, max_length=32)
    data_kind: Literal["scalar", "interval_series", "timeseries_file"]
    scalar_value: float | None = Field(default=None, allow_inf_nan=False)
    series: list[ProcessChannelPoint] | None = None
    file_asset_id: UUID | None = None

    @model_validator(mode="after")
    def validate_data_shape(self) -> Self:
        self.subject_ref = self.subject_ref.strip()
        if not self.subject_ref:
            raise ValueError("subject_ref cannot be blank")
        self.subject_instance_ref = self.subject_instance_ref.strip()
        if not self.subject_instance_ref:
            raise ValueError("subject_instance_ref cannot be blank")
        if self.channel_type == "temperature":
            if (
                self.subject_type != "temperature_zone"
                or self.zone_index is None
                or self.subject_ref != f"zone_{self.zone_index}"
            ):
                raise ValueError("temperature channels require a matching zone subject")
        elif self.channel_type == "flow":
            self.gas_species_code = (self.gas_species_code or "").strip() or None
            if self.subject_type != "gas_species" or self.gas_species_code is None:
                raise ValueError("flow channels require an explicit gas species subject")
            self.gas_species_code = canonical_gas_species(self.gas_species_code)
            self.subject_ref = self.gas_species_code
            if (self.gas_lot_id is None) != (self.gas_lot_version is None):
                raise ValueError("gas_lot_id and gas_lot_version must be provided together")
        elif self.channel_type == "pressure":
            self.pressure_location = (self.pressure_location or "").strip() or None
            if (
                self.subject_type != "pressure_location"
                or self.pressure_location is None
                or self.pressure_type is None
                or self.subject_ref != self.pressure_location
            ):
                raise ValueError("pressure channels require location and pressure type")
        elif self.subject_type != "device":
            raise ValueError("device channels require a device subject")
        present = {
            "scalar": self.scalar_value is not None,
            "interval_series": bool(self.series),
            "timeseries_file": self.file_asset_id is not None,
        }
        if not present[self.data_kind] or sum(present.values()) != 1:
            raise ValueError("channel data must match exactly one data_kind")
        if self.data_kind == "timeseries_file" and self.channel_type.endswith("_state"):
            raise ValueError("state channels must use interval_series")
        if self.series:
            starts = [point.start_s for point in self.series]
            if starts != sorted(starts):
                raise ValueError("channel series must be ordered")
        values: list[float | str | bool] = []
        if self.scalar_value is not None:
            values.append(self.scalar_value)
        values.extend(point.value for point in self.series or [])
        for value in values:
            normalize_process_value(self.channel_type, self.unit, value)
        validate_process_unit(self.channel_type, self.unit)
        return self


class ProcessTimelinePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    segments: list[ProcessSegmentPayload] = Field(min_length=1)
    channels: list[ProcessChannelPayload] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_timeline(self) -> Self:
        segment_keys = [item.segment_key for item in self.segments]
        channel_keys = [item.channel_key for item in self.channels]
        if len(segment_keys) != len(set(segment_keys)):
            raise ValueError("segment keys must be unique")
        if len(channel_keys) != len(set(channel_keys)):
            raise ValueError("channel keys must be unique")
        semantic_keys = [
            (
                item.channel_type,
                item.subject_instance_ref.casefold(),
                item.source_type,
            )
            for item in self.channels
        ]
        if len(semantic_keys) != len(set(semantic_keys)):
            raise ValueError("channel type, physical instance, and source type must be unique")
        sequences = [item.sequence for item in self.segments]
        if sorted(sequences) != list(range(1, len(sequences) + 1)):
            raise ValueError("segment sequence must be consecutive from one")
        if not any(item.segment_type in {"nucleation", "growth"} for item in self.segments):
            raise ValueError("timeline requires at least one synthesis segment")
        ordered = sorted(self.segments, key=lambda item: item.start_s)
        if any(
            left.end_s > right.start_s for left, right in zip(ordered, ordered[1:], strict=False)
        ):
            raise ValueError("process segments cannot overlap")
        return self


class TimeRangePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_s: float = Field(ge=0, allow_inf_nan=False)
    end_s: float = Field(gt=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_interval(self) -> Self:
        if self.end_s <= self.start_s:
            raise ValueError("time range end must be after start")
        return self


class ScientificProcessEventPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_key: str = Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")
    start_s: float = Field(ge=0, allow_inf_nan=False)
    end_s: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    affected_objects: list[
        Literal[
            "source_load",
            "gas_line",
            "furnace",
            "substrate",
            "sample",
            "process_channel",
            "instrument",
            "other",
        ]
    ] = Field(default_factory=list)
    observed_deviations: list[
        Literal[
            "line_blockage",
            "pressure_excursion",
            "signal_anomaly",
            "manual_intervention",
            "equipment_alarm",
            "manual_stop",
            "power_interruption",
            "water_interruption",
            "gas_interruption",
            "plan_changed",
        ]
    ] = Field(min_length=1)
    suspected_causes: list[
        Literal[
            "line_blockage",
            "equipment_fault",
            "utility_interruption",
            "operator_action",
            "process_instability",
            "unknown",
            "other",
        ]
    ] = Field(default_factory=list)
    intervention_actions: list[
        Literal[
            "adjust_flow",
            "adjust_pressure",
            "adjust_temperature",
            "restart_supply",
            "inspect_equipment",
            "stop_run",
            "other",
        ]
    ] = Field(default_factory=list)
    outcome: Literal["recovered", "partially_recovered", "terminated", "unknown"] | None = None
    data_validity_impact: Literal["none", "partial", "invalid", "unknown"] | None = None
    excluded_time_ranges: list[TimeRangePayload] = Field(default_factory=list)
    description: str | None = Field(default=None, max_length=2000)
    attachment_file_ids: list[UUID] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_event(self) -> Self:
        if self.end_s is not None and self.end_s < self.start_s:
            raise ValueError("event end cannot be before start")
        for values in (
            self.affected_objects,
            self.observed_deviations,
            self.suspected_causes,
            self.intervention_actions,
        ):
            if len(values) != len(set(values)):
                raise ValueError("process event controlled values must be unique")
        return self


class ScientificProcessEventsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[ScientificProcessEventPayload] = Field(default_factory=list)

    @model_validator(mode="after")
    def unique_event_keys(self) -> Self:
        keys = [item.event_key for item in self.items]
        if len(keys) != len(set(keys)):
            raise ValueError("process event keys must be unique")
        return self


class RunRevisionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    experiment_run_id: UUID
    revision_number: int
    supersedes_revision_id: UUID | None
    schema_version: str
    schema_status: str
    status: Literal["locked", "reviewed", "superseded"]
    content_sha256: str
    correction_reason: str | None
    locked_by_id: UUID
    reviewed_by_id: UUID | None
    locked_at: datetime
    reviewed_at: datetime | None
    superseded_at: datetime | None


class RunRevisionListResponse(BaseModel):
    items: list[RunRevisionRead]
    total: int


class CreateCorrectionDraftRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class ReviewRunRequest(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


class SampleRegion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    geometry_type: Literal[
        "point",
        "line",
        "area",
        "whole_sample",
        "lamella",
        "particle",
        "selected_area",
    ]
    label: str = Field(min_length=1, max_length=128)
    coordinate_system: str = Field(min_length=1, max_length=128)
    x: float | None = Field(default=None, allow_inf_nan=False)
    y: float | None = Field(default=None, allow_inf_nan=False)
    width: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    height: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    unit: str | None = Field(default=None, max_length=32)
    image_file_id: UUID | None = None
    pixel_roi: dict[str, int] | None = None

    @model_validator(mode="after")
    def validate_geometry(self) -> Self:
        if (self.x is None) != (self.y is None):
            raise ValueError("x and y must be provided together")
        if any(value is not None for value in (self.x, self.y, self.width, self.height)):
            if not self.unit:
                raise ValueError("coordinate values require a unit")
        if self.geometry_type == "point" and any(
            value is not None for value in (self.width, self.height)
        ):
            raise ValueError("point regions cannot include width or height")
        if self.geometry_type == "line" and self.width is None:
            raise ValueError("line regions require a length in width")
        if self.geometry_type == "area" and (self.width is None or self.height is None):
            raise ValueError("area regions require width and height")
        if self.geometry_type in {"whole_sample", "lamella", "particle", "selected_area"} and any(
            value is not None for value in (self.width, self.height)
        ):
            raise ValueError(f"{self.geometry_type} regions cannot include width or height")
        if (self.image_file_id is None) != (self.pixel_roi is None):
            raise ValueError("image_file_id and pixel_roi must be provided together")
        return self


class NumericRange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    min: float = Field(ge=0, allow_inf_nan=False)
    max: float = Field(gt=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def ordered(self) -> Self:
        if self.max <= self.min:
            raise ValueError("range maximum must be greater than minimum")
        return self


class ScanRange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(gt=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def ordered(self) -> Self:
        if self.end <= self.start:
            raise ValueError("scan end must be greater than start")
        return self


class Size2D(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: float = Field(gt=0, allow_inf_nan=False)
    y: float = Field(gt=0, allow_inf_nan=False)


class WidthHeight(BaseModel):
    model_config = ConfigDict(extra="forbid")

    width: float = Field(gt=0, allow_inf_nan=False)
    height: float = Field(gt=0, allow_inf_nan=False)


class Resolution2D(BaseModel):
    model_config = ConfigDict(extra="forbid")

    width: int = Field(ge=1)
    height: int = Field(ge=1)


class MeasurementConditions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    laser_wavelength_nm: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    excitation_wavelength_nm: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    power_setting: str | float | None = None
    objective: str | None = Field(default=None, max_length=128)
    integration_time_s: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    accumulations: int | None = Field(default=None, ge=1)
    spectral_range_nm: NumericRange | None = None
    temperature_K: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    mode: str | None = Field(default=None, max_length=128)
    probe: str | None = Field(default=None, max_length=128)
    scan_size_um: Size2D | None = None
    resolution_px: Resolution2D | None = None
    scan_rate_hz: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    accelerating_voltage_kV: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    working_distance_mm: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    detector: str | None = Field(default=None, max_length=128)
    field_of_view_um: WidthHeight | None = None
    radiation_source: str | None = Field(default=None, max_length=128)
    scan_range_2theta_deg: ScanRange | None = None
    step_size_deg: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    scan_rate_deg_min: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    geometry: str | None = Field(default=None, max_length=128)
    sample_preparation: str | None = Field(default=None, max_length=1000)
    illumination_mode: str | None = Field(default=None, max_length=128)

    @field_validator("power_setting")
    @classmethod
    def validate_power_setting(cls, value: str | float | None) -> str | float | None:
        if isinstance(value, str) and not value.strip():
            raise ValueError("power_setting cannot be blank")
        if isinstance(value, float) and value <= 0:
            raise ValueError("power_setting must be positive")
        return value


class MeasurementRunCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sample_id: UUID
    method_profile: str = Field(min_length=1, max_length=128)
    instrument_id: UUID | None = None
    instrument_version: int | None = Field(default=None, ge=1)
    measured_at: datetime
    sample_region: SampleRegion
    typed_conditions: MeasurementConditions
    raw_file_ids: list[UUID] = Field(default_factory=list)
    quality_flag: Literal["valid", "suspect", "invalid"] = "valid"

    @field_validator("measured_at", mode="before")
    @classmethod
    def normalize_measured_at(cls, value: object) -> datetime:
        return normalize_offset_datetime(value)

    @model_validator(mode="after")
    def validate_measurement(self) -> Self:
        if (self.instrument_id is None) != (self.instrument_version is None):
            raise ValueError("instrument_id and instrument_version must be provided together")
        profile = characterization_profiles().get(self.method_profile)
        if profile is None:
            raise ValueError("unsupported method profile")
        if profile["instrument_required"] and self.instrument_id is None:
            raise ValueError("selected measurement profile requires an instrument")
        required = {item["key"] for item in profile["condition_fields"]}
        conditions = self.typed_conditions.model_dump(exclude_none=True)
        missing = sorted(required - conditions.keys())
        if missing:
            raise ValueError(f"missing typed measurement conditions: {', '.join(missing)}")
        unexpected = sorted(conditions.keys() - required)
        if unexpected:
            raise ValueError(
                f"conditions do not apply to {self.method_profile}: {', '.join(unexpected)}"
            )
        if self.sample_region.geometry_type not in profile["allowed_region_types"]:
            raise ValueError(
                f"{self.sample_region.geometry_type} does not apply to {self.method_profile}"
            )
        return self


class AnalysisRunCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    software_name: str = Field(min_length=1, max_length=128)
    software_version: str = Field(min_length=1, max_length=128)
    code_commit: str | None = Field(default=None, max_length=128)
    parameters: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime
    completed_at: datetime | None = None
    input_file_ids: list[UUID] = Field(min_length=1)
    output_file_ids: list[UUID] = Field(default_factory=list)

    @field_validator("started_at", "completed_at", mode="before")
    @classmethod
    def normalize_datetimes(cls, value: object) -> datetime | None:
        if value is None:
            return None
        return normalize_offset_datetime(value)

    @model_validator(mode="after")
    def validate_interval(self) -> Self:
        if self.completed_at is not None and self.completed_at < self.started_at:
            raise ValueError("analysis completion cannot precede its start")
        if len(self.input_file_ids) != len(set(self.input_file_ids)):
            raise ValueError("analysis input files must be unique")
        if len(self.output_file_ids) != len(set(self.output_file_ids)):
            raise ValueError("analysis output files must be unique")
        if set(self.input_file_ids) & set(self.output_file_ids):
            raise ValueError("one file cannot be both an analysis input and output")
        return self


class PropertyValueWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    property_code: str = Field(min_length=1, max_length=128, pattern=r"^[a-z][a-z0-9_]*$")
    numeric_value: float | None = Field(default=None, allow_inf_nan=False)
    text_value: str | None = Field(default=None, max_length=2000)
    structured_value: dict[str, Any] | None = None
    unit: str | None = Field(default=None, max_length=32)
    statistic: (
        Literal["single_observation", "mean", "median", "min", "max", "distribution"] | None
    ) = None
    uncertainty_value: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    uncertainty_type: str | None = Field(default=None, max_length=64)
    sample_count: int | None = Field(default=None, ge=1)
    quality_flag: Literal["valid", "suspect", "invalid", "below_detection_limit"] = "valid"
    analysis_index: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_property(self) -> Self:
        expected_unit = characterization_property_units().get(self.property_code)
        if expected_unit is None:
            raise ValueError("unsupported property_code")
        supplied = [
            self.numeric_value is not None,
            self.text_value is not None,
            self.structured_value is not None,
        ]
        if sum(supplied) != 1:
            raise ValueError("property requires exactly one value representation")
        if self.numeric_value is not None and not self.unit:
            raise ValueError("numeric property requires a unit")
        if self.numeric_value is not None and self.unit != expected_unit:
            raise ValueError(f"{self.property_code} requires unit {expected_unit}")
        if self.numeric_value is None and self.unit is not None:
            raise ValueError("non-numeric properties cannot include a unit")
        if (self.uncertainty_value is None) != (self.uncertainty_type is None):
            raise ValueError("uncertainty value and type must be provided together")
        return self


class MaterialAssertionWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assertion_type: Literal[
        "growth_presence",
        "phase_identity",
        "composition",
        "polytype",
        "stacking_order",
        "orientation_relationship",
        "layer_count",
    ]
    value: dict[str, Any]
    confidence: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    analysis_index: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_assertion_value(self) -> Self:
        if self.assertion_type == "growth_presence":
            if self.value.get("state") not in {"present", "absent", "uncertain"}:
                raise ValueError("growth_presence requires state present, absent, or uncertain")
        elif self.assertion_type == "phase_identity":
            if not isinstance(self.value.get("phase"), str) or not self.value["phase"].strip():
                raise ValueError("phase_identity requires phase")
        elif self.assertion_type == "layer_count":
            if not isinstance(self.value.get("count"), int) or self.value["count"] < 1:
                raise ValueError("layer_count requires a positive integer count")
        elif self.assertion_type == "composition":
            components = self.value.get("components")
            if (
                not isinstance(components, list)
                or not components
                or any(
                    not isinstance(component, dict)
                    or not isinstance(component.get("species"), str)
                    or not component["species"].strip()
                    or not isinstance(component.get("fraction"), int | float)
                    or isinstance(component.get("fraction"), bool)
                    or not 0 <= component["fraction"] <= 1
                    for component in components
                )
                or self.value.get("basis")
                not in {"site_fraction", "atomic_fraction", "mass_fraction"}
            ):
                raise ValueError("composition requires components and a supported fraction basis")
            if abs(sum(float(component["fraction"]) for component in components) - 1) > 1e-6:
                raise ValueError("composition fractions must sum to one")
        else:
            key = {
                "polytype": "polytype",
                "stacking_order": "stacking_order",
                "orientation_relationship": "orientation_relationship",
            }[self.assertion_type]
            if not isinstance(self.value.get(key), str) or not self.value[key].strip():
                raise ValueError(f"{self.assertion_type} requires {key}")
        return self


class MeasurementBundleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    measurement: MeasurementRunCreate
    analyses: list[AnalysisRunCreate] = Field(default_factory=list)
    properties: list[PropertyValueWrite] = Field(default_factory=list)
    assertions: list[MaterialAssertionWrite] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_evidence(self) -> Self:
        profile = characterization_profiles()[self.measurement.method_profile]
        if not self.measurement.raw_file_ids and not self.properties and not self.assertions:
            raise ValueError("measurement requires raw data, a property, or an assertion")
        if profile["raw_files_required"] and not self.measurement.raw_file_ids:
            raise ValueError("selected measurement profile requires at least one raw data file")
        unsupported_properties = sorted(
            {
                item.property_code
                for item in self.properties
                if item.property_code not in profile["allowed_property_codes"]
            }
        )
        if unsupported_properties:
            raise ValueError(
                f"properties do not apply to {self.measurement.method_profile}: "
                f"{', '.join(unsupported_properties)}"
            )
        unsupported_assertions = sorted(
            {
                item.assertion_type
                for item in self.assertions
                if item.assertion_type not in profile["allowed_assertion_types"]
            }
        )
        if unsupported_assertions:
            raise ValueError(
                f"assertions do not apply to {self.measurement.method_profile}: "
                f"{', '.join(unsupported_assertions)}"
            )
        for item in [*self.properties, *self.assertions]:
            if item.analysis_index is not None and item.analysis_index >= len(self.analyses):
                raise ValueError("analysis_index is out of range")
        raw_files = self.measurement.raw_file_ids
        if len(raw_files) != len(set(raw_files)):
            raise ValueError("measurement raw files must be unique")
        return self


class MeasurementSummaryRead(BaseModel):
    id: UUID
    run_revision_id: UUID
    run_code: str
    sample_id: UUID
    sample_code: str
    method_profile: str
    instrument_snapshot_json: dict[str, Any] | None
    performed_by_id: UUID
    measured_at: datetime
    sample_region: dict[str, Any]
    typed_conditions: dict[str, Any]
    quality_flag: str
    raw_file_count: int
    analysis_count: int
    property_count: int
    assertion_count: int


class MeasurementListResponse(BaseModel):
    items: list[MeasurementSummaryRead]
    total: int
    next_cursor: str | None = None


class TransformationOutputSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    output_role: str | None = Field(default=None, max_length=64)
    sample_region: dict[str, Any] | None = None
    dimensions: dict[str, Any] | None = None
    current_carrier: str | None = Field(default=None, max_length=255)
    control_subtype: str | None = Field(default=None, max_length=64)


class TransformationRunCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transformation_type: Literal[
        "cut",
        "split",
        "transfer",
        "stack",
        "anneal",
        "etch",
        "clean",
        "encapsulate",
        "contact_fabrication",
        "other",
    ]
    input_sample_ids: list[UUID] = Field(min_length=1)
    output_experiment_run_id: UUID | None = None
    outputs: list[TransformationOutputSpec] = Field(min_length=1)
    occurred_at: datetime
    parameters: dict[str, Any] = Field(default_factory=dict)
    destination_substrate_snapshot: dict[str, Any] | None = None
    consume_inputs: bool = False
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("occurred_at", mode="before")
    @classmethod
    def normalize_occurred_at(cls, value: object) -> datetime:
        return normalize_offset_datetime(value)

    @field_validator("input_sample_ids")
    @classmethod
    def unique_inputs(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("input samples must be unique")
        return value


class TransformationRunRead(BaseModel):
    id: UUID
    output_experiment_run_id: UUID
    transformation_type: str
    operator_id: UUID
    occurred_at: datetime
    input_sample_ids: list[UUID]
    output_sample_ids: list[UUID]


class LineageSampleRead(BaseModel):
    id: UUID
    sample_code: str
    role: str
    actual_state: str
    actual_material_summary: str | None
    lifecycle_state: str


class LineageTransformationRead(BaseModel):
    id: UUID
    transformation_type: str
    occurred_at: datetime
    operator_id: UUID
    input_sample_ids: list[UUID]
    output_sample_ids: list[UUID]


class SampleLineageRead(BaseModel):
    samples: list[LineageSampleRead]
    transformations: list[LineageTransformationRead]


class DatasetFilter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: Literal[
        "target_formula",
        "architecture_type",
        "setup_id",
        "material_lot_id",
        "substrate_material",
        "max_temperature_setpoint_C",
        "max_temperature_measured_C",
        "ramp_rate_setpoint_C_min",
        "ramp_rate_measured_C_min",
        "growth_duration_s",
        "pressure_setpoint_min_Pa",
        "pressure_setpoint_max_Pa",
        "pressure_measured_min_Pa",
        "pressure_measured_max_Pa",
        "gas_species",
        "has_process_event",
        "growth_presence",
        "property",
        "provenance_complete",
    ]
    operator: Literal["eq", "ne", "lt", "lte", "gt", "gte", "contains", "between"]
    value: Any
    property_code: str | None = Field(default=None, max_length=128)

    @model_validator(mode="after")
    def validate_operator_and_value(self) -> Self:
        numeric_fields = {
            "max_temperature_setpoint_C",
            "max_temperature_measured_C",
            "ramp_rate_setpoint_C_min",
            "ramp_rate_measured_C_min",
            "growth_duration_s",
            "pressure_setpoint_min_Pa",
            "pressure_setpoint_max_Pa",
            "pressure_measured_min_Pa",
            "pressure_measured_max_Pa",
            "property",
        }
        boolean_fields = {"has_process_event", "provenance_complete"}
        if self.field == "property":
            if self.property_code not in characterization_property_units():
                raise ValueError("property filters require a supported property_code")
        elif self.property_code is not None:
            raise ValueError("property_code applies only to property filters")
        if self.field in numeric_fields:
            if self.operator not in {"eq", "ne", "lt", "lte", "gt", "gte", "between"}:
                raise ValueError("numeric filters do not support this operator")
            values = self.value if self.operator == "between" else [self.value]
            if (
                not isinstance(values, list)
                or len(values) != (2 if self.operator == "between" else 1)
                or any(
                    isinstance(value, bool) or not isinstance(value, int | float)
                    for value in values
                )
            ):
                raise ValueError("numeric filter values must be numbers")
        elif self.field in boolean_fields:
            if self.operator not in {"eq", "ne"} or not isinstance(self.value, bool):
                raise ValueError("boolean filters require eq/ne and a boolean value")
        elif self.field == "growth_presence" and (
            self.operator not in {"eq", "ne"}
            or self.value not in {"present", "absent", "uncertain"}
        ):
            raise ValueError("growth_presence filters require a controlled state")
        elif self.operator not in {"eq", "ne", "contains"} or not isinstance(self.value, str):
            raise ValueError("text filters require eq/ne/contains and a text value")
        return self


class DatasetQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filters: list[DatasetFilter] = Field(default_factory=list, max_length=50)
    limit: int = Field(default=50, ge=1, le=500)
    cursor: str | None = None


class DatasetRunRead(BaseModel):
    run_id: UUID
    run_revision_id: UUID
    run_code: str
    revision_number: int
    locked_at: datetime
    target_formulas: list[str]
    features: dict[str, Any]
    provenance_complete: bool


class DatasetQueryResponse(BaseModel):
    items: list[DatasetRunRead]
    next_cursor: str | None
    query_manifest: dict[str, Any]


class ContainerInstanceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    material_lot_id: UUID
    container_code: str = Field(min_length=1, max_length=128)
    container_type: Literal["bottle", "gas_cylinder", "boat", "crucible", "bubbler", "other"]
    opened_date: date | None = None
    storage_history: list[dict[str, Any]] = Field(default_factory=list)
    remaining_amount: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    remaining_unit: str | None = Field(default=None, max_length=32)
    attrs: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_remaining_amount(self) -> Self:
        if (self.remaining_amount is None) != (self.remaining_unit is None):
            raise ValueError("remaining amount and unit must be provided together")
        return self


class ContainerInstanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    material_lot_id: UUID
    container_code: str
    container_type: str
    opened_date: date | None
    storage_history: list[dict[str, Any]]
    remaining_amount: float | None
    remaining_unit: str | None
    status: str
    attrs: dict[str, Any]


class EquipmentComponentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    component_code: str = Field(min_length=1, max_length=128)
    component_type: Literal[
        "furnace_tube",
        "temperature_sensor",
        "mfc",
        "pressure_gauge",
        "vacuum_pump",
        "boat",
        "crucible",
        "valve",
        "plasma_source",
        "other",
    ]
    manufacturer: str | None = Field(default=None, max_length=255)
    model: str | None = Field(default=None, max_length=128)
    serial_number: str | None = Field(default=None, max_length=128)
    attrs: dict[str, Any] = Field(default_factory=dict)


class EquipmentComponentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    component_code: str
    component_type: str
    manufacturer: str | None
    model: str | None
    serial_number: str | None
    attrs: dict[str, Any]


class SetupComponentBindingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    component_id: UUID
    role: str = Field(min_length=1, max_length=64)
    position: dict[str, Any] | None = None


class LifecycleEventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_type: Literal["install", "remove", "calibration", "maintenance"]
    occurred_at: datetime
    valid_until: datetime | None = None
    affected_component: str | None = Field(default=None, max_length=128)
    quantity: str | None = Field(default=None, max_length=128)
    correction: float | None = Field(default=None, allow_inf_nan=False)
    expanded_uncertainty: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    details: dict[str, Any] = Field(default_factory=dict)
    certificate_file_id: UUID | None = None

    @field_validator("occurred_at", "valid_until", mode="before")
    @classmethod
    def normalize_event_times(cls, value: object) -> datetime | None:
        if value is None:
            return None
        return normalize_offset_datetime(value)


class LifecycleEventRead(BaseModel):
    id: UUID
    event_type: str
    occurred_at: datetime
    valid_until: datetime | None
    quantity: str | None
    correction: float | None
    expanded_uncertainty: float | None
    details: dict[str, Any]
    certificate_file_id: UUID | None
