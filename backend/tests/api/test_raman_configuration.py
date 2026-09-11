from copy import deepcopy
from datetime import datetime
from uuid import UUID, uuid4

import pytest

from app.commands.export_v2_schema import export_v2_schema
from app.core.scientific_json_schema import ScientificJSONValidator
from app.models.v2_entities import InstrumentLifecycleEvent
from app.schemas.scientific import MeasurementBundleCreate
from app.services.om_configuration import resolve_om_configuration, validate_om_catalog
from tests.api.test_scientific_integrity import _headers, _locked_sample, client


def catalog():
    return {
        "lasers": [
            {
                "name": "Green",
                "conditions": {"laser_wavelength_nm": 532, "power_setting_unit": "percent"},
            }
        ],
        "objectives": [
            {
                "name": "100x",
                "conditions": {
                    "sampling_optic": "microscope",
                    "objective_magnification": 100,
                    "objective_na": 0.9,
                    "objective_immersion": "air",
                },
            }
        ],
        "spectrometers": [
            {
                "name": "1800 CCD",
                "references": {"lasers": "Green"},
                "conditions": {
                    "grating_lines_per_mm": 1800,
                    "detector": "CCD",
                    "collection_geometry": "reflection",
                    "filter_configuration": "532 edge",
                    "slit_width_um": 100,
                    "wavenumber_calibration": "Si reference, 2026-09-01",
                },
                "adjustable": ["slit_width_um"],
            }
        ],
    }


@pytest.mark.parametrize("damage", ["missing_na", "dry_na", "laser_reference", "sample_preset"])
def test_raman_rejects_invalid_registration(damage):
    config = catalog()
    if damage == "missing_na":
        del config["objectives"][0]["conditions"]["objective_na"]
    elif damage == "dry_na":
        config["objectives"][0]["conditions"]["objective_na"] = 1.2
    elif damage == "laser_reference":
        config["spectrometers"][0]["references"]["lasers"] = "Red"
    else:
        config["spectrometers"][0]["conditions"]["sample_preparation"] = "rinse"
    with pytest.raises(ValueError):
        validate_om_catalog(config, "Raman")


