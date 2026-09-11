from copy import deepcopy
from io import BytesIO

import pytest
from PIL import Image

from app.services.om_configuration import validate_om_catalog
from tests.api.test_scientific_integrity import _headers, _locked_sample, client


def catalog():
    return {
        "objectives": [
            {
                "name": "50x",
                "conditions": {
                    "objective_magnification": 50,
                    "objective_na": 0.8,
                    "objective_immersion": "air",
                },
            }
        ],
        "cameras": [
            {
                "name": "Camera A",
                "conditions": {"image_color_mode": "color", "binning": "1x1"},
                "adjustable": ["white_balance_mode", "white_balance_settings"],
            }
        ],
        "optics": [
            {
                "name": "Reflected BF",
                "conditions": {
                    "optical_path": "reflection",
                    "contrast_method": "bright_field",
                    "illumination_source": "LED",
                },
            }
        ],
        "scales": [
            {
                "name": "50x A 1x adapter full frame",
                "conditions": {
                    "image_scale_um_per_px": 0.1,
                    "image_scale_y_um_per_px": 0.1,
                    "binning": "1x1",
                    "scale_calibration": "stage micrometer, 2026-09-01",
                },
                "references": {
                    "objectives": "50x",
                    "cameras": "Camera A",
                    "optics": "Reflected BF",
                },
            }
        ],
    }


@pytest.mark.parametrize(
    "damage", ["missing_na", "dry_na", "bad_scale", "duplicate", "sample_note"]
)
def test_catalog_rejects_incomplete_or_inconsistent_configurations(damage):
    config = catalog()
    if damage == "missing_na":
        del config["objectives"][0]["conditions"]["objective_na"]
    elif damage == "dry_na":
        config["objectives"][0]["conditions"]["objective_na"] = 1.2
    elif damage == "bad_scale":
        config["scales"][0]["references"]["cameras"] = "Camera B"
    elif damage == "duplicate":
        config["objectives"].append(deepcopy(config["objectives"][0]))
    else:
        config["cameras"][0]["conditions"]["sample_preparation"] = "rinse"
    with pytest.raises(ValueError):
        validate_om_catalog(config)


def test_om_save_preserves_selected_hardware_and_per_file_dimensions(admin_user, db_session):
    run, sample = _locked_sample(db_session, admin_user, "om45")
    headers = _headers(admin_user.email)
    config = catalog()
    instrument_payload = {
        "instrument_code": "OM-45",
        "name_type": "optical_microscopy",
        "capabilities": [{"code": "optical_microscopy", "configuration": {"om": config}}],
    }
    response = client.post("/api/v1/instruments", json=instrument_payload, headers=headers)
    assert response.status_code == 201, response.text
    instrument = response.json()
    buffer = BytesIO()
    Image.new("RGB", (40, 30), "white").save(buffer, format="PNG")
    upload = client.post(
        f"/api/v1/experiments/{run.id}/files",
        headers=headers,
        data={
            "sample_id": str(sample.id),
            "method": "optical_microscopy",
            "asset_role": "characterization_file",
            "file_category": "raw",
        },
        files={"file": ("image.png", buffer.getvalue(), "image/png")},
    )
    assert upload.status_code == 201, upload.text
    assert upload.json()["metadata_json"]["image"]["width"] == 40
    selection = {
        "objectives": "50x",
        "cameras": "Camera A",
        "optics": "Reflected BF",
        "scales": "50x A 1x adapter full frame",
    }
    conditions = {
        "observation_mode": "digital",
        "objective": "50x",
        "detector": "Camera A",
        "exposure_time_ms": 12.5,
    }
    for entries in config.values():
        conditions.update(entries[0]["conditions"])
    payload = {
        "measurement": {
            "sample_id": str(sample.id),
            "instrument_id": instrument["id"],
            "instrument_version": 1,
            "method_profile": "optical_microscopy",
            "measured_at": "2026-09-10T10:00:00+08:00",
            "typed_conditions": conditions,
            "instrument_configuration": selection,
            "raw_file_ids": [upload.json()["id"]],
        }
    }
    wrong = deepcopy(payload)
    wrong["measurement"]["typed_conditions"]["objective_na"] = 0.5
    assert client.post("/api/v1/measurements", json=wrong, headers=headers).status_code == 422
    missing = deepcopy(payload)
    missing["measurement"]["instrument_configuration"] = {}
    assert client.post("/api/v1/measurements", json=missing, headers=headers).status_code == 422
    response = client.post("/api/v1/measurements", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    detail = client.get(f"/api/v1/measurements/{response.json()['id']}", headers=headers).json()
    assert detail["instrument_configuration"] == selection
    assert detail["raw_files"][0]["image_metadata"]["height"] == 30
    instrument_payload["capabilities"][0]["configuration"]["om"]["objectives"][0]["conditions"][
        "objective_na"
    ] = 0.75
    assert (
        client.post(
            f"/api/v1/instruments/{instrument['id']}/versions",
            json=instrument_payload,
            headers=headers,
        ).status_code
        == 201
    )
    detail = client.get(f"/api/v1/measurements/{response.json()['id']}", headers=headers).json()
    assert detail["typed_conditions"]["objective_na"] == 0.8
    export_response = client.get(
        f"/api/v1/experiments/{run.id}/export",
        headers=headers,
        params={"revision_id": str(run.current_revision_id)},
    )
    assert export_response.status_code == 200, export_response.text
    exported = export_response.json()
    saved = exported["scientific_record"]["measurements"][0]
    assert saved["instrument_configuration"] == selection
