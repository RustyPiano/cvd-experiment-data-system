from copy import deepcopy
from datetime import datetime
from uuid import UUID, uuid4

import pytest

from app.commands.export_v2_schema import export_v2_schema
from app.core.scientific_json_schema import ScientificJSONValidator
from app.models.v2_entities import InstrumentLifecycleEvent
from app.schemas.scientific import MeasurementBundleCreate
from app.services.om_configuration import resolve_om_configuration, validate_om_catalog
from app.services.v2_entity_service import V2EntityService
from tests.api.test_raman_configuration import catalog as raman_catalog
from tests.api.test_scientific_integrity import _headers, _locked_sample, client


def catalog():
    config = raman_catalog()
    config["lasers"][0]["conditions"] = {
        "excitation_source_kind": "laser",
        "excitation_wavelength_nm": 532,
        "excitation_mode": "continuous",
        "power_setting_unit": "percent",
    }
    config["spectrometers"][0]["conditions"].pop("wavenumber_calibration")
    config["spectrometers"][0]["conditions"]["wavelength_calibration"] = "lamp report"
    return config


def test_pl_catalog_and_preset_boundaries():
    config = catalog()
    validate_om_catalog(config, "PL")
    for key in ["objective_na", "objective_magnification", "objective_immersion"]:
        invalid = deepcopy(config)
        invalid["objectives"][0]["conditions"].pop(key)
        with pytest.raises(ValueError):
            validate_om_catalog(invalid, "PL")
    for conditions in [
        {"sample_preparation": "rinse"},
        {"response_correction": "applied"},
        {"sample_power_mW": 0.2},
    ]:
        with pytest.raises(Exception) as error:
            V2EntityService(None)._validate_normalized_children(
                "instrument",
                {
                    "capabilities": [
                        {
                            "code": "PL",
                            "configuration": {
                                "presets": [{"name": "invalid", "conditions": conditions}]
                            },
                        }
                    ]
                },
            )
        assert error.value.status_code == 422


def test_pl_configuration_series_response_and_export(admin_user, db_session):
    run, sample = _locked_sample(db_session, admin_user, "pl47")
    headers = _headers(admin_user.email)
    config = catalog()
    instrument_payload = {
        "instrument_code": "PL-47",
        "name_type": "PL",
        "capabilities": [{"code": "PL", "configuration": {"pl": config}}],
    }
    response = client.post("/api/v1/instruments", json=instrument_payload, headers=headers)
    assert response.status_code == 201, response.text
    instrument = response.json()
    selection = {"lasers": "Green", "objectives": "100x", "spectrometers": "1800 CCD"}
    for day, method, correction in [(8, "PL", 0.1), (9, "Raman", 0.2)]:
        db_session.add(
            InstrumentLifecycleEvent(
                instrument_id=UUID(instrument["id"]),
                event_type="calibration",
                occurred_at=datetime.fromisoformat(f"2026-09-{day:02d}T00:00:00+00:00"),
                quantity="wavelength",
                correction=correction,
                details_json={
                    "instrument_version": 1,
                    "method_profile": method,
                    "configuration": {"lasers": "Green", "spectrometers": "1800 CCD"},
                },
            )
        )
    db_session.commit()
    uploaded = client.post(
        f"/api/v1/experiments/{run.id}/files",
        headers=headers,
        data={
            "sample_id": str(sample.id),
            "method": "PL",
            "asset_role": "characterization_file",
            "file_category": "raw",
        },
        files={
            "file": (
                "pl.txt",
                b"power_percent,wavelength_nm,counts\n1,680,20\n2,680,40\n",
                "text/plain",
            )
        },
    )
    assert uploaded.status_code == 201, uploaded.text
    file_id = uploaded.json()["id"]
    fixed, _ = resolve_om_configuration(config, selection, method="PL")
    data = {
        "measurement": {
            "sample_id": str(sample.id),
            "method_profile": "PL",
            "instrument_id": instrument["id"],
            "instrument_version": 1,
            "instrument_configuration": selection,
            "measured_at": "2026-09-11T08:00:00+08:00",
            "raw_file_ids": [file_id],
            "typed_conditions": {
                **fixed,
                "acquisition_kind": "series",
                "scan_coordinates": "power_percent (%), wavelength_nm (nm)",
                "integration_time_s": 10,
                "accumulations": 3,
                "spectral_range_nm": {"min": 600, "max": 800},
            },
            "scan_file_id": file_id,
            "variable_conditions": ["power_setting"],
            "file_intensity_units": {file_id: "counts"},
            "file_response_corrections": {
                file_id: {"status": "applied", "source": "detector curve PL47"}
            },
        },
        "properties": [
            {
                "property_code": "spectral_peaks",
                "structured_value": {
                    "status": "recorded",
                    "position_unit": "eV",
                    "intensity_unit": "counts",
                    "source_file_id": file_id,
                    "source_locator": "power_percent=1",
                    "extraction_method": "Lorentzian fit",
                    "baseline_method": "linear",
                    "peaks": [{"id": 1, "position": 1.82, "fwhm": 0.04, "height": 20}],
                },
            }
        ],
    }
    for mutate in [
        lambda d: d["measurement"]["typed_conditions"].update(objective_na=0.8),
        lambda d: d["measurement"].update(instrument_configuration={}),
        lambda d: d["measurement"]["typed_conditions"].update(power_setting="1"),
        lambda d: d["measurement"].pop("scan_file_id"),
        lambda d: d["measurement"]["file_response_corrections"][file_id].pop("source"),
        lambda d: d["measurement"].update(
            file_response_corrections={str(uuid4()): {"status": "not_applied"}}
        ),
        lambda d: d["properties"][0]["structured_value"].pop("source_locator"),
        lambda d: d["properties"][0]["structured_value"].pop("baseline_method"),
        lambda d: d["properties"][0]["structured_value"]["peaks"][0].update(position=3),
        lambda d: d["properties"][0]["structured_value"].update(intensity_unit="counts/s"),
    ]:
        invalid = deepcopy(data)
        mutate(invalid)
        response = client.post("/api/v1/measurements", json=invalid, headers=headers)
        assert response.status_code == 422, response.text
    response = client.post("/api/v1/measurements", json=data, headers=headers)
    assert response.status_code == 201, response.text
    record_id = response.json()["id"]
    config["objectives"][0]["conditions"]["objective_na"] = 0.75
    changed = client.post(
        f"/api/v1/instruments/{instrument['id']}/versions", json=instrument_payload, headers=headers
    )
    assert changed.status_code == 201, changed.text
    detail = client.get(f"/api/v1/measurements/{record_id}", headers=headers).json()
    assert detail["typed_conditions"]["objective_na"] == 0.9
    assert detail["scan_file_id"] == file_id
    assert detail["file_response_corrections"] == data["measurement"]["file_response_corrections"]
    assert (
        detail["instrument_snapshot_json"]["calibration_at_measurement"]["quantities"][
            "wavelength"
        ]["correction"]
        == 0.1
    )
    exported = client.get(
        f"/api/v1/experiments/{run.id}/export",
        headers=headers,
        params={"revision_id": str(run.current_revision_id)},
    ).json()["scientific_record"]["measurements"][0]
    assert exported["file_response_corrections"] == detail["file_response_corrections"]
    assert exported["variable_conditions"] == ["power_setting"]


