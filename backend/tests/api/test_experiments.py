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


def test_create_experiment_creates_draft_for_member(active_user) -> None:
    response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Baseline growth",
        },
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["owner_id"] == str(active_user.id)
    assert body["run_code"].startswith("CVD-2026-")


def test_viewer_cannot_create_experiment(viewer_user) -> None:
    response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Should fail",
        },
        headers=auth_headers(viewer_user.email),
    )

    assert response.status_code == 403


def test_list_experiments_shows_own_drafts_and_public_submitted(active_user, admin_user) -> None:
    own_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Own draft",
        },
        headers=auth_headers(active_user.email),
    )
    assert own_response.status_code == 201

    other_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "WS2",
            "experiment_date": "2026-04-22",
            "objective": "Other draft",
        },
        headers=auth_headers(admin_user.email),
    )
    assert other_response.status_code == 201
    other_id = other_response.json()["id"]
    populate_required_modules(other_id, admin_user.email)

    submit_response = client.post(
        f"/api/v1/experiments/{other_id}/submit",
        headers=auth_headers(admin_user.email),
    )
    assert submit_response.status_code == 200

    list_response = client.get(
        "/api/v1/experiments",
        headers=auth_headers(active_user.email),
    )

    assert list_response.status_code == 200
    run_codes = {item["run_code"] for item in list_response.json()["items"]}
    assert own_response.json()["run_code"] in run_codes
    assert other_response.json()["run_code"] in run_codes


def test_patch_experiment_updates_draft_for_owner(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Before patch",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    patch_response = client.patch(
        f"/api/v1/experiments/{experiment_id}",
        json={"objective": "After patch", "material_system": "WS2"},
        headers=auth_headers(active_user.email),
    )

    assert patch_response.status_code == 200
    assert patch_response.json()["objective"] == "After patch"
    assert patch_response.json()["material_system"] == "WS2"


def test_patch_experiment_preserves_unset_fields(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Before patch",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    patch_response = client.patch(
        f"/api/v1/experiments/{experiment_id}",
        json={"objective": "Only objective changed"},
        headers=auth_headers(active_user.email),
    )

    assert patch_response.status_code == 200
    assert patch_response.json()["objective"] == "Only objective changed"
    assert patch_response.json()["material_system"] == "MoS2"


def test_submit_then_lock_updates_status_timestamps(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Status flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    populate_required_modules(experiment_id, active_user.email)

    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )
    lock_response = client.post(
        f"/api/v1/experiments/{experiment_id}/lock",
        headers=auth_headers(active_user.email),
    )

    assert submit_response.status_code == 200
    assert submit_response.json()["status"] == "submitted"
    assert submit_response.json()["submitted_at"] is not None
    assert lock_response.status_code == 200
    assert lock_response.json()["status"] == "locked"
    assert lock_response.json()["locked_at"] is not None


def test_return_to_draft_moves_submitted_experiment_back_to_draft(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Return flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    populate_required_modules(experiment_id, active_user.email)

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
    assert return_response.json()["status"] == "draft"
    assert return_response.json()["submitted_at"] is None
    assert return_response.json()["locked_at"] is None


def test_submit_rejects_missing_required_main_fields(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": None,
            "experiment_date": "2026-04-23",
            "objective": "Validation flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Submit validation failed"


def test_put_and_get_experiment_module_payload(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Module save flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    put_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        json={
            "payload_json": {
                "items": [
                    {
                        "role": "A",
                        "type": "MoO3",
                        "brand": "Sigma",
                        "concentration": None,
                        "concentration_unit": "",
                        "method": "melting",
                        "melting_temperature_C": 90,
                        "spin_speed_rpm": None,
                        "pre_spin_speed_rpm": None,
                        "preparation_time_min": None,
                        "mass_mg": 5,
                        "batch_no": "MO-001",
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )
    get_response = client.get(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        headers=auth_headers(active_user.email),
    )
    list_response = client.get(
        f"/api/v1/experiments/{experiment_id}/modules",
        headers=auth_headers(active_user.email),
    )

    assert put_response.status_code == 200
    assert put_response.json()["module_key"] == "precursors"
    assert put_response.json()["schema_version"] == "cvd_v1"
    assert put_response.json()["payload_json"]["items"][0]["type"] == "MoO3"
    assert get_response.status_code == 200
    assert get_response.json()["payload_json"]["items"][0]["batch_no"] == "MO-001"
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1
    assert list_response.json()["items"][0]["module_key"] == "precursors"


def test_put_and_get_process_observation_module_payload(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Observation save flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    put_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/process_observation",
        json={
            "payload_json": {
                "color_change": "center area darkened",
                "abnormal_events": ["minor condensate"],
                "note": "growth stable after 15 min",
            }
        },
        headers=auth_headers(active_user.email),
    )
    get_response = client.get(
        f"/api/v1/experiments/{experiment_id}/modules/process_observation",
        headers=auth_headers(active_user.email),
    )

    assert put_response.status_code == 200
    assert get_response.status_code == 200
    assert get_response.json()["payload_json"]["color_change"] == "center area darkened"


def test_submit_rejects_missing_required_modules(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Module validation flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Submit validation failed"


def test_submit_rejects_invalid_furnace_and_gas_program(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Module validation flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    precursors_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        json={"payload_json": {"items": [{"role": "A", "type": "MoO3"}]}},
        headers=auth_headers(active_user.email),
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
                            {"time_min": 30, "temperature_C": 750},
                            {"time_min": 20, "temperature_C": 700},
                        ],
                        "note": "",
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
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
                        "end_min": 10,
                        "gas": "Ar",
                        "components": [{"name": "Ar", "fraction": 1}],
                        "flow_sccm": 80,
                    },
                    {
                        "stage": "cooldown",
                        "start_min": 5,
                        "end_min": 10,
                        "gas": "Ar+H2",
                        "components": [{"name": "Ar", "fraction": 0.95}],
                        "flow_sccm": 100,
                    },
                ],
            }
        },
        headers=auth_headers(active_user.email),
    )
    assert gas_response.status_code == 200

    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )

    assert submit_response.status_code == 422
    assert submit_response.json()["detail"] == "Submit validation failed"


def test_submit_rejects_malformed_furnace_zone_payload_without_500(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Malformed furnace payload",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    precursors_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        json={"payload_json": {"items": [{"role": "A", "type": "MoO3"}]}},
        headers=auth_headers(active_user.email),
    )
    assert precursors_response.status_code == 200

    furnace_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/furnace_program",
        json={"payload_json": {"zones": ["bad-zone"]}},
        headers=auth_headers(active_user.email),
    )
    assert furnace_response.status_code == 200

    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )

    assert submit_response.status_code == 422
    assert submit_response.json()["detail"] == "Submit validation failed"


