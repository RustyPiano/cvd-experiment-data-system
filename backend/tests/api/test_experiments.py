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
