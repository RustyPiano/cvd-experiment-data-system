import json
from datetime import UTC, date, datetime
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import update

from app.main import app
from app.models.audit import AuditEvent
from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.file_asset import FileAsset
from app.models.sample import Sample
from app.models.scientific import RunFeature, RunRevision, TransformationInput
from app.models.user import User, UserRole
from app.models.v2_entities import (
    Instrument,
    InstrumentCapability,
    InstrumentLifecycleEvent,
    InstrumentVersion,
)
from app.models.v2_results import CharacterizationRecord
from app.schemas.scientific import (
    AmbientMeasurement,
    AnalysisRunCreate,
    DatasetFilter,
    DatasetQuery,
    MaterialAssertionWrite,
    MeasurementBundleCreate,
    MeasurementConditions,
    MeasurementRunCreate,
    ProcessTimelinePayload,
    PropertyValueWrite,
    SampleRegion,
    ScientificProcessEventPayload,
)
from app.services.dataset_query_service import DatasetQueryService
from app.services.scientific_measurement_service import ScientificMeasurementService
from app.services.v2_field_source import SCHEMA_VERSION

client = TestClient(app)


@pytest.mark.parametrize(
    "field_name",
    [
        "objective",
        "mode",
        "probe",
        "detector",
        "radiation_source",
        "geometry",
        "sample_preparation",
        "illumination_mode",
        "method_description",
    ],
)
def test_measurement_text_conditions_strip_and_reject_blank(field_name: str) -> None:
    assert getattr(MeasurementConditions(**{field_name: "  recorded value  "}), field_name) == (
        "recorded value"
    )
    with pytest.raises(ValueError):
        MeasurementConditions(**{field_name: "   "})


def test_power_setting_strips_and_enforces_text_boundary() -> None:
    assert MeasurementConditions(power_setting="  1 mW  ").power_setting == "1 mW"
    with pytest.raises(ValueError):
        MeasurementConditions(power_setting="   ")
    with pytest.raises(ValueError):
        MeasurementConditions(power_setting="x" * 129)
    with pytest.raises(ValueError):
        MeasurementConditions(power_setting=1)


def test_ambient_measurement_preserves_unknown_and_evidence_boundaries() -> None:
    assert AmbientMeasurement(source_type="not_measured").model_dump(exclude_none=True) == {
        "source_type": "not_measured"
    }
    with pytest.raises(ValueError):
        AmbientMeasurement(
            source_type="room_sensor",
            value=25,
            measured_at="2026-07-29T09:00:00+08:00",
        )
    with pytest.raises(ValueError):
        AmbientMeasurement(
            source_type="not_measured",
            value=25,
        )


def test_process_event_uses_unique_controlled_values() -> None:
    payload = {
        "event_key": "gas_interruption_1",
        "start_s": 10,
        "observed_deviations": ["gas_interruption"],
        "affected_objects": ["gas_line"],
        "suspected_causes": ["utility_interruption"],
        "intervention_actions": ["restart_supply"],
    }
    assert ScientificProcessEventPayload.model_validate(payload).observed_deviations == [
        "gas_interruption"
    ]
    with pytest.raises(ValueError):
        ScientificProcessEventPayload.model_validate(
            {**payload, "observed_deviations": ["free text"]}
        )
    with pytest.raises(ValueError):
        ScientificProcessEventPayload.model_validate(
            {**payload, "affected_objects": ["gas_line", "gas_line"]}
        )


def test_process_channels_distinguish_physical_instances_and_normalize_gas() -> None:
    timeline = ProcessTimelinePayload.model_validate(
        {
            "process_events_confirmed": False,
            "segments": [
                {
                    "segment_key": "growth",
                    "segment_type": "growth",
                    "sequence": 1,
                    "start_s": 0,
                    "end_s": 60,
                }
            ],
            "channels": [
                {
                    "channel_key": f"channel_{uuid4()}".replace("-", "_"),
                    "channel_type": "temperature",
                    "source_type": "measured",
                    "subject_type": "temperature_zone",
                    "subject_ref": "zone_1",
                    "subject_instance_ref": "TC-1A",
                    "zone_index": 1,
                    "unit": "°C",
                    "data_kind": "scalar",
                    "scalar_value": 749,
                },
                {
                    "channel_key": f"channel_{uuid4()}".replace("-", "_"),
                    "channel_type": "temperature",
                    "source_type": "measured",
                    "subject_type": "temperature_zone",
                    "subject_ref": "zone_1",
                    "subject_instance_ref": "TC-1B",
                    "zone_index": 1,
                    "unit": "°C",
                    "data_kind": "scalar",
                    "scalar_value": 751,
                },
                *[
                    {
                        "channel_key": f"channel_{uuid4()}".replace("-", "_"),
                        "channel_type": "flow",
                        "source_type": "measured",
                        "subject_type": "gas_species",
                        "subject_ref": alias,
                        "subject_instance_ref": instance,
                        "gas_species_code": alias,
                        "gas_lot_id": str(uuid4()),
                        "gas_lot_version": 1,
                        "measurement_source": "mfc",
                        "unit": "sccm",
                        "data_kind": "scalar",
                        "scalar_value": 50,
                    }
                    for alias, instance in (("氩气", "MFC-Ar-1"), ("argon", "MFC-Ar-2"))
                ],
                *[
                    {
                        "channel_key": f"channel_{uuid4()}".replace("-", "_"),
                        "channel_type": "valve_state",
                        "source_type": "measured",
                        "subject_type": "device",
                        "subject_ref": "valve_state",
                        "subject_instance_ref": instance,
                        "unit": "state",
                        "data_kind": "interval_series",
                        "series": [{"start_s": 0, "end_s": 60, "value": "open"}],
                    }
                    for instance in ("valve-1", "valve-2")
                ],
            ],
            "pressure_regime": "atmospheric",
            "cooling_method": "furnace_cooling",
        }
    )
    assert timeline.process_events_confirmed is False
    assert [item.gas_species_code for item in timeline.channels[2:4]] == ["Ar", "Ar"]


def test_simple_growth_contract_keeps_atmospheric_pressure_imprecise() -> None:
    gas_channel = {
        "channel_key": f"channel_{uuid4()}".replace("-", "_"),
        "channel_type": "flow",
        "source_type": "setpoint",
        "subject_type": "gas_species",
        "subject_ref": "Ar",
        "subject_instance_ref": "setup:demo:gas:Ar:1",
        "gas_species_code": "Ar",
        "gas_lot_id": str(uuid4()),
        "gas_lot_version": 1,
        "measurement_source": "mfc",
        "unit": "sccm",
        "data_kind": "interval_series",
        "series": [{"start_s": 0, "end_s": 3600, "value": 100}],
    }
    payload = {
        "segments": [
            {
                "segment_key": "growth",
                "segment_type": "growth",
                "sequence": 1,
                "start_s": 0,
                "end_s": 3600,
            }
        ],
        "channels": [
            {
                "channel_key": f"channel_{uuid4()}".replace("-", "_"),
                "channel_type": "temperature",
                "source_type": "setpoint",
                "subject_type": "temperature_zone",
                "subject_ref": "zone_1",
                "subject_instance_ref": "setup:demo:zone:1",
                "zone_index": 1,
                "unit": "°C",
                "data_kind": "interval_series",
                "series": [
                    {"start_s": 0, "value": 25},
                    {"start_s": 1800, "value": 750},
                ],
            },
            gas_channel,
        ],
        "pressure_regime": "atmospheric",
        "cooling_method": "furnace_cooling",
    }
    assert ProcessTimelinePayload.model_validate(payload).pressure_regime == "atmospheric"

    pressure = {
        "channel_key": f"channel_{uuid4()}".replace("-", "_"),
        "channel_type": "pressure",
        "source_type": "setpoint",
        "subject_type": "pressure_location",
        "subject_ref": "reactor",
        "subject_instance_ref": "setup:demo:pressure:1",
        "pressure_location": "reactor",
        "pressure_type": "absolute",
        "unit": "Pa",
        "data_kind": "scalar",
        "scalar_value": 1000,
    }
    with pytest.raises(ValueError, match="must not include"):
        ProcessTimelinePayload.model_validate(
            {**payload, "channels": [*payload["channels"], pressure]}
        )

    low_pressure = ProcessTimelinePayload.model_validate(
        {
            **payload,
            "channels": [*payload["channels"], pressure],
            "pressure_regime": "low_pressure",
        }
    )
    assert low_pressure.channels[-1].pressure_type == "absolute"

    for invalid_pressure in (0, -1):
        with pytest.raises(ValueError, match="greater than zero"):
            ProcessTimelinePayload.model_validate(
                {
                    **payload,
                    "channels": [
                        *payload["channels"],
                        {**pressure, "scalar_value": invalid_pressure},
                    ],
                    "pressure_regime": "low_pressure",
                }
            )

    with pytest.raises(ValueError, match="gas flow channel"):
        ProcessTimelinePayload.model_validate(
            {
                **payload,
                "channels": payload["channels"][:-1],
            }
        )


