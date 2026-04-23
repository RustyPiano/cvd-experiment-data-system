from fastapi.testclient import TestClient

from app.main import app

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
        json={"payload_json": {"items": [{"role": "A", "type": "MoO3"}]}},
        headers=auth_headers(email),
    )
    assert precursors_response.status_code == 200

    furnace_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/furnace_program",
        json={
            "payload_json": {
                "zones": [
                    {
                        "zone_index": 1,
                        "precursor_placed": True,
                        "temperature_program": [
                            {"time_min": 0, "temperature_C": 25},
                            {"time_min": 30, "temperature_C": 750},
                        ],
                        "note": "",
                    }
                ]
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
                        "components": [{"name": "Ar", "fraction": 1}],
                        "flow_sccm": 80,
                    }
                ],
            }
        },
        headers=auth_headers(email),
    )
    assert gas_response.status_code == 200


def test_experiment_audit_log_tracks_key_actions(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Audit flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    populate_required_modules(experiment_id, active_user.email)

    patch_response = client.patch(
        f"/api/v1/experiments/{experiment_id}",
        json={"objective": "Changed objective"},
        headers=auth_headers(active_user.email),
    )
    assert patch_response.status_code == 200

    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )
    assert submit_response.status_code == 200

    return_response = client.post(
        f"/api/v1/experiments/{experiment_id}/return-to-draft",
        headers=auth_headers(active_user.email),
    )
    assert return_response.status_code == 200

    audit_response = client.get(
        f"/api/v1/experiments/{experiment_id}/audit-events",
        headers=auth_headers(active_user.email),
    )

    assert audit_response.status_code == 200
    actions = [item["action"] for item in audit_response.json()["items"]]
    assert actions == [
        "create",
        "update_module",
        "update_module",
        "update_module",
        "update",
        "submit",
        "return_to_draft",
    ]


def test_clone_experiment_creates_new_draft_and_audit_record(active_user, admin_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "WS2",
            "experiment_date": "2026-04-20",
            "objective": "Source objective",
        },
        headers=auth_headers(admin_user.email),
    )
    source_id = create_response.json()["id"]

    update_response = client.patch(
        f"/api/v1/experiments/{source_id}",
        json={"summary_result": "Do not copy"},
        headers=auth_headers(admin_user.email),
    )
    assert update_response.status_code == 200
    populate_required_modules(source_id, admin_user.email)

    submit_response = client.post(
        f"/api/v1/experiments/{source_id}/submit",
        headers=auth_headers(admin_user.email),
    )
    assert submit_response.status_code == 200
    lock_response = client.post(
        f"/api/v1/experiments/{source_id}/lock",
        headers=auth_headers(admin_user.email),
    )
    assert lock_response.status_code == 200

    clone_response = client.post(
        f"/api/v1/experiments/{source_id}/clone",
        headers=auth_headers(active_user.email),
    )

    assert clone_response.status_code == 201
    body = clone_response.json()
    assert body["status"] == "draft"
    assert body["owner_id"] == str(active_user.id)
    assert body["derived_from_run_id"] == source_id
    assert body["summary_result"] is None
    assert body["material_system"] == "WS2"
    assert body["objective"] == "Source objective"
    assert body["experiment_date"] != "2026-04-20"

    audit_response = client.get(
        f"/api/v1/experiments/{body['id']}/audit-events",
        headers=auth_headers(active_user.email),
    )
    assert audit_response.status_code == 200
    actions = [item["action"] for item in audit_response.json()["items"]]
    assert actions == ["create", "clone"]