def test_pl_condition_and_schema_boundaries():
    schema = ScientificJSONValidator(
        export_v2_schema(output_dir=None)["json_schema_doc"]["result_models"]["measurement_bundle"]
    )
    file_id = str(uuid4())
    base = {
        "measurement": {
            "sample_id": str(uuid4()),
            "instrument_id": str(uuid4()),
            "instrument_version": 1,
            "method_profile": "PL",
            "measured_at": "2026-09-11T00:00:00Z",
            "raw_file_ids": [file_id],
            "typed_conditions": {"excitation_wavelength_nm": 532},
        }
    }
    MeasurementBundleCreate.model_validate(base)
    assert schema.is_valid(base)
    for conditions in [
        {"spectral_range_nm": {"min": 0, "max": 800}},
        {"spectral_range_nm": {"min": 800, "max": 600}},
        {"excitation_mode": "pulsed"},
        {"analyzer_mode": "fixed"},
        {"incident_polarization_state": "unpolarized", "analyzer_mode": "parallel"},
        {"incident_polarization_state": "circular"},
        {"analyzer_mode": "circular"},
        {"temperature_control": "recorded", "temperature_K": 300},
        {"acquisition_kind": "mapping", "scan_coordinates": "x,y"},
    ]:
        data = deepcopy(base)
        data["measurement"]["typed_conditions"].update(conditions)
        with pytest.raises(ValueError):
            MeasurementBundleCreate.model_validate(data)
        assert not schema.is_valid(data), conditions
    data = deepcopy(base)
    data["measurement"]["typed_conditions"].update(
        {
            "incident_polarization_state": "circular",
            "incident_helicity": "sigma_plus",
            "analyzer_mode": "circular",
            "detection_helicity": "sigma_minus",
            "helicity_reference": "relative to each beam propagation direction",
        }
    )
    MeasurementBundleCreate.model_validate(data)
    assert schema.is_valid(data)
    for status, source, valid in [
        ("applied", None, False),
        ("applied", "curve", True),
        ("not_applied", None, True),
    ]:
        data = deepcopy(base)
        data["measurement"]["file_response_corrections"] = {
            file_id: {"status": status, **({"source": source} if source else {})}
        }
        assert schema.is_valid(data) is valid
        if valid:
            MeasurementBundleCreate.model_validate(data)
        else:
            with pytest.raises(ValueError):
                MeasurementBundleCreate.model_validate(data)


def test_pl_calibration_matches_power_conditions_and_emission_band():
    from types import SimpleNamespace

    from app.services.scientific_measurement_service import ScientificMeasurementService

    instrument_id = uuid4()
    selection = {"lasers": "Green", "objectives": "100x", "spectrometers": "CCD"}
    events = []
    for quantity, scope, correction in [
        ("laser_power", {"conditions": {"excitation_wavelength_nm": 633}}, 9),
        ("laser_power", {"conditions": {"excitation_wavelength_nm": 532}}, 1),
        ("emission_response", {"spectral_range_nm": {"min": 700, "max": 800}}, 9),
        ("emission_response", {"spectral_range_nm": {"min": 600, "max": 900}}, 2),
    ]:
        events.append(
            InstrumentLifecycleEvent(
                id=uuid4(),
                instrument_id=instrument_id,
                event_type="calibration",
                occurred_at=datetime.fromisoformat("2026-09-10T00:00:00+00:00"),
                quantity=quantity,
                correction=correction,
                details_json={
                    "instrument_version": 1,
                    "method_profile": "PL",
                    "configuration": selection,
                    **scope,
                },
            )
        )
    service = ScientificMeasurementService(SimpleNamespace(scalars=lambda _: events))
    result = service._raman_calibration_snapshot(
        instrument_id,
        datetime.fromisoformat("2026-09-11T00:00:00+00:00"),
        selection,
        1,
        method="PL",
        conditions={"excitation_wavelength_nm": 532, "spectral_range_nm": {"min": 610, "max": 800}},
    )
    assert result["quantities"]["laser_power"]["correction"] == 1
    assert result["quantities"]["emission_response"]["correction"] == 2