def test_measurement_contract_rejects_cross_method_properties_and_bad_composition() -> None:
    with pytest.raises(ValueError, match="sum to one"):
        MaterialAssertionWrite.model_validate(
            {
                "assertion_type": "composition",
                "value": {
                    "basis": "atomic_fraction",
                    "components": [
                        {"species": "Mo", "fraction": 0.8},
                        {"species": "W", "fraction": 0.8},
                    ],
                },
            }
        )
    payload = {
        "measurement": {
            "sample_id": str(uuid4()),
            "method_profile": "AFM",
            "instrument_id": str(uuid4()),
            "instrument_version": 1,
            "measured_at": "2026-07-29T10:00:00+08:00",
            "sample_region": {
                "geometry_type": "area",
                "label": "center",
                "coordinate_system": "sample_local",
                "width": 5,
                "height": 5,
                "unit": "μm",
            },
            "typed_conditions": {
                "mode": "tapping",
                "probe": "Si",
                "scan_size_um": {"x": 5, "y": 5},
                "resolution_px": {"width": 512, "height": 512},
                "scan_rate_hz": 1,
            },
            "raw_file_ids": [str(uuid4())],
        },
        "properties": [
            {
                "property_code": "raman_a1g_peak_position",
                "numeric_value": 405,
                "unit": "cm⁻¹",
            }
        ],
    }
    with pytest.raises(ValueError, match="do not apply to AFM"):
        MeasurementBundleCreate.model_validate(payload)


def test_measurement_profiles_only_require_their_minimum_conditions() -> None:
    base = {
        "sample_id": str(uuid4()),
        "instrument_id": str(uuid4()),
        "instrument_version": 1,
        "measured_at": "2026-07-30T10:00:00+08:00",
        "sample_region": {
            "geometry_type": "selected_area",
            "label": "中心",
            "coordinate_system": "sample_local",
        },
    }
    raman = MeasurementRunCreate.model_validate(
        {
            **base,
            "method_profile": "Raman",
            "typed_conditions": {"laser_wavelength_nm": 532},
        }
    )
    assert raman.typed_conditions.laser_wavelength_nm == 532

    with pytest.raises(ValueError, match="laser_wavelength_nm"):
        MeasurementRunCreate.model_validate(
            {
                **base,
                "method_profile": "Raman",
                "typed_conditions": {"objective": "100x"},
            }
        )

    other = MeasurementRunCreate.model_validate(
        {
            **base,
            "instrument_id": None,
            "instrument_version": None,
            "method_profile": "other",
            "typed_conditions": {"method_description": "椭偏测量"},
        }
    )
    assert other.typed_conditions.method_description == "椭偏测量"
    assert other.sample_region.geometry_type == "selected_area"


def test_method_modes_gate_composition_and_power_is_structured() -> None:
    with pytest.raises(ValueError, match="value and basis"):
        MeasurementConditions(excitation_power_value=1)
    assert (
        MeasurementConditions(
            excitation_power_value=1,
            excitation_power_basis="sample_plane_mW",
        ).excitation_power_basis
        == "sample_plane_mW"
    )

    payload = {
        "measurement": {
            "sample_id": str(uuid4()),
            "method_profile": "SEM",
            "instrument_id": str(uuid4()),
            "instrument_version": 1,
            "measured_at": "2026-09-02T10:00:00+08:00",
            "sample_region": {
                "geometry_type": "point",
                "label": "center",
                "coordinate_system": "sample_local",
            },
            "typed_conditions": {
                "accelerating_voltage_kV": 5,
                "mode": "secondary_electron",
            },
            "raw_file_ids": [str(uuid4())],
        },
        "assertions": [
            {
                "assertion_type": "composition",
                "value": {
                    "basis": "atomic_fraction",
                    "components": [{"species": "MoS2", "fraction": 1}],
                },
            }
        ],
    }
    with pytest.raises(ValueError, match="SEM composition requires"):
        MeasurementBundleCreate.model_validate(payload)
    payload["measurement"]["typed_conditions"]["mode"] = "EDS"
    assert (
        MeasurementBundleCreate.model_validate(payload).measurement.typed_conditions.mode == "EDS"
    )


def test_non_valid_properties_require_a_reason_and_aggregate_statistics_require_n() -> None:
    with pytest.raises(ValueError, match="quality note"):
        PropertyValueWrite(
            property_code="coverage_percent",
            numeric_value=10,
            unit="%",
            quality_flag="suspect",
        )
    with pytest.raises(ValueError, match="sample_count"):
        PropertyValueWrite(
            property_code="coverage_percent",
            numeric_value=10,
            unit="%",
            statistic="mean",
        )


def test_measurement_analysis_outputs_are_unique_and_acyclic() -> None:
    first, second, shared = uuid4(), uuid4(), uuid4()
    base = {
        "measurement": {
            "sample_id": str(uuid4()),
            "method_profile": "optical_microscopy",
            "measured_at": "2026-08-30T12:00:00+08:00",
            "sample_region": {
                "geometry_type": "whole_sample",
                "label": "whole sample",
                "coordinate_system": "sample_local",
            },
            "typed_conditions": {},
        },
        "properties": [{"property_code": "coverage_percent", "numeric_value": 10, "unit": "%"}],
    }
    analysis = {
        "software_name": "ImageJ",
        "software_version": "1.0",
        "started_at": "2026-08-30T12:00:00+08:00",
    }
    with pytest.raises(ValueError, match="one producer"):
        MeasurementBundleCreate.model_validate(
            base
            | {
                "analyses": [
                    analysis | {"input_file_ids": [str(first)], "output_file_ids": [str(shared)]},
                    analysis | {"input_file_ids": [str(second)], "output_file_ids": [str(shared)]},
                ]
            }
        )
    with pytest.raises(ValueError, match="acyclic"):
        MeasurementBundleCreate.model_validate(
            base
            | {
                "analyses": [
                    analysis | {"input_file_ids": [str(first)], "output_file_ids": [str(second)]},
                    analysis | {"input_file_ids": [str(second)], "output_file_ids": [str(first)]},
                ]
            }
        )


def test_analysis_cannot_start_before_its_measurement() -> None:
    payload = _optical_measurement(uuid4())
    payload["analyses"] = [
        {
            "software_name": "ImageJ",
            "software_version": "1.0",
            "started_at": "2026-08-30T11:59:59+08:00",
            "input_file_ids": [str(uuid4())],
        }
    ]

    with pytest.raises(ValueError, match="cannot start before"):
        MeasurementBundleCreate.model_validate(payload)


def test_optical_measurement_does_not_require_growth_assertion() -> None:
    bundle = MeasurementBundleCreate.model_validate(
        {
            "measurement": {
                "sample_id": str(uuid4()),
                "method_profile": "optical_microscopy",
                "measured_at": "2026-07-29T10:00:00+08:00",
                "sample_region": {
                    "geometry_type": "whole_sample",
                    "label": "whole sample",
                    "coordinate_system": "sample_local",
                },
                "typed_conditions": {
                    "objective": "10x",
                    "illumination_mode": "bright_field",
                },
            },
            "properties": [
                {
                    "property_code": "coverage_percent",
                    "numeric_value": 10,
                    "unit": "%",
                }
            ],
        }
    )
    assert bundle.assertions == []


@pytest.mark.parametrize(
    ("property_code", "value"),
    [
        ("coverage_percent", -0.1),
        ("coverage_percent", 100.1),
        ("domain_size_um", 0),
        ("afm_rms_roughness", -0.1),
        ("xrd_peak_2theta", 180.1),
    ],
)
def test_property_contract_enforces_code_specific_numeric_bounds(
    property_code: str,
    value: float,
) -> None:
    unit = {
        "coverage_percent": "%",
        "domain_size_um": "μm",
        "afm_rms_roughness": "nm",
        "xrd_peak_2theta": "° 2θ",
    }[property_code]
    with pytest.raises(ValueError):
        PropertyValueWrite(
            property_code=property_code,
            numeric_value=value,
            unit=unit,
        )


