from copy import deepcopy
from uuid import uuid4

import pytest
from jsonschema import Draft202012Validator

from app.commands.export_v2_schema import export_v2_schema
from app.schemas.scientific import MeasurementBundleCreate


def peak_payload(method="Raman", unit="cm⁻¹"):
    source_id = str(uuid4())
    conditions = {
        "Raman": {"laser_wavelength_nm": 532},
        "low_frequency_raman": {"laser_wavelength_nm": 532},
        "PL": {"excitation_wavelength_nm": 532},
        "XRD": {
            "radiation_source": "Cu",
            "source_wavelength_nm": 0.154,
            "scan_axis": "two_theta",
            "scan_range_deg": {"start": 10, "end": 80},
            "step_size_deg": 0.02,
        },
    }
    return {
        "measurement": {
            "sample_id": str(uuid4()),
            "method_profile": method,
            "instrument_id": str(uuid4()),
            "instrument_version": 1,
            "measured_at": "2026-09-04T12:00:00+08:00",
            "typed_conditions": conditions[method],
            "raw_file_ids": [source_id],
        },
        "properties": [
            {
                "property_code": "spectral_peaks",
                "structured_value": {
                    "status": "recorded",
                    "position_unit": unit,
                    "intensity_unit": "a.u.",
                    "source_file_id": source_id,
                    "peaks": [
                        {"id": 1, "position": 20, "fwhm": 2},
                        {"id": 2, "position": 30, "fwhm": 3},
                    ],
                },
            }
        ],
    }


@pytest.mark.parametrize(
    ("method", "unit"),
    [
        ("Raman", "cm⁻¹"),
        ("low_frequency_raman", "cm⁻¹"),
        ("PL", "nm"),
        ("PL", "eV"),
        ("XRD", "° 2θ"),
    ],
)
def test_unassigned_peaks_are_grouped_and_need_no_region(method, unit):
    payload = peak_payload(method, unit)
    model = MeasurementBundleCreate.model_validate(payload)
    assert model.measurement.sample_region is None
    assert model.assertions == []
    assert len(model.properties[0].structured_value["peaks"]) == 2
    schema = export_v2_schema(output_dir=None)["json_schema_doc"]["result_models"][
        "measurement_bundle"
    ]
    Draft202012Validator(schema).validate(payload)


@pytest.mark.parametrize("status", ["not_detected", "not_analyzed"])
def test_no_detected_peaks_are_not_a_numeric_threshold_or_material_verdict(status):
    payload = peak_payload()
    value = payload["properties"][0]["structured_value"]
    value.update(status=status, peaks=[])
    model = MeasurementBundleCreate.model_validate(payload)
    assert model.properties[0].numeric_value is None
    assert model.assertions == []


@pytest.mark.parametrize(
    "mutation",
    [
        lambda value: value.update(status="not_detected"),
        lambda value: value.update(peaks=[]),
        lambda value: value["peaks"][0].update(fwhm=0),
        lambda value: value["peaks"][0].update(mode="A1g"),
        lambda value: value["peaks"][0].pop("position"),
        lambda value: value.update(source_file_id=str(uuid4())),
        lambda value: value["peaks"][1].update(id=1),
        lambda value: value.update(position_unit="nm"),
        lambda value: value["peaks"][0].update(d_spacing_nm=0.3),
    ],
)
def test_invalid_or_interpretive_peak_payloads_are_rejected(mutation):
    payload = peak_payload()
    mutation(payload["properties"][0]["structured_value"])
    with pytest.raises(ValueError):
        MeasurementBundleCreate.model_validate(payload)


@pytest.mark.parametrize("power", [100, 101])
def test_power_percentage_bound_matches_exported_contract(power):
    payload = peak_payload()
    payload["measurement"]["typed_conditions"].update(
        excitation_power_value=power, excitation_power_basis="instrument_percent"
    )
    validator = Draft202012Validator(
        export_v2_schema(output_dir=None)["json_schema_doc"]["result_models"]["measurement_bundle"]
    )
    if power == 100:
        MeasurementBundleCreate.model_validate(payload)
        validator.validate(payload)
    else:
        with pytest.raises(ValueError, match="cannot exceed 100"):
            MeasurementBundleCreate.model_validate(payload)
        assert not validator.is_valid(payload)


@pytest.mark.parametrize("tilt", [-90, -20, 0, 90])
def test_sem_accepts_signed_stage_tilt(tilt):
    payload = peak_payload()
    payload["measurement"].update(
        method_profile="SEM",
        typed_conditions={
            "accelerating_voltage_kV": 5,
            "mode": "secondary_electron",
            "stage_tilt_deg": tilt,
        },
    )
    payload["properties"] = []
    MeasurementBundleCreate.model_validate(payload)