def test_raman_selected_configuration_series_and_export(admin_user, db_session):
    run, sample = _locked_sample(db_session, admin_user, "raman46")
    headers = _headers(admin_user.email)
    config = catalog()
    payload = {
        "instrument_code": "RAMAN-46",
        "name_type": "Raman",
        "capabilities": [
            {
                "code": "Raman",
                "configuration": {
                    "raman": config,
                    "presets": [
                        {
                            "name": "10s",
                            "conditions": {"integration_time_s": 10, "accumulations": 3},
                        }
                    ],
                },
            }
        ],
    }
    response = client.post("/api/v1/instruments", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    instrument = response.json()
    for day, laser, correction in [(8, "Green", 0.1), (9, "Red", 0.2)]:
        db_session.add(
            InstrumentLifecycleEvent(
                instrument_id=UUID(instrument["id"]),
                event_type="calibration",
                occurred_at=datetime.fromisoformat(f"2026-09-{day:02d}T00:00:00+00:00"),
                quantity="raman_shift",
                correction=correction,
                details_json={
                    "instrument_version": 1,
                    "configuration": {"lasers": laser, "spectrometers": "1800 CCD"},
                },
            )
        )
    db_session.add(
        InstrumentLifecycleEvent(
            instrument_id=UUID(instrument["id"]),
            event_type="calibration",
            occurred_at=datetime.fromisoformat("2026-09-10T00:00:00+00:00"),
            quantity="raman_shift",
            correction=9,
            details_json={
                "instrument_version": True,
                "configuration": {"lasers": "Green", "spectrometers": "1800 CCD"},
            },
        )
    )
    db_session.commit()
    upload = client.post(
        f"/api/v1/experiments/{run.id}/files",
        headers=headers,
        data={
            "sample_id": str(sample.id),
            "method": "Raman",
            "asset_role": "characterization_file",
            "file_category": "raw",
        },
        files={
            "file": (
                "power-scan.txt",
                b"power_percent,shift_cm-1,counts\n1,380,20\n2,380,40\n",
                "text/plain",
            )
        },
    )
    assert upload.status_code == 201, upload.text
    file_id = upload.json()["id"]
    selection = {"lasers": "Green", "objectives": "100x", "spectrometers": "1800 CCD"}
    fixed, _ = resolve_om_configuration(config, selection, method="Raman")
    conditions = {
        **fixed,
        "acquisition_kind": "series",
        "scan_coordinates": "power_percent (%), shift_cm-1 (cm-1), counts",
        "integration_time_s": 10,
        "accumulations": 3,
        "raman_shift_range_cm1": {"start": 100, "end": 500},
        "slit_width_um": 80,
    }
    bundle = {
        "measurement": {
            "sample_id": str(sample.id),
            "method_profile": "Raman",
            "instrument_id": instrument["id"],
            "instrument_version": 1,
            "measured_at": "2026-09-11T08:00:00+08:00",
            "typed_conditions": conditions,
            "instrument_configuration": selection,
            "raw_file_ids": [file_id],
            "scan_file_id": file_id,
            "variable_conditions": ["power_setting"],
            "file_intensity_units": {file_id: "counts"},
        },
        "properties": [
            {
                "property_code": "spectral_peaks",
                "structured_value": {
                    "status": "recorded",
                    "position_unit": "cm⁻¹",
                    "intensity_unit": "counts",
                    "source_file_id": file_id,
                    "source_locator": "power_percent=1",
                    "extraction_method": "Lorentzian fit",
                    "baseline_method": "linear subtraction",
                    "peaks": [{"id": 1, "position": 380, "fwhm": 4, "height": 20}],
                },
            }
        ],
    }
    for mutate in [
        lambda data: data["measurement"]["typed_conditions"].update(objective_na=0.8),
        lambda data: data["measurement"].update(instrument_configuration={}),
        lambda data: data["measurement"]["typed_conditions"].update(power_setting="1"),
        lambda data: data["measurement"].update(scan_file_id=str(uuid4())),
        lambda data: data["properties"][0]["structured_value"].pop("source_locator"),
        lambda data: data["properties"][0]["structured_value"].update(intensity_unit="counts/s"),
        lambda data: data["properties"][0]["structured_value"]["peaks"][0].update(position=800),
    ]:
        invalid = deepcopy(bundle)
        mutate(invalid)
        assert client.post("/api/v1/measurements", json=invalid, headers=headers).status_code == 422
    response = client.post("/api/v1/measurements", json=bundle, headers=headers)
    assert response.status_code == 201, response.text
    record_id = response.json()["id"]
    db_session.add(
        InstrumentLifecycleEvent(
            instrument_id=UUID(instrument["id"]),
            event_type="calibration",
            occurred_at=datetime.fromisoformat("2026-09-10T00:00:00+00:00"),
            quantity="raman_shift",
            correction=0.3,
            details_json={
                "instrument_version": 1,
                "configuration": {"lasers": "Green", "spectrometers": "1800 CCD"},
            },
        )
    )
    db_session.commit()
    config["objectives"][0]["conditions"]["objective_na"] = 0.75
    assert (
        client.post(
            f"/api/v1/instruments/{instrument['id']}/versions", json=payload, headers=headers
        ).status_code
        == 201
    )
    detail = client.get(f"/api/v1/measurements/{record_id}", headers=headers).json()
    assert detail["typed_conditions"]["objective_na"] == 0.9
    assert (
        detail["instrument_snapshot_json"]["calibration_at_measurement"]["quantities"][
            "raman_shift"
        ]["correction"]
        == 0.1
    )
    assert "power_setting" not in detail["typed_conditions"]
    assert detail["variable_conditions"] == ["power_setting"]
    assert detail["scan_file_id"] == file_id
    assert detail["file_intensity_units"] == {file_id: "counts"}
    exported = client.get(
        f"/api/v1/experiments/{run.id}/export",
        headers=headers,
        params={"revision_id": str(run.current_revision_id)},
    ).json()["scientific_record"]["measurements"][0]
    assert exported["instrument_configuration"] == selection
    assert exported["variable_conditions"] == ["power_setting"]
    assert exported["file_intensity_units"] == {file_id: "counts"}


def test_raman_schema_and_model_agree_on_ranges_and_variable_temperature():
    schema = ScientificJSONValidator(
        export_v2_schema(output_dir=None)["json_schema_doc"]["result_models"]["measurement_bundle"]
    )
    file_id = str(uuid4())
    base = {
        "measurement": {
            "sample_id": str(uuid4()),
            "instrument_id": str(uuid4()),
            "instrument_version": 1,
            "method_profile": "Raman",
            "measured_at": "2026-09-11T08:00:00+08:00",
            "raw_file_ids": [file_id],
            "scan_file_id": file_id,
            "variable_conditions": ["temperature_K"],
            "typed_conditions": {
                "laser_wavelength_nm": 532,
                "acquisition_kind": "series",
                "temperature_control": "recorded",
                "temperature_basis": "stage_setpoint",
                "scan_coordinates": "temperature_K (K)",
                "raman_shift_range_cm1": {"start": -100, "end": 500},
            },
        }
    }
    MeasurementBundleCreate.model_validate(base)
    assert schema.is_valid(base)
    base["measurement"]["typed_conditions"]["raman_shift_range_cm1"] = {"start": 500, "end": 100}
    with pytest.raises(ValueError):
        MeasurementBundleCreate.model_validate(base)
    assert not schema.is_valid(base)