def test_property_and_region_contract_reject_empty_or_wrongly_typed_evidence() -> None:
    with pytest.raises(ValueError, match="numeric value representation"):
        PropertyValueWrite(
            property_code="coverage_percent",
            text_value="50",
        )
    with pytest.raises(ValueError, match="cannot be blank"):
        PropertyValueWrite(property_code="observation_note", text_value="   ")
    with pytest.raises(ValueError, match="cannot use a boolean"):
        PropertyValueWrite(
            property_code="coverage_percent",
            numeric_value=True,
            unit="%",
        )
    with pytest.raises(ValueError, match="numeric detection threshold"):
        PropertyValueWrite(
            property_code="observation_note",
            text_value="no visible feature",
            quality_flag="below_detection_limit",
        )
    assert (
        PropertyValueWrite(
            property_code="coverage_percent",
            numeric_value=5,
            unit="%",
            quality_flag="below_detection_limit",
            quality_note="instrument detection threshold",
        ).numeric_value
        == 5
    )
    with pytest.raises(ValueError):
        SampleRegion(
            geometry_type="area",
            label="roi",
            coordinate_system="image",
            width=1,
            height=1,
            unit="μm",
            image_file_id=uuid4(),
            pixel_roi={"x": -1, "y": 0, "width": 1, "height": 1},
        )
    assert MaterialAssertionWrite(
        assertion_type="layer_count",
        value={"count": 0},
    ).value == {"count": 0}
    with pytest.raises(ValueError):
        MaterialAssertionWrite(
            assertion_type="layer_count",
            value={"count": True},
        )
    assert (
        SampleRegion(
            geometry_type="whole_sample",
            label="  whole sample  ",
            coordinate_system="  sample_local  ",
        ).label
        == "whole sample"
    )
    for field_name in ("label", "coordinate_system"):
        with pytest.raises(ValueError):
            SampleRegion.model_validate(
                {
                    "geometry_type": "whole_sample",
                    "label": "whole sample",
                    "coordinate_system": "sample_local",
                    field_name: "   ",
                }
            )


@pytest.mark.parametrize(
    "payload",
    [
        {
            "geometry_type": "line",
            "label": "scan",
            "coordinate_system": "sample_local",
            "width": 10,
            "height": 5,
            "unit": "μm",
        },
        {
            "geometry_type": "whole_sample",
            "label": "whole",
            "coordinate_system": "sample_local",
            "x": 1,
            "y": 2,
            "unit": "μm",
        },
        {
            "geometry_type": "lamella",
            "label": "lamella",
            "coordinate_system": "sample_local",
            "width": 1,
            "unit": "μm",
        },
        {
            "geometry_type": "particle",
            "label": "particle",
            "coordinate_system": "sample_local",
            "unit": "μm",
        },
    ],
)
def test_sample_region_rejects_geometry_specific_extra_values(payload: dict) -> None:
    with pytest.raises(ValueError):
        SampleRegion.model_validate(payload)


def test_analysis_and_uncertainty_text_reject_blank_provenance() -> None:
    analysis = AnalysisRunCreate(
        software_name="  ImageJ  ",
        software_version="  1.0  ",
        code_commit="  abc123  ",
        started_at="2026-08-30T12:00:00+08:00",
        input_file_ids=[uuid4()],
    )
    assert (analysis.software_name, analysis.software_version, analysis.code_commit) == (
        "ImageJ",
        "1.0",
        "abc123",
    )
    with pytest.raises(ValueError):
        AnalysisRunCreate(
            software_name="   ",
            software_version="1.0",
            started_at="2026-08-30T12:00:00+08:00",
            input_file_ids=[uuid4()],
        )
    with pytest.raises(ValueError):
        PropertyValueWrite(
            property_code="coverage_percent",
            numeric_value=10,
            unit="%",
            uncertainty_value=1,
            uncertainty_type="   ",
        )


@pytest.mark.parametrize("invalid", [float("nan"), float("inf"), float("-inf")])
def test_analysis_parameters_reject_non_finite_json(invalid: float) -> None:
    with pytest.raises(ValueError, match="finite JSON"):
        AnalysisRunCreate(
            software_name="ImageJ",
            software_version="1.0",
            parameters={"nested": [invalid]},
            started_at="2026-08-30T12:00:00+08:00",
            input_file_ids=[uuid4()],
        )


def test_measurement_integer_fields_fit_database_integer_columns() -> None:
    with pytest.raises(ValueError):
        MeasurementRunCreate(
            sample_id=uuid4(),
            method_profile="optical_microscopy",
            instrument_id=uuid4(),
            instrument_version=10**100,
            measured_at="2026-08-30T12:00:00+08:00",
            sample_region={
                "geometry_type": "whole_sample",
                "label": "whole",
                "coordinate_system": "sample_local",
            },
            typed_conditions={},
        )
    with pytest.raises(ValueError):
        PropertyValueWrite(
            property_code="coverage_percent",
            numeric_value=10,
            unit="%",
            sample_count=10**100,
        )


def test_measurement_api_rejects_non_finite_analysis_parameters(
    active_user,
    db_session,
) -> None:
    _, sample = _locked_sample(db_session, active_user, "09-json")
    payload = _optical_measurement(sample.id)
    payload["analyses"] = [
        {
            "software_name": "ImageJ",
            "software_version": "1.0",
            "parameters": {"threshold": float("nan")},
            "started_at": "2026-08-30T12:00:00+08:00",
            "input_file_ids": [str(uuid4())],
        }
    ]
    response = client.post(
        "/api/v1/measurements",
        content=json.dumps(payload),
        headers={**_headers(active_user.email), "Content-Type": "application/json"},
    )
    assert response.status_code == 422, response.text


def test_transformation_api_rejects_non_finite_json(active_user) -> None:
    response = client.post(
        "/api/v1/transformations",
        content=json.dumps(
            {
                "transformation_type": "cut",
                "input_sample_ids": [str(uuid4())],
                "outputs": [{"output_role": "half"}],
                "occurred_at": "2026-08-30T12:00:00+08:00",
                "parameters": {"threshold": float("inf")},
            }
        ),
        headers={**_headers(active_user.email), "Content-Type": "application/json"},
    )
    assert response.status_code == 422, response.text


def test_material_assertion_values_are_canonical_and_exact() -> None:
    assert MaterialAssertionWrite(
        assertion_type="phase_identity",
        value={"phase": "  2H-MoS2  "},
    ).value == {"phase": "2H-MoS2"}
    assert MaterialAssertionWrite(
        assertion_type="composition",
        value={
            "basis": "atomic_fraction",
            "components": [
                {"species": " W ", "fraction": 0.5},
                {"species": "Mo", "fraction": 0.5},
            ],
        },
    ).value == {
        "basis": "atomic_fraction",
        "components": [
            {"species": "Mo", "fraction": 0.5},
            {"species": "W", "fraction": 0.5},
        ],
    }
    with pytest.raises(ValueError, match="requires exactly"):
        MaterialAssertionWrite(
            assertion_type="phase_identity",
            value={"phase": "2H-MoS2", "note": "unbounded"},
        )
    with pytest.raises(ValueError, match="at most 256"):
        MaterialAssertionWrite(
            assertion_type="orientation_relationship",
            value={"orientation_relationship": "x" * 257},
        )


@pytest.mark.parametrize(
    ("model", "payload"),
    [
        (
            SampleRegion,
            {
                "geometry_type": "point",
                "label": "center",
                "coordinate_system": "sample_local",
                "x": True,
                "y": 0,
                "unit": "mm",
            },
        ),
        (MeasurementConditions, {"laser_wavelength_nm": True}),
        (MeasurementConditions, {"spectral_range_nm": {"min": False, "max": 800}}),
        (
            MeasurementRunCreate,
            {
                "sample_id": str(uuid4()),
                "method_profile": "optical_microscopy",
                "instrument_id": str(uuid4()),
                "instrument_version": True,
                "measured_at": "2026-08-30T12:00:00+08:00",
                "typed_conditions": {},
            },
        ),
        (
            PropertyValueWrite,
            {
                "property_code": "coverage_percent",
                "numeric_value": 1,
                "unit": "%",
                "uncertainty_value": True,
                "uncertainty_type": "standard_deviation",
            },
        ),
        (
            PropertyValueWrite,
            {
                "property_code": "coverage_percent",
                "numeric_value": 1,
                "unit": "%",
                "sample_count": True,
            },
        ),
        (
            PropertyValueWrite,
            {
                "property_code": "coverage_percent",
                "numeric_value": 1,
                "unit": "%",
                "analysis_index": False,
            },
        ),
        (
            MaterialAssertionWrite,
            {
                "assertion_type": "phase_identity",
                "value": {"phase": "2H-MoS2"},
                "confidence": True,
            },
        ),
        (
            MaterialAssertionWrite,
            {
                "assertion_type": "phase_identity",
                "value": {"phase": "2H-MoS2"},
                "analysis_index": False,
            },
        ),
    ],
)
def test_measurement_numeric_contract_rejects_json_booleans(model, payload: dict) -> None:
    with pytest.raises(ValueError):
        model.model_validate(payload)


def test_dataset_property_filters_only_accept_numeric_ssot_properties() -> None:
    assert (
        DatasetFilter(
            field="property",
            property_code="coverage_percent",
            operator="gte",
            value=10,
        ).property_code
        == "coverage_percent"
    )
    for invalid_code in ("layer_count", "observation_note"):
        with pytest.raises(ValueError, match="numeric property_code"):
            DatasetFilter(
                field="property",
                property_code=invalid_code,
                operator="eq",
                value=1,
            )


def test_dataset_text_filters_are_trimmed_and_bounded() -> None:
    assert DatasetFilter(field="target_formula", operator="contains", value="  MoS2  ").value == (
        "MoS2"
    )
    for value in ("   ", "x" * 256):
        with pytest.raises(ValueError, match="1 to 255"):
            DatasetFilter(field="target_formula", operator="contains", value=value)


