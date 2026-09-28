from copy import deepcopy
from uuid import uuid4

import pytest

from app.commands.export_v2_schema import export_v2_schema
from app.core.scientific_json_schema import ScientificJSONValidator
from app.schemas.scientific import MeasurementBundleCreate
from app.services.om_configuration import resolve_om_configuration, validate_om_catalog
from app.services.v2_entity_service import V2EntityService
from tests.api.test_scientific_integrity import _headers, _locked_sample, client

SELECTION = {"lasers": "Ti:S 800", "objectives": "60x", "detections": "PMT 400"}


def catalog():
    return {
        "lasers": [
            {
                "name": "Ti:S 800",
                "conditions": {
                    "excitation_wavelength_nm": 800,
                    "excitation_mode": "pulsed",
                    "power_setting_unit": "percent",
                    "pulse_width_fs": 140,
                    "repetition_rate_MHz": 80,
                },
            }
        ],
        "objectives": [
            {
                "name": "60x",
                "conditions": {
                    "objective_magnification": 60,
                    "objective_na": 0.75,
                    "objective_immersion": "air",
                },
            }
        ],
        "detections": [
            {
                "name": "PMT 400",
                "references": {"lasers": "Ti:S 800"},
                "conditions": {
                    "detection_kind": "point_detector",
                    "detector": "PMT",
                    "filter_configuration": "400/40 bandpass",
                    "collection_geometry": "reflection",
                    "incident_polarization_state": "linear",
                    "analyzer_mode": "parallel",
                    "polarization_reference": "stage x, counterclockwise",
                },
                "adjustable": ["detector_gain", "analyzer_mode"],
            }
        ],
    }


def _instrument_children(configuration):
    V2EntityService(None)._validate_normalized_children(
        "instrument", {"capabilities": [{"code": "SHG", "configuration": configuration}]}
    )


@pytest.mark.parametrize(
    "damage", ["missing_na", "dry_na", "missing_pulse_rate", "camera_grating", "laser_reference"]
)
def test_shg_rejects_invalid_registration(damage):
    config = catalog()
    if damage == "missing_na":
        del config["objectives"][0]["conditions"]["objective_na"]
    elif damage == "dry_na":
        config["objectives"][0]["conditions"]["objective_na"] = 1.2
    elif damage == "missing_pulse_rate":
        del config["lasers"][0]["conditions"]["repetition_rate_MHz"]
    elif damage == "camera_grating":
        config["detections"][0]["conditions"].update(
            detection_kind="camera", grating_lines_per_mm=600
        )
    else:
        config["detections"][0]["references"]["lasers"] = "Red"
    with pytest.raises(ValueError):
        validate_om_catalog(config, "SHG")


def test_shg_catalog_presets_and_configuration_keys():
    validate_om_catalog(catalog(), "SHG")
    _instrument_children(
        {
            "shg": catalog(),
            "presets": [
                {
                    "name": "P-SHG",
                    "conditions": {
                        "power_setting": "5",
                        "power_setting_unit": "percent",
                        "integration_time_s": 1,
                    },
                },
                {"name": "Scan", "conditions": {"pixel_dwell_time_us": 20, "accumulations": 2}},
            ],
        }
    )
    for configuration in [
        {"presets": [{"name": "bad", "conditions": {"sample_preparation": "anneal"}}]},
        {"presets": [{"name": "bad", "conditions": {"measured_power_mW": 1}}]},
        {"presets": [{"name": "bad", "conditions": {"detection_kind": "camera"}}]},
        {
            "presets": [
                {"name": "bad", "conditions": {"pixel_dwell_time_us": 20, "integration_time_s": 1}}
            ]
        },
        {"unknown": {}},
    ]:
        with pytest.raises(Exception) as error:
            _instrument_children(configuration)
        assert error.value.status_code == 422
    with pytest.raises(Exception) as error:
        V2EntityService(None)._validate_normalized_children(
            "instrument", {"capabilities": [{"code": "PL", "configuration": {"shg": catalog()}}]}
        )
    assert error.value.status_code == 422


