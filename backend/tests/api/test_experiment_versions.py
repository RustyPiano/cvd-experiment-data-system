from fastapi.testclient import TestClient

from app.main import app
from tests.helpers.setup_methods import create_confirmed_setup_methods

client = TestClient(app)


def login(email: str, password: str = "Password123!") -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_headers(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {login(email)}"}


def populate_required_modules(experiment_id: str, email: str) -> None:
    precursors_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        json={"payload_json": {"items": [{"species": "MoO3", "method": "powder"}]}},
        headers=auth_headers(email),
    )
    assert precursors_response.status_code == 200

    furnace_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/furnace_program",
        json={
            "payload_json": {
                "furnace_info": {"zones_count": 1, "initial_temperatures_C": {"zone_1": 25}},
                "placements": [],
                "zones": [
                    {
                        "zone_key": "zone_1",
                        "temperature_program": [
                            {"node_index": 1, "time_min": 0, "temperature_C": 25, "note": ""},
                            {"node_index": 2, "time_min": 30, "temperature_C": 750, "note": ""},
                        ],
                        "note": "",
                    },
                ],
            }
        },
        headers=auth_headers(email),
    )
    assert furnace_response.status_code == 200

    gas_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/gas_program",
        json={
            "payload_json": {
                "pre_washing_gas": "Ar+H2",
                "segments": [
                    {
                        "stage": "growth",
                        "start_min": 0,
                        "end_min": 45,
                        "gas": "Ar",
                        "components": [{"name": "Ar", "fraction": 1, "flow_sccm": 80}],
                        "flow_sccm": 80,
                    }
                ],
            }
        },
        headers=auth_headers(email),
    )
    assert gas_response.status_code == 200
    create_confirmed_setup_methods(
        client,
        experiment_id=experiment_id,
        headers=auth_headers(email),
    )


def create_submitted_experiment(email: str, objective: str = "Version test") -> str:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-06-08",
            "objective": objective,
        },
        headers=auth_headers(email),
    )
    experiment_id = create_response.json()["id"]
    populate_required_modules(experiment_id, email)
    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(email),
    )
    assert submit_response.status_code == 200
    return experiment_id


def test_submit_creates_first_version(active_user) -> None:
    experiment_id = create_submitted_experiment(active_user.email)

    versions_response = client.get(
        f"/api/v1/experiments/{experiment_id}/versions",
        headers=auth_headers(active_user.email),
    )
    assert versions_response.status_code == 200
    body = versions_response.json()
    assert body["total"] == 1
    assert body["items"][0]["version_number"] == 1
    assert body["items"][0]["created_by_name"] == active_user.name


def test_edit_then_save_version_creates_second_version(active_user) -> None:
    experiment_id = create_submitted_experiment(active_user.email)

    # Edit the submitted record in place.
    patch_response = client.patch(
        f"/api/v1/experiments/{experiment_id}",
        json={"objective": "Edited after submit"},
        headers=auth_headers(active_user.email),
    )
    assert patch_response.status_code == 200

    save_response = client.post(
        f"/api/v1/experiments/{experiment_id}/versions",
        json={"change_note": "objective 调整"},
        headers=auth_headers(active_user.email),
    )
    assert save_response.status_code == 201

    versions_response = client.get(
        f"/api/v1/experiments/{experiment_id}/versions",
        headers=auth_headers(active_user.email),
    )
    body = versions_response.json()
    assert body["total"] == 2
    # Newest first.
    assert body["items"][0]["version_number"] == 2
    assert body["items"][0]["change_note"] == "objective 调整"

    v1_response = client.get(
        f"/api/v1/experiments/{experiment_id}/versions/1",
        headers=auth_headers(active_user.email),
    )
    assert v1_response.status_code == 200
    assert v1_response.json()["snapshot_json"]["experiment"]["objective"] == "Version test"
    v2_response = client.get(
        f"/api/v1/experiments/{experiment_id}/versions/2",
        headers=auth_headers(active_user.email),
    )
    assert v2_response.json()["snapshot_json"]["experiment"]["objective"] == "Edited after submit"


def test_restore_version_writes_snapshot_back(active_user) -> None:
    experiment_id = create_submitted_experiment(active_user.email)

    client.patch(
        f"/api/v1/experiments/{experiment_id}",
        json={"objective": "New direction"},
        headers=auth_headers(active_user.email),
    )

    restore_response = client.post(
        f"/api/v1/experiments/{experiment_id}/versions/1/restore",
        headers=auth_headers(active_user.email),
    )
    assert restore_response.status_code == 200
    assert restore_response.json()["objective"] == "Version test"

    detail_response = client.get(
        f"/api/v1/experiments/{experiment_id}",
        headers=auth_headers(active_user.email),
    )
    assert detail_response.json()["objective"] == "Version test"

    # Restore does not itself create a version.
    versions_response = client.get(
        f"/api/v1/experiments/{experiment_id}/versions",
        headers=auth_headers(active_user.email),
    )
    assert versions_response.json()["total"] == 1


def test_save_version_requires_submitted_status(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-06-08",
            "objective": "Draft only",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    save_response = client.post(
        f"/api/v1/experiments/{experiment_id}/versions",
        json={"change_note": None},
        headers=auth_headers(active_user.email),
    )
    assert save_response.status_code == 409