@pytest.mark.parametrize(
    "value",
    [[2, 1], [1, float("nan")], [1, float("inf")]],
)
def test_dataset_numeric_filters_reject_unordered_or_non_finite_values(value: list) -> None:
    with pytest.raises(ValueError):
        DatasetFilter(
            field="growth_duration_s",
            operator="between",
            value=value,
        )


def test_dataset_cursor_is_bound_to_the_stable_query_manifest() -> None:
    payload = DatasetQuery(
        filters=[DatasetFilter(field="growth_duration_s", operator="gte", value=1)],
        limit=10,
    )
    query_sha256 = DatasetQueryService._query_sha256(payload)
    cursor = DatasetQueryService._encode_cursor(
        datetime(2026, 8, 30, tzinfo=UTC),
        uuid4(),
        query_sha256,
    )
    page = payload.model_copy(update={"cursor": cursor})

    assert (
        DatasetQueryService._manifest(payload, [])["query_sha256"]
        == (DatasetQueryService._manifest(page, [])["query_sha256"])
    )
    assert "cursor" not in DatasetQueryService._manifest(page, [])["query"]
    DatasetQueryService._decode_cursor(cursor, query_sha256)
    with pytest.raises(HTTPException):
        DatasetQueryService._decode_cursor(cursor, "0" * 64)


def test_dataset_contains_treats_sql_wildcards_as_literal_text(
    active_user,
    db_session,
) -> None:
    headers = _headers(active_user.email)
    values = ["Mo%S2", "Mo_S2", r"Mo\S2", "MoS2"]
    for index, value in enumerate(values):
        run, _sample = _locked_sample(db_session, active_user, f"wildcard-{index}")
        db_session.add(
            RunFeature(
                run_revision_id=run.current_revision_id,
                feature_code="target_formula",
                text_value=value,
                source_path="test.target_formula",
            )
        )
    db_session.commit()

    for value in values[:3]:
        response = client.post(
            "/api/v1/datasets/query",
            json={
                "filters": [
                    {
                        "field": "target_formula",
                        "operator": "contains",
                        "value": value[2],
                    }
                ]
            },
            headers=headers,
        )
        assert response.status_code == 200, response.text
        assert [item["target_formulas"] for item in response.json()["items"]] == [[value]]


@pytest.mark.parametrize(
    "filter_payload",
    [
        {
            "field": "property",
            "property_code": "coverage_percent",
            "operator": "ne",
            "value": 10,
        },
        {"field": "growth_duration_s", "operator": "ne", "value": 10},
        {"field": "growth_presence", "operator": "ne", "value": "present"},
    ],
)
def test_dataset_ne_excludes_missing_observations(
    filter_payload: dict,
    active_user,
    db_session,
) -> None:
    _locked_sample(db_session, active_user, "21")
    response = client.post(
        "/api/v1/datasets/query",
        json={"filters": [filter_payload]},
        headers=_headers(active_user.email),
    )

    assert response.status_code == 200, response.text
    assert response.json()["items"] == []


