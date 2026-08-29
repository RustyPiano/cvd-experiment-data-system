from copy import deepcopy
from datetime import UTC, date, datetime
from uuid import UUID

from fastapi.testclient import TestClient

from app.main import app
from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.module_payload import ExperimentModulePayload
from app.models.scientific import RunRevision
from app.services.v2_field_source import SCHEMA_VERSION
from tests.helpers.v2_payloads import (
    chemical_lot_payload,
    gas_lot_payload,
    setup_payload,
    substrate_lot_payload,
)

client = TestClient(app)


def _headers(email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _post(path: str, payload: dict, headers: dict[str, str]) -> dict:
    response = client.post(path, json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _create_run(headers: dict[str, str], run_code: str) -> dict:
    return _post(
        "/api/v1/experiments",
        {
            "run_code": run_code,
            "started_at": "2026-08-13T09:00:00+08:00",
            "synthesis_method": "CVD",
            "precheck_confirmed": True,
        },
        headers,
    )


def _put_precursors(headers: dict[str, str], run_id: str, payload: dict):
    return client.put(
        f"/api/v1/experiments/{run_id}/modules/precursors",
        json={"payload_json": payload},
        headers=headers,
    )


def _boat_load(lot_id: str) -> dict:
    return {
        "items": [
            {
                "load_key": "metal_source",
                "loading_method": "boat",
                "heating_zone_ref": "zone_1",
                "initial_position": {
                    "axial_mm": 0,
                    "reference": "zone_thermocouple",
                },
                "ingredients": [
                    {
                        "material_lot_id": lot_id,
                        "material_lot_version": 1,
                        "amount": 10,
                        "unit": "mg",
                    }
                ],
            }
        ]
    }


def test_alpha15_correction_preserves_read_only_function_role(
    active_user,
    admin_user,
    db_session,
) -> None:
    headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    chemical = _post(
        "/api/v1/material-lots",
        chemical_lot_payload(batch_number="LEGACY-SOURCE"),
        admin_headers,
    )
    legacy_precursors = {
        "items": [
            {
                "load_key": "legacy_source",
                "loading_method": "boat",
                "ingredients": [
                    {
                        "material_lot_id": chemical["id"],
                        "material_lot_version": 1,
                        "function_role": "metal_source",
                    }
                ],
            }
        ]
    }
    run = ExperimentRun(
        run_code="CVD-2026-1301",
        owner_id=active_user.id,
        schema_version=SCHEMA_VERSION,
        material_system="MoS2",
        experiment_date=date(2026, 8, 13),
        status=ExperimentStatus.LOCKED,
        locked_at=datetime.now(UTC),
    )
    db_session.add(run)
    db_session.flush()
    revision = RunRevision(
        experiment_run_id=run.id,
        revision_number=1,
        schema_version="v4.0-alpha.15",
        schema_status="internal_validation",
        content_json={
            "run": {"id": str(run.id)},
            "modules": {"precursors": legacy_precursors},
        },
        content_sha256="a" * 64,
        locked_by_id=active_user.id,
    )
    db_session.add(revision)
    db_session.flush()
    run.current_revision_id = revision.id
    db_session.add(
        ExperimentModulePayload(
            experiment_run_id=run.id,
            module_key="precursors",
            schema_version=SCHEMA_VERSION,
            payload_json=legacy_precursors,
        )
    )
    db_session.commit()

    historical = client.get(
        f"/api/v1/experiments/{run.id}/modules/precursors",
        headers=headers,
    )
    assert historical.status_code == 200, historical.text
    assert historical.json()["payload_json"]["items"][0]["ingredients"][0] == {
        "material_lot_id": chemical["id"],
        "material_lot_version": 1,
        "function_role": "metal_source",
    }
    correction = client.post(
        f"/api/v1/experiments/{run.id}/correction-drafts",
        json={"reason": "correct an unrelated note"},
        headers=headers,
    )
    assert correction.status_code == 200, correction.text

    edited = deepcopy(historical.json()["payload_json"])
    edited["items"][0]["ingredients"][0].pop("function_role")
    saved = _put_precursors(headers, str(run.id), edited)
    assert saved.status_code == 200, saved.text
    assert saved.json()["payload_json"]["items"][0]["ingredients"][0]["function_role"] == (
        "metal_source"
    )
    assert "amount" not in saved.json()["payload_json"]["items"][0]["ingredients"][0]

    changed = deepcopy(saved.json()["payload_json"])
    changed["items"][0]["ingredients"][0]["function_role"] = "chalcogen_source"
    rejected = _put_precursors(headers, str(run.id), changed)
    assert rejected.status_code == 422
    assert rejected.json()["detail"]["invalid"][0] == {
        "key": "function_role",
        "reason": "legacy_read_only",
    }

    current = _create_run(headers, "CVD-2026-1302")
    bypass = deepcopy(legacy_precursors)
    bypass["items"][0]["load_key"] = "new_source"
    rejected = _put_precursors(headers, current["id"], bypass)
    assert rejected.status_code == 422
    assert rejected.json()["detail"]["invalid"][0]["reason"] == "legacy_read_only"


def test_source_load_lot_category_is_checked_on_save_and_lock(
    active_user,
    admin_user,
    db_session,
) -> None:
    headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    chemical = _post(
        "/api/v1/material-lots",
        chemical_lot_payload(batch_number="CATEGORY-CHEMICAL"),
        admin_headers,
    )
    gas = _post(
        "/api/v1/material-lots",
        gas_lot_payload(batch_number="CATEGORY-GAS"),
        admin_headers,
    )
    run = _create_run(headers, "CVD-2026-1303")

    gas_line = {
        "items": [
            {
                "load_key": "gas_source",
                "loading_method": "gas_line",
                "ingredients": [
                    {
                        "material_lot_id": chemical["id"],
                        "material_lot_version": 1,
                    }
                ],
            }
        ]
    }
    rejected = _put_precursors(headers, run["id"], gas_line)
    assert rejected.status_code == 422
    assert rejected.json()["detail"]["invalid"][0] == {
        "key": "material_lot_id",
        "reason": "category",
        "expected_category": "gas_cylinder",
    }

    gas_line["items"][0]["ingredients"][0]["material_lot_id"] = gas["id"]
    assert _put_precursors(headers, run["id"], gas_line).status_code == 200

    boat = _boat_load(gas["id"])
    rejected = _put_precursors(headers, run["id"], boat)
    assert rejected.status_code == 422
    assert rejected.json()["detail"]["invalid"][0]["expected_category"] == "chemical"

    boat = _boat_load(chemical["id"])
    assert _put_precursors(headers, run["id"], boat).status_code == 200

    setup = _post(
        "/api/v1/setups",
        setup_payload(setup_code="SETUP-CATEGORY", zone_count=1),
        admin_headers,
    )
    substrate = _post(
        "/api/v1/material-lots",
        substrate_lot_payload(batch_number="CATEGORY-SUBSTRATE"),
        admin_headers,
    )
    setup_response = client.put(
        f"/api/v1/experiments/{run['id']}/setup-reference",
        json={
            "setup_id": setup["id"],
            "version": 1,
            "tube_usage_history": {"reset_count": 0, "use_number_since_reset": 1},
        },
        headers=headers,
    )
    assert setup_response.status_code == 200, setup_response.text
    target = client.put(
        f"/api/v1/experiments/{run['id']}/modules/target_product",
        json={
            "payload_json": {
                "architecture_type": "single_region",
                "material_regions": [
                    {
                        "region_key": "film",
                        "formula": "MoS2",
                        "spatial_role": "single_region",
                        "target_bulk_phase": "2H",
                        "target_bulk_space_group_number": 194,
                    }
                ],
                "composition_relations": [],
            }
        },
        headers=headers,
    )
    assert target.status_code == 200, target.text
    substrates = client.put(
        f"/api/v1/experiments/{run['id']}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "piece_label": "S1",
                        "lot_ref": {"entity_id": substrate["id"], "version": 1},
                        "size_placement": {
                            "length_mm": 10,
                            "width_mm": 10,
                            "placement": "face_up",
                        },
                        "zone_thermocouple_distance_mm": {
                            "zone_index": 1,
                            "distance_mm": 0,
                        },
                    }
                ]
            }
        },
        headers=headers,
    )
    assert substrates.status_code == 200, substrates.text
    process = client.put(
        f"/api/v1/experiments/{run['id']}/modules/process_steps",
        json={
            "payload_json": {
                "segments": [],
                "channels": [
                    {
                        "channel_key": "channel_11111111_1111_4111_8111_111111111111",
                        "channel_type": "temperature",
                        "source_type": "setpoint",
                        "subject_type": "temperature_zone",
                        "subject_ref": "zone_1",
                        "subject_instance_ref": f"setup:{setup['id']}:zone:1",
                        "zone_index": 1,
                        "unit": "°C",
                        "data_kind": "interval_series",
                        "series": [{"start_s": 0, "value": 750}],
                    },
                    {
                        "channel_key": "channel_22222222_2222_4222_8222_222222222222",
                        "channel_type": "flow",
                        "source_type": "setpoint",
                        "subject_type": "gas_species",
                        "subject_ref": "Ar",
                        "subject_instance_ref": f"setup:{setup['id']}:gas:Ar:1",
                        "gas_species_code": "Ar",
                        "gas_lot_id": gas["id"],
                        "gas_lot_version": 1,
                        "measurement_source": "mfc",
                        "unit": "sccm",
                        "data_kind": "interval_series",
                        "series": [{"start_s": 0, "end_s": 600, "value": 100}],
                    },
                ],
                "pressure_regime": "atmospheric",
                "cooling_method": "furnace_cooling",
            }
        },
        headers=headers,
    )
    assert process.status_code == 200, process.text

    stored = (
        db_session.query(ExperimentModulePayload)
        .filter_by(experiment_run_id=UUID(run["id"]), module_key="precursors")
        .one()
    )
    invalid_payload = deepcopy(stored.payload_json)
    invalid_payload["items"][0]["loading_method"] = "gas_line"
    stored.payload_json = invalid_payload
    db_session.commit()

    locked = client.post(f"/api/v1/experiments/{run['id']}/lock", headers=headers)
    assert locked.status_code == 422
    assert locked.json()["detail"]["invalid"][0]["expected_category"] == "gas_cylinder"