def test_xrd_rocking_curve_has_omega_peaks_and_no_bragg_d_spacing():
    payload = peak_payload("XRD", "° ω")
    payload["measurement"]["typed_conditions"] = {
        "radiation_source": "Cu Kα1",
        "source_wavelength_nm": 0.15406,
        "geometry": "rocking_curve",
        "scan_axis": "omega",
        "scan_range_deg": {"start": -1, "end": 1},
        "scan_mode": "continuous",
        "scan_rate_deg_min": 0.1,
    }
    series = payload["properties"][0]["structured_value"]
    series["peaks"] = [{"id": 1, "position": -0.2, "fwhm": 0.1}]
    MeasurementBundleCreate.model_validate(payload)
    validator = Draft202012Validator(
        export_v2_schema(output_dir=None)["json_schema_doc"]["result_models"]["measurement_bundle"]
    )
    validator.validate(payload)
    series["peaks"][0]["d_spacing_nm"] = 0.3
    with pytest.raises(ValueError, match="2theta"):
        MeasurementBundleCreate.model_validate(payload)
    assert not validator.is_valid(payload)
    series["peaks"][0].pop("d_spacing_nm")
    payload["measurement"]["typed_conditions"]["count_time_s"] = 1
    with pytest.raises(ValueError, match="does not apply"):
        MeasurementBundleCreate.model_validate(payload)
    assert not validator.is_valid(payload)


@pytest.mark.parametrize("data_type", ["spectrum", "polarization_scan", "image", "power_scan"])
def test_shg_uses_typed_data_modes_without_material_verdicts(data_type):
    payload = peak_payload()
    payload["measurement"].update(
        method_profile="SHG",
        typed_conditions={
            "data_type": data_type,
            "excitation_wavelength_nm": 800,
            "excitation_mode": "pulsed",
            "pulse_width_fs": 100,
            "repetition_rate_MHz": 80,
        },
    )
    payload["properties"] = []
    validator = Draft202012Validator(
        export_v2_schema(output_dir=None)["json_schema_doc"]["result_models"]["measurement_bundle"]
    )
    validator.validate(payload)
    model = MeasurementBundleCreate.model_validate(payload)
    assert model.assertions == []
    assert model.measurement.sample_region is None
    payload["measurement"]["typed_conditions"]["excitation_mode"] = "continuous"
    with pytest.raises(ValueError, match="does not apply"):
        MeasurementBundleCreate.model_validate(payload)
    assert not validator.is_valid(payload)


def test_tem_stem_and_eds_can_coexist():
    payload = peak_payload()
    payload["measurement"].update(
        method_profile="TEM",
        typed_conditions={
            "accelerating_voltage_kV": 80,
            "data_type": "spectrum",
            "acquisition_mode": "STEM",
            "spectrum_mode": "EDS",
        },
    )
    payload["properties"] = [
        {
            "property_code": "elemental_composition",
            "structured_value": {
                "basis": "atomic_fraction",
                "components": [{"species": "Mo", "fraction": 1}],
            },
        }
    ]
    MeasurementBundleCreate.model_validate(payload)
    Draft202012Validator(
        export_v2_schema(output_dir=None)["json_schema_doc"]["result_models"]["measurement_bundle"]
    ).validate(payload)


def test_legacy_assigned_peaks_and_material_verdicts_cannot_be_new_results():
    payload = peak_payload()
    assigned = deepcopy(payload)
    assigned["properties"] = [
        {"property_code": "raman_a1g_peak_position", "numeric_value": 405, "unit": "cm⁻¹"}
    ]
    with pytest.raises(ValueError, match="do not apply"):
        MeasurementBundleCreate.model_validate(assigned)
    payload["assertions"] = [{"assertion_type": "layer_count", "value": {"count": 1}}]
    with pytest.raises(ValueError, match="assertions do not apply"):
        MeasurementBundleCreate.model_validate(payload)


def test_eds_accepts_element_quantification_but_not_lattice_or_site_assignments():
    payload = peak_payload()
    payload["measurement"].update(
        method_profile="TEM", typed_conditions={"accelerating_voltage_kV": 80, "mode": "EDS"}
    )
    payload["properties"] = [
        {
            "property_code": "elemental_composition",
            "structured_value": {
                "basis": "atomic_fraction",
                "components": [
                    {"species": "Mo", "fraction": 0.4},
                    {"species": "S", "fraction": 0.6},
                ],
            },
        }
    ]
    MeasurementBundleCreate.model_validate(payload)
    payload["properties"][0]["structured_value"]["basis"] = "site_fraction"
    with pytest.raises(ValueError):
        MeasurementBundleCreate.model_validate(payload)
    payload["properties"] = [
        {"property_code": "tem_lattice_spacing", "numeric_value": 0.3, "unit": "nm"}
    ]
    with pytest.raises(ValueError, match="does not apply"):
        MeasurementBundleCreate.model_validate(payload)