def _headers(email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _locked_sample(
    db_session,
    owner: User,
    suffix: str,
    *,
    started_at: str | None = None,
) -> tuple[ExperimentRun, Sample]:
    run = ExperimentRun(
        run_code=f"CVD-2026-98{suffix}",
        owner_id=owner.id,
        schema_version=SCHEMA_VERSION,
        material_system="MoS2",
        experiment_date=date(2026, 7, 29),
        status=ExperimentStatus.LOCKED,
    )
    db_session.add(run)
    db_session.flush()
    revision = RunRevision(
        experiment_run_id=run.id,
        revision_number=1,
        schema_version=SCHEMA_VERSION,
        schema_status="INTERNAL_VALIDATION",
        status="locked",
        content_json={
            "run": {"id": str(run.id)},
            "modules": (
                {"basic_info": {"started_at": started_at}} if started_at is not None else {}
            ),
        },
        content_sha256=suffix[-1] * 64,
        locked_by_id=owner.id,
    )
    db_session.add(revision)
    db_session.flush()
    run.current_revision_id = revision.id
    sample = Sample(
        sample_code=f"{run.run_code}-S01",
        experiment_run_id=run.id,
        run_revision_id=revision.id,
        role="growth",
    )
    db_session.add(sample)
    db_session.commit()
    return run, sample


def _optical_measurement(
    sample_id: UUID,
    *,
    quality_flag: str = "valid",
    growth_state: str | None = None,
    property_quality: str = "valid",
) -> dict:
    payload: dict = {
        "measurement": {
            "sample_id": str(sample_id),
            "method_profile": "optical_microscopy",
            "measured_at": "2026-08-30T12:00:00+08:00",
            "sample_region": {
                "geometry_type": "whole_sample",
                "label": "whole sample",
                "coordinate_system": "sample_local",
            },
            "typed_conditions": {},
            "quality_flag": quality_flag,
        },
        "properties": [
            {
                "property_code": "coverage_percent",
                "numeric_value": 10,
                "unit": "%",
                "quality_flag": property_quality,
            }
        ],
    }
    if quality_flag == "suspect":
        payload["measurement"]["quality_note"] = "measurement requires review"
    if property_quality != "valid":
        payload["properties"][0]["quality_note"] = "result requires review"
    if growth_state is not None:
        payload["assertions"] = [
            {
                "assertion_type": "growth_presence",
                "value": {"state": growth_state},
            }
        ]
    return payload


def test_measurement_cannot_precede_frozen_experiment_start(
    active_user,
    db_session,
) -> None:
    _, sample = _locked_sample(
        db_session,
        active_user,
        "23",
        started_at="2026-08-30T13:00:00+08:00",
    )
    headers = _headers(active_user.email)
    payload = _optical_measurement(sample.id)
    payload["measurement"]["measured_at"] = "2026-08-30T04:59:59+00:00"

    rejected = client.post("/api/v1/measurements", json=payload, headers=headers)

    assert rejected.status_code == 422, rejected.text
    assert rejected.json()["detail"] == "Measurement cannot precede the experiment start"
    assert db_session.query(CharacterizationRecord).count() == 0

    payload["measurement"]["measured_at"] = "2026-08-30T05:00:00+00:00"
    accepted = client.post("/api/v1/measurements", json=payload, headers=headers)
    assert accepted.status_code == 201, accepted.text


def test_measurement_api_rejects_below_detection_limit_for_text_property(
    active_user,
    db_session,
) -> None:
    _, sample = _locked_sample(db_session, active_user, "10")
    payload = _optical_measurement(sample.id)
    payload["properties"] = [
        {
            "property_code": "observation_note",
            "text_value": "no visible feature",
            "quality_flag": "below_detection_limit",
        }
    ]

    response = client.post(
        "/api/v1/measurements",
        json=payload,
        headers=_headers(active_user.email),
    )

    assert response.status_code == 422


def test_equivalent_assertion_writes_do_not_create_a_false_conflict(
    active_user,
    db_session,
) -> None:
    _run, sample = _locked_sample(db_session, active_user, "10")
    headers = _headers(active_user.email)

    for state in ("  present  ", "present"):
        payload = _optical_measurement(sample.id)
        payload["assertions"] = [{"assertion_type": "growth_presence", "value": {"state": state}}]
        response = client.post("/api/v1/measurements", json=payload, headers=headers)
        assert response.status_code == 201, response.text

    db_session.refresh(sample)
    assert sample.actual_state == "growth_present"


def test_measurement_api_rejects_boolean_scientific_numbers(active_user, db_session) -> None:
    _run, sample = _locked_sample(db_session, active_user, "09")
    payload = _optical_measurement(sample.id)
    payload["measurement"]["sample_region"] = {
        "geometry_type": "point",
        "label": "center",
        "coordinate_system": "sample_local",
        "x": True,
        "y": 0,
        "unit": "mm",
    }
    response = client.post(
        "/api/v1/measurements",
        json=payload,
        headers=_headers(active_user.email),
    )
    assert response.status_code == 422


def test_historical_and_inactive_measurements_cannot_be_invalidated(
    active_user,
    db_session,
) -> None:
    run, sample = _locked_sample(db_session, active_user, "08")
    headers = _headers(active_user.email)
    created = client.post(
        "/api/v1/measurements",
        json=_optical_measurement(sample.id),
        headers=headers,
    )
    assert created.status_code == 201, created.text

    original_revision_id = run.current_revision_id
    next_revision = RunRevision(
        experiment_run_id=run.id,
        revision_number=2,
        supersedes_revision_id=original_revision_id,
        schema_version=SCHEMA_VERSION,
        schema_status="internal_validation",
        status="locked",
        content_json={},
        content_sha256="8" * 64,
        locked_by_id=active_user.id,
    )
    db_session.add(next_revision)
    db_session.flush()
    run.current_revision_id = next_revision.id
    sample.run_revision_id = next_revision.id
    db_session.commit()

    detail = client.get(f"/api/v1/measurements/{created.json()['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["can_invalidate"] is False
    historical = client.post(
        f"/api/v1/measurements/{created.json()['id']}/invalidate",
        json={"reason": "must remain immutable"},
        headers=headers,
    )
    assert historical.status_code == 409

    run.current_revision_id = original_revision_id
    sample.run_revision_id = original_revision_id
    sample.lifecycle_state = "consumed"
    db_session.commit()
    inactive = client.post(
        f"/api/v1/measurements/{created.json()['id']}/invalidate",
        json={"reason": "inactive sample"},
        headers=headers,
    )
    assert inactive.status_code == 409


def test_measurement_validity_controls_projection_todo_and_invalidation(
    active_user,
    db_session,
) -> None:
    run, sample = _locked_sample(db_session, active_user, "11")
    run.not_characterized_by_id = active_user.id
    run.not_characterized_at = datetime.now(UTC)
    db_session.commit()
    headers = _headers(active_user.email)

    invalid_create = client.post(
        "/api/v1/measurements",
        json=_optical_measurement(sample.id, quality_flag="invalid", growth_state="absent"),
        headers=headers,
    )
    assert invalid_create.status_code == 422

    suspect = client.post(
        "/api/v1/measurements",
        json=_optical_measurement(sample.id, quality_flag="suspect", growth_state="absent"),
        headers=headers,
    )
    assert suspect.status_code == 201, suspect.text
    assert suspect.json()["evidence_present"] is False
    assert suspect.json()["quality_note"] == "measurement requires review"
    db_session.refresh(run)
    db_session.refresh(sample)
    assert run.not_characterized_at is not None
    assert sample.actual_state == "unknown"

    absent_query = {"filters": [{"field": "growth_presence", "operator": "eq", "value": "absent"}]}
    assert (
        client.post(
            "/api/v1/datasets/query",
            json=absent_query,
            headers=headers,
        ).json()["items"]
        == []
    )

    valid = client.post(
        "/api/v1/measurements",
        json=_optical_measurement(sample.id, growth_state="present"),
        headers=headers,
    )
    assert valid.status_code == 201, valid.text
    assert valid.json()["evidence_present"] is True
    db_session.refresh(run)
    db_session.refresh(sample)
    assert run.not_characterized_at is None
    assert run.result_missing_todo is False
    assert sample.actual_state == "growth_present"
    present_query = {
        "filters": [{"field": "growth_presence", "operator": "eq", "value": "present"}]
    }
    assert [
        item["run_id"]
        for item in client.post(
            "/api/v1/datasets/query",
            json=present_query,
            headers=headers,
        ).json()["items"]
    ] == [str(run.id)]

    detail = client.get(
        f"/api/v1/measurements/{valid.json()['id']}",
        headers=headers,
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["evidence_present"] is True
    assert detail.json()["revision_number"] == 1
    assert detail.json()["can_invalidate"] is True
    assert detail.json()["performed_by_name"] == active_user.name
    assert detail.json()["properties"][0]["property_code"] == "coverage_percent"
    assert detail.json()["assertions"][0]["value"] == {"state": "present"}

    observer = User(
        email="measurement-observer@example.com",
        name="Measurement Observer",
        password_hash=active_user.password_hash,
        role=UserRole.MEMBER,
        is_active=True,
    )
    db_session.add(observer)
    db_session.commit()
    observer_headers = _headers(observer.email)
    observer_detail = client.get(
        f"/api/v1/measurements/{valid.json()['id']}",
        headers=observer_headers,
    )
    assert observer_detail.status_code == 200
    assert observer_detail.json()["can_invalidate"] is False
    forbidden = client.post(
        f"/api/v1/measurements/{valid.json()['id']}/invalidate",
        json={"reason": "not mine"},
        headers=observer_headers,
    )
    assert forbidden.status_code == 403

    invalidated = client.post(
        f"/api/v1/measurements/{valid.json()['id']}/invalidate",
        json={"reason": "显微镜标尺配置错误"},
        headers=headers,
    )
    assert invalidated.status_code == 200, invalidated.text
    assert invalidated.json()["quality_flag"] == "invalid"
    assert invalidated.json()["evidence_present"] is False
    assert invalidated.json()["can_invalidate"] is False
    assert invalidated.json()["invalidation_reason"] == "显微镜标尺配置错误"
    db_session.refresh(run)
    db_session.refresh(sample)
    assert run.result_missing_todo is True
    assert sample.actual_state == "unknown"
    assert (
        client.post(
            "/api/v1/datasets/query",
            json=present_query,
            headers=headers,
        ).json()["items"]
        == []
    )
    assert (
        db_session.query(AuditEvent)
        .filter_by(
            entity_type="measurement_run",
            entity_id=UUID(valid.json()["id"]),
            action="invalidate",
        )
        .one()
        .reason
        == "显微镜标尺配置错误"
    )
    repeated = client.post(
        f"/api/v1/measurements/{valid.json()['id']}/invalidate",
        json={"reason": "again"},
        headers=headers,
    )
    assert repeated.status_code == 409


def test_measurement_summary_accepts_active_assertion_only(
    active_user,
    db_session,
) -> None:
    run, sample = _locked_sample(db_session, active_user, "15")
    headers = _headers(active_user.email)
    payload = _optical_measurement(sample.id, growth_state="absent")
    payload["properties"] = []

    created = client.post("/api/v1/measurements", json=payload, headers=headers)

    assert created.status_code == 201, created.text
    assert created.json()["evidence_present"] is True
    detail = client.get(
        f"/api/v1/measurements/{created.json()['id']}",
        headers=headers,
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["evidence_present"] is True
    assert detail.json()["property_count"] == 0
    assert detail.json()["assertion_count"] == 1
    listed = client.get(f"/api/v1/measurements?run_id={run.id}", headers=headers)
    assert listed.status_code == 200, listed.text
    assert listed.json()["items"][0]["evidence_present"] is True


def test_measurement_creation_refreshes_locked_sample_before_active_check(
    active_user,
    db_session,
) -> None:
    _, sample = _locked_sample(db_session, active_user, "16")
    assert sample.lifecycle_state == "active"
    db_session.execute(
        update(Sample).where(Sample.id == sample.id).values(lifecycle_state="consumed"),
        execution_options={"synchronize_session": False},
    )
    assert sample.lifecycle_state == "active"

    with pytest.raises(HTTPException) as exc_info:
        ScientificMeasurementService(db_session).create_bundle(
            MeasurementBundleCreate.model_validate(_optical_measurement(sample.id)),
            active_user,
        )

    assert exc_info.value.status_code == 404
    assert (
        db_session.query(CharacterizationRecord)
        .filter(CharacterizationRecord.sample_id == sample.id)
        .count()
        == 0
    )


def test_analysis_outputs_cannot_reuse_files_from_an_earlier_bundle(
    active_user,
    db_session,
) -> None:
    run, sample = _locked_sample(db_session, active_user, "17")
    sample.role = "control"
    files = [
        FileAsset(
            experiment_run_id=run.id,
            sample_id=sample.id,
            uploaded_by_id=active_user.id,
            original_name=f"analysis-{index}.csv",
            storage_path=f"test/{uuid4()}",
            content_type="text/csv",
            size_bytes=4,
            sha256=str(index) * 64,
            method="optical_microscopy",
            file_category="processed",
            asset_role="characterization_file",
        )
        for index in range(1, 4)
    ]
    raw_output = FileAsset(
        experiment_run_id=run.id,
        sample_id=sample.id,
        uploaded_by_id=active_user.id,
        original_name="not-an-output.csv",
        storage_path=f"test/{uuid4()}",
        content_type="text/csv",
        size_bytes=4,
        sha256="4" * 64,
        method="optical_microscopy",
        file_category="raw",
        asset_role="characterization_file",
    )
    source_image = FileAsset(
        experiment_run_id=run.id,
        sample_id=sample.id,
        uploaded_by_id=active_user.id,
        original_name="source.png",
        storage_path=f"test/{uuid4()}",
        content_type="image/png",
        size_bytes=4,
        sha256="5" * 64,
        method="optical_microscopy",
        file_category="raw",
        asset_role="characterization_file",
    )
    files.extend([raw_output, source_image])
    db_session.add_all(files)
    db_session.commit()
    analysis = {
        "software_name": "ImageJ",
        "software_version": "1.0",
        "started_at": "2026-08-30T12:00:00+08:00",
    }
    first = _optical_measurement(sample.id)
    first["measurement"]["raw_file_ids"] = [str(source_image.id)]
    first["analyses"] = [
        analysis
        | {
            "input_file_ids": [str(files[0].id)],
            "output_file_ids": [str(files[1].id)],
        }
    ]
    headers = _headers(active_user.email)
    invalid_output = _optical_measurement(sample.id)
    invalid_output["analyses"] = [
        analysis
        | {
            "input_file_ids": [str(files[0].id)],
            "output_file_ids": [str(raw_output.id)],
        }
    ]
    rejected_output = client.post(
        "/api/v1/measurements",
        json=invalid_output,
        headers=headers,
    )
    assert rejected_output.status_code == 422, rejected_output.text

    created = client.post("/api/v1/measurements", json=first, headers=headers)
    assert created.status_code == 201, created.text

    reanalysis = _optical_measurement(sample.id)
    reanalysis["analyses"] = [
        analysis
        | {
            "input_file_ids": [str(files[1].id)],
            "output_file_ids": [],
        }
    ]
    valid_downstream = client.post(
        "/api/v1/measurements",
        json=reanalysis,
        headers=headers,
    )
    assert valid_downstream.status_code == 201, valid_downstream.text
    region_measurement = _optical_measurement(sample.id)
    region_measurement["measurement"]["sample_region"] = {
        "geometry_type": "selected_area",
        "label": "source image ROI",
        "coordinate_system": "image",
        "image_file_id": str(source_image.id),
        "pixel_roi": {"x": 0, "y": 0, "width": 2, "height": 2},
    }
    valid_region = client.post(
        "/api/v1/measurements",
        json=region_measurement,
        headers=headers,
    )
    assert valid_region.status_code == 201, valid_region.text
    assert client.delete(f"/api/v1/files/{files[1].id}", headers=headers).status_code == 409
    assert client.delete(f"/api/v1/files/{source_image.id}", headers=headers).status_code == 409
    protected = client.post(
        f"/api/v1/measurements/{created.json()['id']}/invalidate",
        json={"reason": "would break downstream"},
        headers=headers,
    )
    assert protected.status_code == 409, protected.text
    assert (
        client.get(
            f"/api/v1/measurements/{created.json()['id']}",
            headers=headers,
        ).json()["can_invalidate"]
        is False
    )

    for reused_output in (files[0].id, files[1].id):
        repeated = _optical_measurement(sample.id)
        repeated["analyses"] = [
            analysis
            | {
                "input_file_ids": [str(files[2].id)],
                "output_file_ids": [str(reused_output)],
            }
        ]
        rejected = client.post("/api/v1/measurements", json=repeated, headers=headers)
        assert rejected.status_code == 422, rejected.text

    first_revision = db_session.get(RunRevision, run.current_revision_id)
    assert first_revision is not None
    second_revision = RunRevision(
        experiment_run_id=run.id,
        revision_number=2,
        supersedes_revision_id=first_revision.id,
        schema_version=SCHEMA_VERSION,
        schema_status="INTERNAL_VALIDATION",
        status="locked",
        content_json={"run": {"id": str(run.id)}, "modules": {}},
        content_sha256="6" * 64,
        locked_by_id=active_user.id,
        locked_at=datetime(2026, 8, 31, tzinfo=UTC),
    )
    db_session.add(second_revision)
    db_session.flush()
    run.current_revision_id = second_revision.id
    db_session.commit()

    historical_input = _optical_measurement(sample.id)
    historical_input["analyses"] = [
        analysis
        | {
            "input_file_ids": [str(files[1].id)],
            "output_file_ids": [],
        }
    ]
    rejected_input = client.post(
        "/api/v1/measurements",
        json=historical_input,
        headers=headers,
    )
    assert rejected_input.status_code == 422, rejected_input.text

    historical_region = _optical_measurement(sample.id)
    historical_region["measurement"]["sample_region"] = {
        "geometry_type": "selected_area",
        "label": "historical image",
        "coordinate_system": "image",
        "image_file_id": str(source_image.id),
        "pixel_roi": {"x": 0, "y": 0, "width": 2, "height": 2},
    }
    rejected_region = client.post(
        "/api/v1/measurements",
        json=historical_region,
        headers=headers,
    )
    assert rejected_region.status_code == 422, rejected_region.text


def test_invalid_measurement_files_cannot_feed_new_analysis_or_region(
    active_user,
    db_session,
) -> None:
    run, sample = _locked_sample(db_session, active_user, "20")
    raw_image = FileAsset(
        experiment_run_id=run.id,
        sample_id=sample.id,
        uploaded_by_id=active_user.id,
        original_name="invalid-source.png",
        storage_path=f"test/{uuid4()}",
        content_type="image/png",
        size_bytes=4,
        sha256="7" * 64,
        method="optical_microscopy",
        file_category="raw",
        asset_role="characterization_file",
    )
    processed = FileAsset(
        experiment_run_id=run.id,
        sample_id=sample.id,
        uploaded_by_id=active_user.id,
        original_name="invalid-output.csv",
        storage_path=f"test/{uuid4()}",
        content_type="text/csv",
        size_bytes=4,
        sha256="8" * 64,
        method="optical_microscopy",
        file_category="processed",
        asset_role="characterization_file",
    )
    db_session.add_all([raw_image, processed])
    db_session.commit()
    analysis = {
        "software_name": "ImageJ",
        "software_version": "1.0",
        "started_at": "2026-08-30T12:00:00+08:00",
    }
    first = _optical_measurement(sample.id)
    first["measurement"]["raw_file_ids"] = [str(raw_image.id)]
    first["analyses"] = [
        analysis
        | {
            "input_file_ids": [str(raw_image.id)],
            "output_file_ids": [str(processed.id)],
        }
    ]
    headers = _headers(active_user.email)
    created = client.post("/api/v1/measurements", json=first, headers=headers)
    assert created.status_code == 201, created.text
    invalidated = client.post(
        f"/api/v1/measurements/{created.json()['id']}/invalidate",
        json={"reason": "invalid source"},
        headers=headers,
    )
    assert invalidated.status_code == 200, invalidated.text

    downstream = _optical_measurement(sample.id)
    downstream["analyses"] = [
        analysis
        | {
            "input_file_ids": [str(processed.id)],
            "output_file_ids": [],
        }
    ]
    rejected_input = client.post(
        "/api/v1/measurements",
        json=downstream,
        headers=headers,
    )
    assert rejected_input.status_code == 422, rejected_input.text

    region = _optical_measurement(sample.id)
    region["measurement"]["sample_region"] = {
        "geometry_type": "selected_area",
        "label": "invalid source",
        "coordinate_system": "image",
        "image_file_id": str(raw_image.id),
        "pixel_roi": {"x": 0, "y": 0, "width": 2, "height": 2},
    }
    rejected_region = client.post(
        "/api/v1/measurements",
        json=region,
        headers=headers,
    )
    assert rejected_region.status_code == 422, rejected_region.text


def test_measurement_rechecks_sample_run_after_locking_resolved_run(
    active_user,
    db_session,
    monkeypatch,
) -> None:
    run, sample = _locked_sample(db_session, active_user, "18")
    other_run, _ = _locked_sample(db_session, active_user, "19")
    run_id = run.id
    other_run_id = other_run.id
    service = ScientificMeasurementService(db_session)
    original_lock = service.experiments.get_by_id_for_update

    def move_sample_then_lock(resolved_run_id: UUID):
        assert resolved_run_id == run_id
        db_session.execute(
            update(Sample).where(Sample.id == sample.id).values(experiment_run_id=other_run_id),
            execution_options={"synchronize_session": False},
        )
        return original_lock(resolved_run_id)

    monkeypatch.setattr(service.experiments, "get_by_id_for_update", move_sample_then_lock)

    with pytest.raises(HTTPException) as exc_info:
        service.create_bundle(
            MeasurementBundleCreate.model_validate(_optical_measurement(sample.id)),
            active_user,
        )

    assert exc_info.value.status_code == 404
    assert db_session.query(CharacterizationRecord).count() == 0


def test_measurement_invalidation_refreshes_locked_record_and_preserves_reason(
    active_user,
    db_session,
) -> None:
    _, sample = _locked_sample(db_session, active_user, "17")
    service = ScientificMeasurementService(db_session)
    created = service.create_bundle(
        MeasurementBundleCreate.model_validate(_optical_measurement(sample.id)),
        active_user,
    )
    record = db_session.get(CharacterizationRecord, created.id)
    assert record is not None
    assert record.quality_flag == "valid"
    first_attrs = {
        "invalidation_reason": "first committed reason",
        "invalidated_by_id": str(active_user.id),
        "invalidated_at": datetime.now(UTC).isoformat(),
    }
    db_session.execute(
        update(CharacterizationRecord)
        .where(CharacterizationRecord.id == record.id)
        .values(quality_flag="invalid", attrs=first_attrs),
        execution_options={"synchronize_session": False},
    )
    assert record.quality_flag == "valid"

    with pytest.raises(HTTPException) as exc_info:
        service.invalidate_measurement(record.id, "second concurrent reason", active_user)

    assert exc_info.value.status_code == 409
    db_session.refresh(record)
    assert record.quality_flag == "invalid"
    assert record.attrs["invalidation_reason"] == "first committed reason"


def test_measurement_rejects_stale_growth_but_allows_current_control_and_other_profile(
    active_user,
    db_session,
) -> None:
    run, stale = _locked_sample(db_session, active_user, "12")
    second = RunRevision(
        experiment_run_id=run.id,
        revision_number=2,
        supersedes_revision_id=run.current_revision_id,
        schema_version=SCHEMA_VERSION,
        schema_status="INTERNAL_VALIDATION",
        status="locked",
        content_json={},
        content_sha256="2" * 64,
        locked_by_id=active_user.id,
    )
    db_session.add(second)
    db_session.flush()
    run.current_revision_id = second.id
    control = Sample(
        sample_code=f"{run.run_code}-S02",
        experiment_run_id=run.id,
        role="control",
    )
    db_session.add(control)
    db_session.flush()
    raw = FileAsset(
        experiment_run_id=run.id,
        sample_id=control.id,
        uploaded_by_id=active_user.id,
        original_name="ellipsometry.csv",
        storage_path=f"test/{uuid4()}",
        content_type="text/csv",
        size_bytes=4,
        sha256="a" * 64,
        method="other",
        file_category="raw",
        asset_role="characterization_file",
    )
    db_session.add(raw)
    foreign_image = FileAsset(
        experiment_run_id=run.id,
        sample_id=stale.id,
        uploaded_by_id=active_user.id,
        original_name="reference.png",
        storage_path=f"test/{uuid4()}",
        content_type="image/png",
        size_bytes=4,
        sha256="b" * 64,
        method="optical_microscopy",
        file_category="raw",
        asset_role="characterization_file",
    )
    db_session.add(foreign_image)
    db_session.commit()
    headers = _headers(active_user.email)

    rejected = client.post(
        "/api/v1/measurements",
        json=_optical_measurement(stale.id),
        headers=headers,
    )
    assert rejected.status_code == 409

    wrong_region_image = _optical_measurement(control.id)
    wrong_region_image["measurement"]["sample_region"] = {
        "geometry_type": "area",
        "label": "roi",
        "coordinate_system": "image",
        "width": 1,
        "height": 1,
        "unit": "μm",
        "image_file_id": str(foreign_image.id),
        "pixel_roi": {"x": 0, "y": 0, "width": 10, "height": 10},
    }
    region_rejected = client.post(
        "/api/v1/measurements",
        json=wrong_region_image,
        headers=headers,
    )
    assert region_rejected.status_code == 422

    other_payload = {
        "measurement": {
            "sample_id": str(control.id),
            "method_profile": "other",
            "measured_at": "2026-08-30T12:00:00+08:00",
            "sample_region": {
                "geometry_type": "whole_sample",
                "label": "whole sample",
                "coordinate_system": "sample_local",
            },
            "typed_conditions": {"method_description": "ellipsometry"},
            "raw_file_ids": [str(raw.id)],
        }
    }
    raw.file_category = "processed"
    db_session.commit()
    processed_rejected = client.post(
        "/api/v1/measurements",
        json=other_payload,
        headers=headers,
    )
    assert processed_rejected.status_code == 422
    raw.file_category = "raw"
    db_session.commit()
    accepted = client.post(
        "/api/v1/measurements",
        json=other_payload,
        headers=headers,
    )
    assert accepted.status_code == 201, accepted.text
    assert accepted.json()["instrument_snapshot_json"] is None
    assert accepted.json()["evidence_present"] is True
    detail = client.get(
        f"/api/v1/measurements/{accepted.json()['id']}",
        headers=headers,
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["raw_file_count"] == 1
    assert detail.json()["raw_files"] == [
        {
            "id": str(raw.id),
            "original_name": "ellipsometry.csv",
            "sha256": "a" * 64,
            "content_type": "text/csv",
            "size_bytes": 4,
            "method": "other",
            "file_category": "raw",
            "deleted_at": None,
        }
    ]
    deleted = client.delete(f"/api/v1/files/{raw.id}", headers=headers)
    assert deleted.status_code == 204, deleted.text
    tombstone = client.get(
        f"/api/v1/measurements/{accepted.json()['id']}",
        headers=headers,
    )
    assert tombstone.status_code == 200, tombstone.text
    assert tombstone.json()["raw_file_count"] == 0
    assert tombstone.json()["evidence_present"] is False
    assert len(tombstone.json()["raw_files"]) == 1
    assert tombstone.json()["raw_files"][0]["deleted_at"] is not None
    listed = client.get(
        f"/api/v1/measurements?sample_id={control.id}",
        headers=headers,
    )
    assert listed.status_code == 200, listed.text
    assert listed.json()["items"][0]["evidence_present"] is False
    control.lifecycle_state = "consumed"
    db_session.commit()
    consumed_rejected = client.post(
        "/api/v1/measurements",
        json=_optical_measurement(control.id),
        headers=headers,
    )
    assert consumed_rejected.status_code == 404


def test_measurement_lists_and_sample_counts_default_to_current_revision(
    active_user,
    db_session,
) -> None:
    run, sample = _locked_sample(db_session, active_user, "13")
    headers = _headers(active_user.email)
    first = client.post(
        "/api/v1/measurements",
        json=_optical_measurement(sample.id),
        headers=headers,
    )
    assert first.status_code == 201, first.text
    old_revision_id = run.current_revision_id
    second_revision = RunRevision(
        experiment_run_id=run.id,
        revision_number=2,
        supersedes_revision_id=old_revision_id,
        schema_version=SCHEMA_VERSION,
        schema_status="INTERNAL_VALIDATION",
        status="locked",
        content_json={},
        content_sha256="3" * 64,
        locked_by_id=active_user.id,
    )
    db_session.add(second_revision)
    db_session.flush()
    run.current_revision_id = second_revision.id
    sample.run_revision_id = second_revision.id
    db_session.commit()
    second = client.post(
        "/api/v1/measurements",
        json=_optical_measurement(sample.id),
        headers=headers,
    )
    assert second.status_code == 201, second.text
    stale_sample = Sample(
        sample_code=f"{run.run_code}-S02",
        experiment_run_id=run.id,
        run_revision_id=old_revision_id,
        role="growth",
    )
    db_session.add(stale_sample)
    db_session.flush()
    db_session.add(
        CharacterizationRecord(
            experiment_run_id=run.id,
            run_revision_id=second_revision.id,
            sample_id=stale_sample.id,
            method_instrument="optical_microscopy",
            performed_by_id=active_user.id,
            measured_at=datetime.now(UTC),
            sample_region={"geometry_type": "whole_sample", "label": "whole"},
            typed_conditions={},
            quality_flag="valid",
        )
    )
    db_session.commit()

    current = client.get(
        f"/api/v1/measurements?run_id={run.id}",
        headers=headers,
    )
    assert current.status_code == 200, current.text
    assert current.json()["total"] == 1
    assert [item["id"] for item in current.json()["items"]] == [second.json()["id"]]
    history = client.get(
        f"/api/v1/measurements?run_id={run.id}&include_history=true",
        headers=headers,
    )
    assert history.status_code == 200, history.text
    assert history.json()["total"] == 3
    first_page = client.get(
        f"/api/v1/measurements?run_id={run.id}&include_history=true&limit=1",
        headers=headers,
    )
    cursor = first_page.json()["next_cursor"]
    assert cursor
    second_page = client.get(
        f"/api/v1/measurements?run_id={run.id}&include_history=true&limit=1&cursor={cursor}",
        headers=headers,
    )
    assert second_page.status_code == 200, second_page.text
    assert second_page.json()["items"][0]["id"] != first_page.json()["items"][0]["id"]
    assert client.get("/api/v1/measurements?cursor=a", headers=headers).status_code == 422
    assert (
        client.get(
            f"/api/v1/measurements?run_id={run.id}&limit=1&cursor={cursor}",
            headers=headers,
        ).status_code
        == 422
    )
    sample_detail = client.get(f"/api/v1/samples/{sample.id}", headers=headers)
    assert sample_detail.json()["characterization_count"] == 1
    stale_detail = client.get(f"/api/v1/samples/{stale_sample.id}", headers=headers)
    assert stale_detail.json()["characterization_count"] == 0


def test_dataset_property_filter_excludes_non_numeric_quality_states(
    active_user,
    db_session,
) -> None:
    run, sample = _locked_sample(db_session, active_user, "14")
    headers = _headers(active_user.email)
    invalid = client.post(
        "/api/v1/measurements",
        json=_optical_measurement(sample.id, property_quality="invalid"),
        headers=headers,
    )
    assert invalid.status_code == 201, invalid.text
    assert invalid.json()["evidence_present"] is False
    invalid_detail = client.get(f"/api/v1/measurements/{invalid.json()['id']}", headers=headers)
    assert invalid_detail.json()["properties"][0]["quality_note"] == "result requires review"
    query = {
        "filters": [
            {
                "field": "property",
                "property_code": "coverage_percent",
                "operator": "eq",
                "value": 10,
            }
        ]
    }
    excluded = client.post("/api/v1/datasets/query", json=query, headers=headers)
    assert excluded.status_code == 200, excluded.text
    assert excluded.json()["items"] == []

    below_limit = client.post(
        "/api/v1/measurements",
        json=_optical_measurement(sample.id, property_quality="below_detection_limit"),
        headers=headers,
    )
    assert below_limit.status_code == 201, below_limit.text
    assert below_limit.json()["evidence_present"] is True
    detection_limit_excluded = client.post("/api/v1/datasets/query", json=query, headers=headers)
    assert detection_limit_excluded.status_code == 200, detection_limit_excluded.text
    assert detection_limit_excluded.json()["items"] == []

    sample.lifecycle_state = "consumed"
    db_session.commit()
    consumed_still_excluded = client.post(
        "/api/v1/datasets/query",
        json=query,
        headers=headers,
    )
    assert consumed_still_excluded.json()["items"] == []

    stale_revision = RunRevision(
        experiment_run_id=run.id,
        revision_number=2,
        supersedes_revision_id=run.current_revision_id,
        schema_version=SCHEMA_VERSION,
        schema_status="INTERNAL_VALIDATION",
        status="superseded",
        content_json={},
        content_sha256="4" * 64,
        locked_by_id=active_user.id,
    )
    db_session.add(stale_revision)
    db_session.flush()
    sample.lifecycle_state = "active"
    sample.run_revision_id = stale_revision.id
    db_session.commit()
    stale_excluded = client.post("/api/v1/datasets/query", json=query, headers=headers)
    assert stale_excluded.status_code == 200, stale_excluded.text
    assert stale_excluded.json()["items"] == []


def test_transformation_acl_provenance_and_cross_run_lineage(
    active_user,
    admin_user,
    db_session,
) -> None:
    run_a, sample_a = _locked_sample(db_session, active_user, "01")
    run_b, sample_b = _locked_sample(db_session, active_user, "02")
    other = User(
        email="scientific-other@example.com",
        name="Scientific Other",
        password_hash=active_user.password_hash,
        role=UserRole.MEMBER,
        is_active=True,
    )
    db_session.add(other)
    db_session.commit()
    payload = {
        "transformation_type": "stack",
        "input_sample_ids": [str(sample_a.id), str(sample_b.id)],
        "outputs": [{"output_role": "stacked_sample"}],
        "occurred_at": "2026-07-29T10:00:00+08:00",
        "consume_inputs": False,
    }

    missing_context = client.post(
        "/api/v1/transformations",
        json=payload,
        headers=_headers(active_user.email),
    )
    assert missing_context.status_code == 422
    forbidden = client.post(
        "/api/v1/transformations",
        json={**payload, "output_experiment_run_id": str(run_a.id)},
        headers=_headers(other.email),
    )
    assert forbidden.status_code == 403
    created = client.post(
        "/api/v1/transformations",
        json={**payload, "output_experiment_run_id": str(run_a.id)},
        headers=_headers(active_user.email),
    )
    assert created.status_code == 201, created.text
    output_id = created.json()["output_sample_ids"][0]
    input_edges = (
        db_session.query(TransformationInput)
        .filter_by(transformation_run_id=UUID(created.json()["id"]))
        .all()
    )
    assert {edge.run_revision_id for edge in input_edges} == {
        run_a.current_revision_id,
        run_b.current_revision_id,
    }
    assert {edge.provenance_json["experiment_run_id"] for edge in input_edges} == {
        str(run_a.id),
        str(run_b.id),
    }
    assert not any(edge.provenance_json["consumed_by_this_transformation"] for edge in input_edges)
    lineage = client.get(
        f"/api/v1/samples/{output_id}/lineage",
        headers=_headers(active_user.email),
    )
    assert {item["id"] for item in lineage.json()["samples"]} >= {
        str(sample_a.id),
        str(sample_b.id),
        output_id,
    }
    lineage_samples = {item["id"]: item for item in lineage.json()["samples"]}
    assert lineage_samples[str(sample_a.id)]["experiment_run_id"] == str(run_a.id)
    assert lineage_samples[str(sample_b.id)]["experiment_run_id"] == str(run_b.id)
    assert lineage.json()["transformations"][0]["output_experiment_run_id"] == str(run_a.id)

    consume = client.post(
        "/api/v1/transformations",
        json={
            **payload,
            "output_experiment_run_id": str(run_a.id),
            "consume_inputs": True,
        },
        headers=_headers(active_user.email),
    )
    assert consume.status_code == 201
    consumed_edges = (
        db_session.query(TransformationInput)
        .filter_by(transformation_run_id=UUID(consume.json()["id"]))
        .all()
    )
    assert all(edge.provenance_json["consumed_by_this_transformation"] for edge in consumed_edges)
    repeated = client.post(
        "/api/v1/transformations",
        json={**payload, "output_experiment_run_id": str(run_a.id)},
        headers=_headers(active_user.email),
    )
    assert repeated.status_code == 409

    member_review = client.post(
        f"/api/v1/experiments/{run_a.id}/review",
        json={},
        headers=_headers(active_user.email),
    )
    assert member_review.status_code == 403
    admin_review = client.post(
        f"/api/v1/experiments/{run_a.id}/review",
        json={},
        headers=_headers(admin_user.email),
    )
    assert admin_review.status_code == 200
    still_visible = client.get(
        f"/api/v1/experiments/{run_a.id}",
        headers=_headers(other.email),
    )
    assert still_visible.status_code == 200


def test_measurement_freezes_calibration_state(active_user, db_session) -> None:
    run, sample = _locked_sample(db_session, active_user, "03")
    instrument = Instrument()
    db_session.add(instrument)
    db_session.flush()
    version = InstrumentVersion(
        entity_id=instrument.id,
        version=1,
        instrument_code="RAMAN-QA",
        name_type="Raman",
        attrs={},
    )
    db_session.add(version)
    db_session.flush()
    db_session.add(
        InstrumentCapability(
            instrument_version_id=version.id,
            capability_code="Raman",
            configuration_json={},
        )
    )
    calibration = InstrumentLifecycleEvent(
        instrument_id=instrument.id,
        event_type="calibration",
        occurred_at=datetime(2026, 7, 1, tzinfo=UTC),
        valid_until=datetime(2027, 7, 1, tzinfo=UTC),
        quantity="Raman shift",
        correction=0.2,
        expanded_uncertainty=0.5,
        details_json={"reference": "silicon"},
    )
    db_session.add(calibration)
    raw_file = FileAsset(
        experiment_run_id=run.id,
        sample_id=sample.id,
        uploaded_by_id=active_user.id,
        original_name="raman-spectrum.txt",
        storage_path=f"test/{sample.id}_raman-spectrum.txt",
        content_type="text/plain",
        size_bytes=12,
        sha256="b" * 64,
        method="PL",
        file_category="raw",
        asset_role="characterization_file",
        file_kind="spectrum",
        metadata_json={},
    )
    db_session.add(raw_file)
    db_session.commit()

    payload = {
        "measurement": {
            "sample_id": str(sample.id),
            "method_profile": "Raman",
            "instrument_id": str(instrument.id),
            "instrument_version": 1,
            "measured_at": "2026-07-29T10:00:00+00:00",
            "sample_region": {
                "geometry_type": "point",
                "label": "center",
                "coordinate_system": "sample_local",
            },
            "typed_conditions": {
                "laser_wavelength_nm": 532,
                "excitation_power_value": 1,
                "excitation_power_basis": "sample_plane_mW",
                "objective": "50x",
                "integration_time_s": 5,
                "accumulations": 3,
            },
            "raw_file_ids": [str(raw_file.id)],
        },
        "assertions": [
            {
                "assertion_type": "phase_identity",
                "value": {"phase": "2H-MoS2"},
            }
        ],
    }
    headers = _headers(active_user.email)
    wrong_method = client.post(
        "/api/v1/measurements",
        json=payload,
        headers=headers,
    )
    assert wrong_method.status_code == 422
    raw_file.method = "Raman"
    db_session.commit()

    response = client.post(
        "/api/v1/measurements",
        json=payload,
        headers=headers,
    )
    assert response.status_code == 201, response.text
    duplicate = client.post(
        "/api/v1/measurements",
        json=payload,
        headers=headers,
    )
    assert duplicate.status_code == 422
    assert duplicate.json()["detail"] == "Raw data files are already linked to a measurement"
    db_session.refresh(raw_file)
    assert raw_file.characterization_record_id == UUID(response.json()["id"])
    assert db_session.query(CharacterizationRecord).count() == 1
    sample_response = client.get(
        f"/api/v1/samples/{sample.id}",
        headers=headers,
    )
    assert sample_response.status_code == 200
    assert sample_response.json()["characterization_count"] == 1
    snapshot = response.json()["instrument_snapshot_json"]["calibration_at_measurement"]
    assert snapshot["event_id"] == str(calibration.id)
    assert snapshot["validity_status"] == "valid"
    assert snapshot["expanded_uncertainty"] == 0.5
    db_session.refresh(sample)
    assert sample.actual_state == "unknown"
    assert sample.identity_state == "asserted"
    assert sample.actual_material_summary == "2H-MoS2"
