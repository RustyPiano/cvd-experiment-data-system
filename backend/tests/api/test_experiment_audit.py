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

    audit_response = client.get(
        f"/api/v1/experiments/{experiment_id}/audit-events",
        headers=auth_headers(active_user.email),
    )

    assert audit_response.status_code == 200
    actions = [item["action"] for item in audit_response.json()["items"]]
    assert actions == ["create", "update", "submit"]


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

    submit_response = client.post(
        f"/api/v1/experiments/{source_id}/submit",
        headers=auth_headers(admin_user.email),
    )
    assert submit_response.status_code == 200

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