def test_clone_experiment_copies_module_payloads(active_user, admin_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "WS2",
            "experiment_date": "2026-04-20",
            "objective": "Source objective",
        },
        headers=auth_headers(admin_user.email),
    )
    source_id = create_response.json()["id"]

    module_response = client.put(
        f"/api/v1/experiments/{source_id}/modules/gas_program",
        json={
            "payload_json": {
                "pre_washing_gas": "Ar+H2",
                "segments": [
                    {
                        "stage": "growth",
                        "start_min": 0,
                        "end_min": 45,
                        "gas": "Ar",
                        "components": [{"name": "Ar", "fraction": 1}],
                        "flow_sccm": 80,
                    }
                ],
            }
        },
        headers=auth_headers(admin_user.email),
    )
    assert module_response.status_code == 200
    populate_required_modules(source_id, admin_user.email)

    precursors_response = client.put(
        f"/api/v1/experiments/{source_id}/modules/precursors",
        json={"payload_json": {"items": [{"role": "A", "type": "WO3"}]}},
        headers=auth_headers(admin_user.email),
    )
    assert precursors_response.status_code == 200

    submit_response = client.post(
        f"/api/v1/experiments/{source_id}/submit",
        headers=auth_headers(admin_user.email),
    )
    assert submit_response.status_code == 200
    lock_response = client.post(
        f"/api/v1/experiments/{source_id}/lock",
        headers=auth_headers(admin_user.email),
    )
    assert lock_response.status_code == 200

    clone_response = client.post(
        f"/api/v1/experiments/{source_id}/clone",
        headers=auth_headers(active_user.email),
    )

    assert clone_response.status_code == 201
    clone_id = clone_response.json()["id"]

    clone_module_response = client.get(
        f"/api/v1/experiments/{clone_id}/modules/gas_program",
        headers=auth_headers(active_user.email),
    )

    assert clone_module_response.status_code == 200
    assert clone_module_response.json()["payload_json"]["segments"][0]["flow_sccm"] == 80


def test_clone_experiment_resets_basic_info_and_environment_notes(active_user, admin_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "WS2",
            "experiment_date": "2026-04-20",
            "objective": "Source objective",
        },
        headers=auth_headers(admin_user.email),
    )
    source_id = create_response.json()["id"]

    basic_info_response = client.put(
        f"/api/v1/experiments/{source_id}/modules/basic_info",
        json={
            "payload_json": {
                "operator_id": str(admin_user.id),
                "experiment_date": "2026-04-20",
                "material_system": "WS2",
                "experiment_type": "cvd_2zone",
                "objective": "Source objective",
            }
        },
        headers=auth_headers(admin_user.email),
    )
    assert basic_info_response.status_code == 200
    environment_response = client.put(
        f"/api/v1/experiments/{source_id}/modules/environment",
        json={
            "payload_json": {
                "indoor_temperature_C": 25,
                "sample_env": "clean",
                "abnormal_note": "tube had residue",
            }
        },
        headers=auth_headers(admin_user.email),
    )
    assert environment_response.status_code == 200
    populate_required_modules(source_id, admin_user.email)

    submit_response = client.post(
        f"/api/v1/experiments/{source_id}/submit",
        headers=auth_headers(admin_user.email),
    )
    assert submit_response.status_code == 200
    lock_response = client.post(
        f"/api/v1/experiments/{source_id}/lock",
        headers=auth_headers(admin_user.email),
    )
    assert lock_response.status_code == 200

    clone_response = client.post(
        f"/api/v1/experiments/{source_id}/clone",
        headers=auth_headers(active_user.email),
    )
    assert clone_response.status_code == 201
    clone_id = clone_response.json()["id"]

    clone_basic_info_response = client.get(
        f"/api/v1/experiments/{clone_id}/modules/basic_info",
        headers=auth_headers(active_user.email),
    )
    clone_environment_response = client.get(
        f"/api/v1/experiments/{clone_id}/modules/environment",
        headers=auth_headers(active_user.email),
    )

    assert clone_basic_info_response.status_code == 404
    assert clone_environment_response.status_code == 200
    assert clone_environment_response.json()["payload_json"]["abnormal_note"] == ""


def test_experiment_audit_tracks_file_upload_and_delete(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "File audit flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    upload_response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"method": "OM"},
        files={"file": ("audit.txt", b"audit", "text/plain")},
    )
    assert upload_response.status_code == 201
    file_id = upload_response.json()["id"]

    delete_response = client.delete(
        f"/api/v1/files/{file_id}",
        headers=auth_headers(active_user.email),
    )
    assert delete_response.status_code == 204

    audit_response = client.get(
        f"/api/v1/experiments/{experiment_id}/audit-events",
        headers=auth_headers(active_user.email),
    )

    assert audit_response.status_code == 200
    actions = [item["action"] for item in audit_response.json()["items"]]
    assert actions == ["create", "upload_file", "delete_file"]
