from uuid import UUID

from fastapi.testclient import TestClient

from app.main import app
from app.models.experiment import ExperimentRun
from app.services.sample_service import SampleService
from tests.helpers.v2_payloads import substrate_item, substrate_lot_payload

client = TestClient(app)


def _headers(email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _create_run(headers: dict[str, str], code: str) -> dict:
    response = client.post(
        "/api/v1/experiments",
        json={
            "run_code": code,
            "started_at": "2026-07-17T09:00:00",
            "synthesis_method": "PVD-热蒸发",
            "operator": "tester",
            "ambient_temperature_C": 25.0,
            "ambient_humidity_percent": 45.0,
            "precheck_confirmed": True,
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _save_substrates(
    headers: dict[str, str],
    admin_headers: dict[str, str],
    run_id: str,
    items: list[dict],
) -> list[dict]:
    completed: list[dict] = []
    for index, item in enumerate(items, start=1):
        if item.get("lot_ref"):
            completed.append(item)
            continue
        raw_material = item.get("material")
        is_sio2 = raw_material in {"SiO2/Si", "SiO₂/Si", "sio2_si"}
        material = "sio2_si" if is_sio2 else "sapphire_al2o3"
        formula = "SiO2" if is_sio2 else "Al2O3"
        lot_material = "sio2_si" if is_sio2 else "sapphire_al2o3"
        lot = client.post(
            "/api/v1/material-lots",
            json=substrate_lot_payload(
                batch_number=f"{run_id[-8:]}-{index}",
                material=lot_material,
                chemical_formula=formula,
            ),
            headers=admin_headers,
        )
        assert lot.status_code == 201, lot.text
        overrides = {key: value for key, value in item.items() if key != "material"}
        completed.append(
            substrate_item(
                lot.json(),
                material=material,
                chemical_formula=formula,
                **overrides,
            )
        )
    response = client.put(
        f"/api/v1/experiments/{run_id}/modules/substrates",
        json={"payload_json": {"items": completed}},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()["payload_json"]["items"]


def _samples(headers: dict[str, str], run_id: str) -> list[dict]:
    response = client.get(f"/api/v1/samples?experiment_id={run_id}", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["items"]


def test_growth_sample_snapshot_reprojects_frozen_lot_facts() -> None:
    snapshot = SampleService._source_substrate_snapshot(
        {
            "source_id": "00000000-0000-0000-0000-000000000001",
            "material": "sapphire_al2o3",
            "chemical_formula": "Al2O3",
            "crystal_orientation": "stale draft value",
            "miscut_angle_deg": 1.5,
            "oxide_thickness_nm": 285,
            "surface_roughness": {"metric": "Ra", "value_nm": 99},
            "lot_ref": {
                "entity_id": "00000000-0000-0000-0000-000000000002",
                "version": 1,
                "snapshot": {
                    "chemical_formula": "Al2O3",
                    "attrs": {
                        "substrate_material": "sapphire_al2o3",
                        "substrate_orientation_polish": {
                            "value": "c-plane",
                            "option": "single_side_polished",
                        },
                        "substrate_miscut_angle_deg": 0.2,
                        "substrate_surface_roughness": {
                            "metric": "RMS",
                            "value_nm": 0.5,
                        },
                    },
                },
            },
        }
    )

    assert "source_id" not in snapshot
    assert snapshot["crystal_orientation"] == "c-plane；single_side_polished"
    assert snapshot["miscut_angle_deg"] == 0.2
    assert snapshot["surface_roughness"] == {"metric": "RMS", "value_nm": 0.5}
    assert "oxide_thickness_nm" not in snapshot


def test_lock_generates_stable_growth_samples_and_relock_is_idempotent(
    active_user, admin_user
) -> None:
    owner = _headers(active_user.email)
    admin = _headers(admin_user.email)
    run = _create_run(owner, "CVD-2026-9101")
    substrate_items = _save_substrates(
        owner,
        admin,
        run["id"],
        [{"material": "蓝宝石"}, {"material": "SiO2/Si", "oxide_thickness_nm": 285}],
    )
    assert len({item["source_id"] for item in substrate_items}) == 2

    locked = client.post(f"/api/v1/experiments/{run['id']}/lock", headers=owner)
    assert locked.status_code == 200, locked.text
    first = _samples(owner, run["id"])
    assert [sample["sample_code"] for sample in first] == [
        "CVD-2026-9101-S01",
        "CVD-2026-9101-S02",
    ]
    assert {sample["role"] for sample in first} == {"growth"}
    assert [sample["source_substrate_id"] for sample in first] == [
        item["source_id"] for item in substrate_items
    ]
    assert first[1]["source_substrate_snapshot_json"]["oxide_thickness_nm"] == 285

    assert client.post(f"/api/v1/experiments/{run['id']}/unlock", headers=admin).status_code == 200
    assert client.post(f"/api/v1/experiments/{run['id']}/lock", headers=owner).status_code == 200
    second = _samples(owner, run["id"])
    assert [(sample["id"], sample["sample_code"]) for sample in second] == [
        (sample["id"], sample["sample_code"]) for sample in first
    ]


def test_relock_rejects_removed_source_substrate_with_result(
    active_user, admin_user, db_session
) -> None:
    owner = _headers(active_user.email)
    admin = _headers(admin_user.email)
    run = _create_run(owner, "CVD-2026-9102")
    items = _save_substrates(
        owner,
        admin,
        run["id"],
        [{"material": "蓝宝石"}, {"material": "SiO2/Si"}],
    )
    assert client.post(f"/api/v1/experiments/{run['id']}/lock", headers=owner).status_code == 200
    sample = _samples(owner, run["id"])[0]
    result = client.post(
        f"/api/v1/samples/{sample['id']}/measured-products",
        json={"observed_phenomena": ["不连续覆盖"]},
        headers=owner,
    )
    assert result.status_code == 201, result.text
    assert client.post(f"/api/v1/experiments/{run['id']}/unlock", headers=admin).status_code == 200
    _save_substrates(owner, admin, run["id"], [items[1]])

    rejected = client.post(f"/api/v1/experiments/{run['id']}/lock", headers=owner)

    assert rejected.status_code == 409, rejected.text
    assert sample["sample_code"] in rejected.json()["detail"]
    db_session.expire_all()
    assert db_session.get(ExperimentRun, UUID(run["id"])).status.value == "draft"
    assert len(_samples(owner, run["id"])) == 2


def test_relock_rejects_changed_source_substrate_with_result(
    active_user, admin_user, db_session
) -> None:
    owner = _headers(active_user.email)
    admin = _headers(admin_user.email)
    run = _create_run(owner, "CVD-2026-9106")
    items = _save_substrates(owner, admin, run["id"], [{"material": "蓝宝石"}])
    assert client.post(f"/api/v1/experiments/{run['id']}/lock", headers=owner).status_code == 200
    sample = _samples(owner, run["id"])[0]
    original_snapshot = sample["source_substrate_snapshot_json"]
    result = client.post(
        f"/api/v1/samples/{sample['id']}/measured-products",
        json={"detected_phase_stacking": "2H-MoS2"},
        headers=owner,
    )
    assert result.status_code == 201, result.text
    assert client.post(f"/api/v1/experiments/{run['id']}/unlock", headers=admin).status_code == 200
    _save_substrates(
        owner,
        admin,
        run["id"],
        [
            {
                **items[0],
                "size_placement": {
                    **items[0]["size_placement"],
                    "length_mm": 12.0,
                },
            }
        ],
    )

    rejected = client.post(f"/api/v1/experiments/{run['id']}/lock", headers=owner)

    assert rejected.status_code == 409, rejected.text
    assert sample["sample_code"] in rejected.json()["detail"]
    db_session.expire_all()
    assert db_session.get(ExperimentRun, UUID(run["id"])).status.value == "draft"
    refreshed_sample = _samples(owner, run["id"])[0]
    assert refreshed_sample["source_substrate_snapshot_json"] == original_snapshot


def test_relock_soft_deletes_and_restores_source_sample_without_evidence(
    active_user, admin_user
) -> None:
    owner = _headers(active_user.email)
    admin = _headers(admin_user.email)
    run = _create_run(owner, "CVD-2026-9104")
    items = _save_substrates(
        owner,
        admin,
        run["id"],
        [{"material": "蓝宝石"}, {"material": "SiO2/Si"}],
    )
    assert client.post(f"/api/v1/experiments/{run['id']}/lock", headers=owner).status_code == 200
    original = _samples(owner, run["id"])

    assert client.post(f"/api/v1/experiments/{run['id']}/unlock", headers=admin).status_code == 200
    _save_substrates(owner, admin, run["id"], [items[1]])
    assert client.post(f"/api/v1/experiments/{run['id']}/lock", headers=owner).status_code == 200
    assert [sample["id"] for sample in _samples(owner, run["id"])] == [original[1]["id"]]

    assert client.post(f"/api/v1/experiments/{run['id']}/unlock", headers=admin).status_code == 200
    _save_substrates(owner, admin, run["id"], items)
    assert client.post(f"/api/v1/experiments/{run['id']}/lock", headers=owner).status_code == 200
    restored = _samples(owner, run["id"])
    assert [(sample["id"], sample["sample_code"]) for sample in restored] == [
        (sample["id"], sample["sample_code"]) for sample in original
    ]


def test_manual_sample_types_reject_growth_and_require_parent_for_derived(
    active_user, admin_user
) -> None:
    headers = _headers(active_user.email)
    admin = _headers(admin_user.email)
    run = _create_run(headers, "CVD-2026-9103")
    _save_substrates(headers, admin, run["id"], [{"material": "蓝宝石"}])
    assert client.post(f"/api/v1/experiments/{run['id']}/lock", headers=headers).status_code == 200
    parent = _samples(headers, run["id"])[0]

    growth = client.post(
        f"/api/v1/experiments/{run['id']}/samples",
        json={"role": "growth"},
        headers=headers,
    )
    missing_parent = client.post(
        f"/api/v1/experiments/{run['id']}/samples",
        json={"role": "derived"},
        headers=headers,
    )
    derived = client.post(
        f"/api/v1/experiments/{run['id']}/samples",
        json={"role": "derived", "parent_sample_id": parent["id"]},
        headers=headers,
    )

    assert growth.status_code == 422
    assert missing_parent.status_code == 422
    assert derived.status_code == 201, derived.text
    assert derived.json()["sample_code"] == "CVD-2026-9103-S02"
    assert derived.json()["parent_sample_id"] == parent["id"]


def test_relock_rejects_removing_a_source_sample_with_a_derived_child(
    active_user, admin_user
) -> None:
    owner = _headers(active_user.email)
    admin = _headers(admin_user.email)
    run = _create_run(owner, "CVD-2026-9105")
    items = _save_substrates(owner, admin, run["id"], [{"material": "蓝宝石"}])
    assert client.post(f"/api/v1/experiments/{run['id']}/lock", headers=owner).status_code == 200
    parent = _samples(owner, run["id"])[0]
    derived = client.post(
        f"/api/v1/experiments/{run['id']}/samples",
        json={"role": "derived", "parent_sample_id": parent["id"]},
        headers=owner,
    )
    assert derived.status_code == 201, derived.text
    assert client.post(f"/api/v1/experiments/{run['id']}/unlock", headers=admin).status_code == 200
    _save_substrates(owner, admin, run["id"], [])

    rejected = client.post(f"/api/v1/experiments/{run['id']}/lock", headers=owner)

    assert rejected.status_code == 409
    assert parent["sample_code"] in rejected.json()["detail"]
    assert items[0]["source_id"] == parent["source_substrate_id"]