def test_shg_polarization_series_save_detail_and_export(admin_user, db_session):
    run, sample = _locked_sample(db_session, admin_user, "shg48")
    headers = _headers(admin_user.email)
    config = catalog()
    instrument_payload = {
        "instrument_code": "SHG-48",
        "name_type": "SHG",
        "capabilities": [{"code": "SHG", "configuration": {"shg": config}}],
    }
    response = client.post("/api/v1/instruments", json=instrument_payload, headers=headers)
    assert response.status_code == 201, response.text
    instrument = response.json()
    uploaded = client.post(
        f"/api/v1/experiments/{run.id}/files",
        headers=headers,
        data={
            "sample_id": str(sample.id),
            "method": "SHG",
            "asset_role": "characterization_file",
            "file_category": "raw",
        },
        files={"file": ("pshg.txt", b"hwp_deg,counts\n0,20\n5,18\n", "text/plain")},
    )
    assert uploaded.status_code == 201, uploaded.text
    file_id = uploaded.json()["id"]
    fixed, _ = resolve_om_configuration(config, SELECTION, method="SHG")
    data = {
        "measurement": {
            "sample_id": str(sample.id),
            "method_profile": "SHG",
            "instrument_id": instrument["id"],
            "instrument_version": 1,
            "instrument_configuration": SELECTION,
            "measured_at": "2026-09-13T08:00:00+08:00",
            "raw_file_ids": [file_id],
            "typed_conditions": {
                **fixed,
                "acquisition_kind": "series",
                "scan_coordinates": "hwp_deg (°), counts",
                "power_setting": "5",
                "integration_time_s": 1,
                "accumulations": 1,
                "measured_power_mW": 1.2,
                "power_measurement_position": "before_objective",
            },
            "scan_file_id": file_id,
            "variable_conditions": ["waveplate_angle_deg"],
            "file_intensity_units": {file_id: "counts"},
        }
    }
    for mutate in [
        lambda d: d["measurement"]["typed_conditions"].pop("integration_time_s"),
        lambda d: d["measurement"]["typed_conditions"].update(acquisition_kind="mapping"),
        lambda d: d["measurement"]["typed_conditions"].update(incident_polarization_angle_deg=10),
        lambda d: d["measurement"]["typed_conditions"].update(detector="APD"),
        lambda d: d["measurement"]["typed_conditions"].update(pulse_width_fs=100),
        lambda d: d["measurement"]["typed_conditions"].pop("power_measurement_position"),
        lambda d: d["measurement"]["typed_conditions"].pop("power_setting"),
        lambda d: d["measurement"].pop("scan_file_id"),
        lambda d: d["measurement"].update(instrument_configuration={}),
    ]:
        invalid = deepcopy(data)
        mutate(invalid)
        response = client.post("/api/v1/measurements", json=invalid, headers=headers)
        assert response.status_code == 422, response.text
    response = client.post("/api/v1/measurements", json=data, headers=headers)
    assert response.status_code == 201, response.text
    detail = client.get(f"/api/v1/measurements/{response.json()['id']}", headers=headers).json()
    assert detail["typed_conditions"]["objective_na"] == 0.75
    assert detail["scan_file_id"] == file_id
    assert detail["variable_conditions"] == ["waveplate_angle_deg"]
    exported = client.get(
        f"/api/v1/experiments/{run.id}/export",
        headers=headers,
        params={"revision_id": str(run.current_revision_id)},
    ).json()["scientific_record"]["measurements"][0]
    assert exported["variable_conditions"] == ["waveplate_angle_deg"]
    assert exported["instrument_configuration"] == SELECTION


