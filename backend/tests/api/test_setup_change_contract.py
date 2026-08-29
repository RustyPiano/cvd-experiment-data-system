from copy import deepcopy
from uuid import UUID

from fastapi.testclient import TestClient

from app.main import app
from app.models.module_payload import ExperimentModulePayload
from app.models.scientific import RunRevision
from tests.helpers.v2_payloads import (
    chemical_lot_payload,
    gas_lot_payload,
    setup_payload,
    substrate_item,
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


def _put_module(headers: dict[str, str], run_id: str, key: str, payload: dict) -> dict:
    response = client.put(
        f"/api/v1/experiments/{run_id}/modules/{key}",
        json={"payload_json": payload},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()["payload_json"]


def _set_setup(headers: dict[str, str], run_id: str, setup_id: str):
    return client.put(
        f"/api/v1/experiments/{run_id}/setup-reference",
        json={
            "setup_id": setup_id,
            "version": 1,
            "tube_usage_history": {"reset_count": 0, "use_number_since_reset": 1},
        },
        headers=headers,
    )


def _process(gas_id: str, setup_id: str) -> dict:
    channels = [
        {
            "channel_key": f"channel_{zone:08d}_0000_4000_8000_{zone:012d}",
            "channel_type": "temperature",
            "source_type": "setpoint",
            "subject_type": "temperature_zone",
            "subject_ref": f"zone_{zone}",
            "subject_instance_ref": f"setup:{setup_id}:zone:{zone}",
            "zone_index": zone,
            "unit": "°C",
            "data_kind": "interval_series",
            "series": [{"start_s": 0, "value": 750 - zone * 50}],
        }
        for zone in (1, 2)
    ]
    channels.append(
        {
            "channel_key": "channel_99999999_9999_4999_8999_999999999999",
            "channel_type": "flow",
            "source_type": "setpoint",
            "subject_type": "gas_species",
            "subject_ref": "Ar",
            "subject_instance_ref": f"setup:{setup_id}:gas:Ar:1",
            "gas_species_code": "Ar",
            "gas_lot_id": gas_id,
            "gas_lot_version": 1,
            "measurement_source": "mfc",
            "unit": "sccm",
            "data_kind": "interval_series",
            "series": [{"start_s": 0, "end_s": 600, "value": 100}],
        }
    )
    return {
        "segments": [],
        "channels": channels,
        "pressure_regime": "atmospheric",
        "cooling_method": "furnace_cooling",
    }


def _seed_two_zone_run(active_user, admin_user, run_code: str) -> dict:
    headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    run = _post(
        "/api/v1/experiments",
        {
            "run_code": run_code,
            "started_at": "2026-08-13T09:00:00+08:00",
            "synthesis_method": "CVD",
            "precheck_confirmed": True,
        },
        headers,
    )
    setup = _post(
        "/api/v1/setups",
        setup_payload(setup_code=f"{run_code}-A2", zone_count=2),
        admin_headers,
    )
    substrate_lot = _post(
        "/api/v1/material-lots",
        substrate_lot_payload(batch_number=f"{run_code}-SUB"),
        admin_headers,
    )
    source_lot = _post(
        "/api/v1/material-lots",
        chemical_lot_payload(batch_number=f"{run_code}-SRC"),
        admin_headers,
    )
    gas_lot = _post(
        "/api/v1/material-lots",
        gas_lot_payload(batch_number=f"{run_code}-AR"),
        admin_headers,
    )
    assert _set_setup(headers, run["id"], setup["id"]).status_code == 200
    _put_module(
        headers,
        run["id"],
        "substrates",
        {
            "items": [
                substrate_item(
                    substrate_lot,
                    zone_thermocouple_distance_mm={"zone_index": 2, "distance_mm": 0},
                )
            ]
        },
    )
    _put_module(
        headers,
        run["id"],
        "precursors",
        {
            "items": [
                {
                    "load_key": "metal_source",
                    "loading_method": "boat",
                    "heating_zone_ref": "zone_2",
                    "initial_position": {
                        "axial_mm": 0,
                        "reference": "zone_thermocouple",
                    },
                    "ingredients": [
                        {
                            "material_lot_id": source_lot["id"],
                            "material_lot_version": 1,
                            "amount": 10,
                            "unit": "mg",
                        }
                    ],
                }
            ]
        },
    )
    process = _put_module(headers, run["id"], "process_steps", _process(gas_lot["id"], setup["id"]))
    return {
        "headers": headers,
        "admin_headers": admin_headers,
        "run": run,
        "setup": setup,
        "process": process,
    }


def test_setup_change_rejects_saved_out_of_range_zone_data(active_user, admin_user) -> None:
    seeded = _seed_two_zone_run(active_user, admin_user, "CVD-2026-1201")
    one_zone = _post(
        "/api/v1/setups",
        setup_payload(setup_code="SETUP-B1", zone_count=1),
        seeded["admin_headers"],
    )

    changed = _set_setup(seeded["headers"], seeded["run"]["id"], one_zone["id"])

    assert changed.status_code == 422
    assert changed.json()["detail"] == (
        "当前衬底（温区 2）、前驱体（温区 2）、生长条件（温区 2）"
        "超出新装置的 1 个温区；请先调整这些记录，再更换实验装置。"
    )
    run = client.get(f"/api/v1/experiments/{seeded['run']['id']}", headers=seeded["headers"]).json()
    assert run["setup_ref"] == seeded["setup"]["id"]

    for module_key in ("substrates", "precursors", "process_steps"):
        response = client.get(
            f"/api/v1/experiments/{seeded['run']['id']}/modules/{module_key}",
            headers=seeded["headers"],
        )
        payload = response.json()["payload_json"]
        if module_key == "substrates":
            payload["items"][0]["zone_thermocouple_distance_mm"]["zone_index"] = 1
        elif module_key == "precursors":
            payload["items"][0]["heating_zone_ref"] = "zone_1"
        else:
            payload["channels"] = [
                channel for channel in payload["channels"] if channel.get("zone_index") in (None, 1)
            ]
        _put_module(seeded["headers"], seeded["run"]["id"], module_key, payload)

    changed = _set_setup(seeded["headers"], seeded["run"]["id"], one_zone["id"])
    assert changed.status_code == 200, changed.text


def test_same_zone_setup_change_normalizes_saved_and_locked_channel_instances(
    active_user,
    admin_user,
    db_session,
) -> None:
    seeded = _seed_two_zone_run(active_user, admin_user, "CVD-2026-1202")
    replacement = _post(
        "/api/v1/setups",
        setup_payload(setup_code="SETUP-B2", zone_count=2),
        seeded["admin_headers"],
    )
    changed = _set_setup(seeded["headers"], seeded["run"]["id"], replacement["id"])
    assert changed.status_code == 200, changed.text

    saved = _put_module(
        seeded["headers"],
        seeded["run"]["id"],
        "process_steps",
        seeded["process"],
    )
    assert all(
        channel["subject_instance_ref"].startswith(f"setup:{replacement['id']}:")
        for channel in saved["channels"]
    )
    _put_module(
        seeded["headers"],
        seeded["run"]["id"],
        "target_product",
        {
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
        },
    )
    draft_process = (
        db_session.query(ExperimentModulePayload)
        .filter_by(
            experiment_run_id=UUID(seeded["run"]["id"]),
            module_key="process_steps",
        )
        .one()
    )
    stale_payload = deepcopy(draft_process.payload_json)
    for channel in stale_payload["channels"]:
        channel["subject_instance_ref"] = channel["subject_instance_ref"].replace(
            replacement["id"],
            seeded["setup"]["id"],
        )
    draft_process.payload_json = stale_payload
    db_session.commit()

    locked = client.post(
        f"/api/v1/experiments/{seeded['run']['id']}/lock",
        headers=seeded["headers"],
    )
    assert locked.status_code == 200, locked.text
    revision = (
        db_session.query(RunRevision).filter_by(experiment_run_id=UUID(seeded["run"]["id"])).one()
    )
    assert all(
        channel["subject_instance_ref"].startswith(f"setup:{replacement['id']}:")
        for channel in revision.content_json["modules"]["process_steps"]["channels"]
    )