def test_submit_rejects_malformed_precursor_payload_without_500(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Malformed precursor payload",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    precursors_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        json={"payload_json": {"items": ["bad-precursor"]}},
        headers=auth_headers(active_user.email),
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
        headers=auth_headers(active_user.email),
    )
    assert furnace_response.status_code == 200

    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )

    assert submit_response.status_code == 422
    assert submit_response.json()["detail"] == "Submit validation failed"


def test_submit_allows_missing_gas_program(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Gas optional flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    precursors_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        json={"payload_json": {"items": [{"role": "A", "type": "MoO3"}]}},
        headers=auth_headers(active_user.email),
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
        headers=auth_headers(active_user.email),
    )
    assert furnace_response.status_code == 200

    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )

    assert submit_response.status_code == 200


def test_clone_rejects_non_locked_experiment(active_user, admin_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "WS2",
            "experiment_date": "2026-04-23",
            "objective": "Clone status guard",
        },
        headers=auth_headers(admin_user.email),
    )
    source_id = create_response.json()["id"]
    populate_required_modules(source_id, admin_user.email)

    submit_response = client.post(
        f"/api/v1/experiments/{source_id}/submit",
        headers=auth_headers(admin_user.email),
    )
    assert submit_response.status_code == 200

    clone_response = client.post(
        f"/api/v1/experiments/{source_id}/clone",
        headers=auth_headers(active_user.email),
    )

    assert clone_response.status_code == 409
    assert clone_response.json()["detail"] == "Only locked experiments can be cloned"


def test_clone_excludes_observation_and_characterization_modules(active_user, admin_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Clone module filtering",
        },
        headers=auth_headers(admin_user.email),
    )
    experiment_id = create_response.json()["id"]
    populate_required_modules(experiment_id, admin_user.email)

    process_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/process_observation",
        json={
            "payload_json": {
                "color_change": "darkened",
                "abnormal_events": ["condensate"],
            }
        },
        headers=auth_headers(admin_user.email),
    )
    assert process_response.status_code == 200

    characterization_response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/characterization",
        json={
            "payload_json": {
                "methods": [{"method": "Raman", "result": "peak visible"}],
            }
        },
        headers=auth_headers(admin_user.email),
    )
    assert characterization_response.status_code == 200

    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(admin_user.email),
    )
    assert submit_response.status_code == 200
    lock_response = client.post(
        f"/api/v1/experiments/{experiment_id}/lock",
        headers=auth_headers(admin_user.email),
    )
    assert lock_response.status_code == 200

    clone_response = client.post(
        f"/api/v1/experiments/{experiment_id}/clone",
        headers=auth_headers(active_user.email),
    )
    assert clone_response.status_code == 201
    clone_id = clone_response.json()["id"]

    cloned_process_response = client.get(
        f"/api/v1/experiments/{clone_id}/modules/process_observation",
        headers=auth_headers(active_user.email),
    )
    cloned_characterization_response = client.get(
        f"/api/v1/experiments/{clone_id}/modules/characterization",
        headers=auth_headers(active_user.email),
    )

    assert cloned_process_response.status_code == 404
    assert cloned_characterization_response.status_code == 404


def test_invalidate_requires_reason(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Invalidate flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/invalidate",
        json={"reason": ""},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 422


def test_invalidate_moves_experiment_to_invalid(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Invalidate flow",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/invalidate",
        json={"reason": "Contaminated substrate"},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "invalid"


def test_list_experiments_hides_invalid_by_default(active_user) -> None:
    create_response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Invalid hidden",
        },
        headers=auth_headers(active_user.email),
    )
    experiment_id = create_response.json()["id"]
    run_code = create_response.json()["run_code"]

    invalidate_response = client.post(
        f"/api/v1/experiments/{experiment_id}/invalidate",
        json={"reason": "Bad wafer"},
        headers=auth_headers(active_user.email),
    )
    assert invalidate_response.status_code == 200

    list_response = client.get(
        "/api/v1/experiments",
        headers=auth_headers(active_user.email),
    )
    invalid_list_response = client.get(
        "/api/v1/experiments?status=invalid",
        headers=auth_headers(active_user.email),
    )

    assert list_response.status_code == 200
    assert invalid_list_response.status_code == 200
    assert run_code not in {item["run_code"] for item in list_response.json()["items"]}
    assert run_code in {item["run_code"] for item in invalid_list_response.json()["items"]}