def test_shg_condition_and_schema_boundaries():
    schema = ScientificJSONValidator(
        export_v2_schema(output_dir=None)["json_schema_doc"]["result_models"]["measurement_bundle"]
    )
    file_id = str(uuid4())
    base = {
        "measurement": {
            "sample_id": str(uuid4()),
            "instrument_id": str(uuid4()),
            "instrument_version": 1,
            "method_profile": "SHG",
            "measured_at": "2026-09-13T00:00:00Z",
            "raw_file_ids": [file_id],
            "typed_conditions": {"excitation_wavelength_nm": 800, "detection_kind": "spectrometer"},
        }
    }
    MeasurementBundleCreate.model_validate(base)
    assert schema.is_valid(base)
    linear = {"incident_polarization_state": "linear", "polarization_reference": "stage x"}
    for conditions, schema_rejects in [
        ({"detection_kind": None}, True),
        ({"resolution_px": {"width": 512, "height": 512}}, False),
        ({"detection_kind": "camera", "grating_lines_per_mm": 600}, True),
        ({"excitation_mode": "pulsed"}, True),
        ({"excitation_mode": "pulsed", "pulse_width_fs": 2e7, "repetition_rate_MHz": 80}, False),
        ({"measured_power_mW": 1}, True),
        ({"incident_polarization_state": "unpolarized", "analyzer_mode": "parallel"}, True),
        ({"analyzer_mode": "fixed"}, True),
        ({**linear, "incident_polarization_angle_deg": 20}, True),
        (
            {
                **linear,
                "analyzer_mode": "parallel",
                "incident_polarization_angle_deg": 20,
                "waveplate_angle_deg": 10,
            },
            False,
        ),
        (
            {
                "detection_kind": "point_detector",
                "acquisition_kind": "mapping",
                "scan_coordinates": "x, y",
                "integration_time_s": 1,
            },
            False,
        ),
        ({"accumulation_method": "separate"}, True),
    ]:
        data = deepcopy(base)
        typed = data["measurement"]["typed_conditions"]
        typed.update(conditions)
        for key in [key for key, value in typed.items() if value is None]:
            del typed[key]
        if typed.get("acquisition_kind") == "mapping":
            data["measurement"]["scan_file_id"] = file_id
        with pytest.raises(ValueError):
            MeasurementBundleCreate.model_validate(data)
        assert schema.is_valid(data) is not schema_rejects, conditions

    series = deepcopy(base)
    series["measurement"]["typed_conditions"] = {
        "detection_kind": "spectrometer",
        "acquisition_kind": "series",
        "scan_coordinates": "excitation_nm, wavelength_nm, counts",
    }
    series["measurement"].update(
        scan_file_id=file_id, variable_conditions=["excitation_wavelength_nm"]
    )
    MeasurementBundleCreate.model_validate(series)
    assert schema.is_valid(series)

    camera = deepcopy(base)
    camera["measurement"]["typed_conditions"].update(
        detection_kind="camera",
        acquisition_kind="single",
        exposure_time_ms=50,
        resolution_px={"width": 1024, "height": 1024},
    )
    MeasurementBundleCreate.model_validate(camera)
    assert schema.is_valid(camera)

    dwell = deepcopy(base)
    dwell["measurement"]["typed_conditions"].update(
        detection_kind="point_detector",
        acquisition_kind="mapping",
        scan_coordinates="x, y",
        pixel_dwell_time_us=20,
        resolution_px={"width": 512, "height": 512},
    )
    dwell["measurement"]["scan_file_id"] = file_id
    MeasurementBundleCreate.model_validate(dwell)
    assert schema.is_valid(dwell)

    peaks = deepcopy(base)
    peaks["measurement"]["typed_conditions"]["spectral_range_nm"] = {"min": 380, "max": 420}
    peaks["properties"] = [
        {
            "property_code": "spectral_peaks",
            "structured_value": {
                "status": "recorded",
                "position_unit": "nm",
                "source_file_id": file_id,
                "peaks": [{"id": 1, "position": 400}],
            },
        }
    ]
    MeasurementBundleCreate.model_validate(peaks)
    outside = deepcopy(peaks)
    outside["properties"][0]["structured_value"]["peaks"][0]["position"] = 700
    with pytest.raises(ValueError, match="outside"):
        MeasurementBundleCreate.model_validate(outside)
    point = deepcopy(peaks)
    point["measurement"]["typed_conditions"] = {
        "excitation_wavelength_nm": 800,
        "detection_kind": "point_detector",
    }
    with pytest.raises(ValueError, match="does not apply"):
        MeasurementBundleCreate.model_validate(point)
