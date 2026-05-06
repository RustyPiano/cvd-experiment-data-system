from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.services.file_storage_service import FileStorageService

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


def create_experiment(email: str, *, objective: str = "File asset flow") -> str:
    response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": objective,
        },
        headers=auth_headers(email),
    )
    assert response.status_code == 201
    return response.json()["id"]


def create_sample(experiment_id: str, email: str, *, role: str = "product") -> str:
    response = client.post(
        f"/api/v1/experiments/{experiment_id}/samples",
        json={"role": role},
        headers=auth_headers(email),
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_upload_file_creates_metadata_and_supports_download(active_user) -> None:
    experiment_id = create_experiment(active_user.email)

    upload_response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={
            "method": "Raman",
            "file_category": "raw",
            "note": "first pass",
        },
        files={"file": ("raman.txt", b"peak=404", "text/plain")},
    )

    assert upload_response.status_code == 201
    body = upload_response.json()
    assert body["experiment_run_id"] == experiment_id
    assert body["original_name"] == "raman.txt"
    assert body["method"] == "Raman"
    assert body["file_category"] == "raw"
    assert body["note"] == "first pass"
    assert body["size_bytes"] == 8
    assert body["is_deleted"] is False
    assert not Path(body["storage_path"]).is_absolute()
    assert body["download_url"].endswith(f"/api/v1/files/{body['id']}/download")

    list_response = client.get(
        f"/api/v1/files?experiment_id={experiment_id}",
        headers=auth_headers(active_user.email),
    )
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1

    download_response = client.get(
        f"/api/v1/files/{body['id']}/download",
        headers=auth_headers(active_user.email),
    )
    assert download_response.status_code == 200
    assert download_response.content == b"peak=404"
    assert "raman.txt" in download_response.headers["content-disposition"]


def test_upload_file_accepts_sample_link_only_within_same_experiment(
    active_user, admin_user
) -> None:
    first_experiment_id = create_experiment(active_user.email, objective="Parent sample experiment")
    sample_id = create_sample(first_experiment_id, active_user.email)
    second_experiment_id = create_experiment(admin_user.email, objective="Other experiment")

    response = client.post(
        f"/api/v1/experiments/{second_experiment_id}/files",
        headers=auth_headers(admin_user.email),
        data={"sample_id": sample_id, "method": "SEM"},
        files={"file": ("sem.png", b"png-bytes", "image/png")},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Sample must belong to the same experiment"


def test_upload_file_requires_method(active_user) -> None:
    experiment_id = create_experiment(active_user.email)

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        files={"file": ("raman.txt", b"peak=404", "text/plain")},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "File method is required"


def test_upload_file_rejects_unknown_method(active_user) -> None:
    experiment_id = create_experiment(active_user.email)

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"method": "XRD"},
        files={"file": ("raman.txt", b"peak=404", "text/plain")},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Invalid file method"


def test_upload_file_accepts_legacy_file_kind_alias(active_user) -> None:
    experiment_id = create_experiment(active_user.email)

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"file_kind": "OM"},
        files={"file": ("legacy.txt", b"legacy", "text/plain")},
    )

    assert response.status_code == 201
    assert response.json()["method"] == "OM"


def test_upload_file_rejects_payloads_over_size_limit(active_user, monkeypatch) -> None:
    experiment_id = create_experiment(active_user.email)
    monkeypatch.setattr(get_settings(), "file_upload_max_bytes", 4)

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"method": "OM"},
        files={"file": ("oversized.txt", b"12345", "text/plain")},
    )

    assert response.status_code == 413
    assert response.json()["detail"] == "Uploaded file exceeds 4 bytes"


def test_delete_file_soft_deletes_metadata_and_hides_content(active_user) -> None:
    experiment_id = create_experiment(active_user.email)
    upload_response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"method": "OM"},
        files={"file": ("xrd.csv", b"2theta,intensity\n10,20", "text/csv")},
    )
    file_id = upload_response.json()["id"]

    delete_response = client.delete(
        f"/api/v1/files/{file_id}",
        headers=auth_headers(active_user.email),
    )
    assert delete_response.status_code == 204

    list_response = client.get(
        f"/api/v1/files?experiment_id={experiment_id}",
        headers=auth_headers(active_user.email),
    )
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 0

    detail_response = client.get(
        f"/api/v1/files/{file_id}",
        headers=auth_headers(active_user.email),
    )
    assert detail_response.status_code == 404

    download_response = client.get(
        f"/api/v1/files/{file_id}/download",
        headers=auth_headers(active_user.email),
    )
    assert download_response.status_code == 404


def test_viewer_cannot_upload_file_to_visible_experiment(admin_user, viewer_user) -> None:
    experiment_id = create_experiment(admin_user.email, objective="Viewer upload forbidden")

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(viewer_user.email),
        data={"method": "OM"},
        files={"file": ("note.txt", b"forbidden", "text/plain")},
    )

    assert response.status_code == 403


def test_upload_file_rejects_locked_experiment(active_user) -> None:
    experiment_id = create_experiment(active_user.email, objective="Locked file upload")

    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )
    assert submit_response.status_code == 422

    patch_response = client.patch(
        f"/api/v1/experiments/{experiment_id}",
        json={"objective": "Locked file upload updated"},
        headers=auth_headers(active_user.email),
    )
    assert patch_response.status_code == 200

    client.put(
        f"/api/v1/experiments/{experiment_id}/modules/precursors",
        json={"payload_json": {"items": [{"species": "MoO3", "method": "powder"}]}},
        headers=auth_headers(active_user.email),
    )
    client.put(
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
    client.put(
        f"/api/v1/experiments/{experiment_id}/modules/gas_program",
        json={
            "payload_json": {
                "segments": [
                    {
                        "stage": "growth",
                        "start_min": 0,
                        "end_min": 45,
                        "gas": "Ar",
                        "components": [{"name": "Ar", "fraction": 1, "flow_sccm": 80}],
                        "flow_sccm": 80,
                    }
                ]
            }
        },
        headers=auth_headers(active_user.email),
    )

    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(active_user.email),
    )
    assert submit_response.status_code == 200

    lock_response = client.post(
        f"/api/v1/experiments/{experiment_id}/lock",
        headers=auth_headers(active_user.email),
    )
    assert lock_response.status_code == 200

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"method": "OM"},
        files={"file": ("locked.txt", b"blocked", "text/plain")},
    )

    assert response.status_code == 409


def test_deleted_file_keeps_storage_blob_for_soft_delete(active_user) -> None:
    experiment_id = create_experiment(active_user.email, objective="Storage cleanup")

    upload_response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"method": "OM"},
        files={"file": ("cleanup.bin", b"12345", "application/octet-stream")},
    )
    assert upload_response.status_code == 201
    stored_path = FileStorageService().resolve(upload_response.json()["storage_path"])
    assert stored_path.exists()

    delete_response = client.delete(
        f"/api/v1/files/{upload_response.json()['id']}",
        headers=auth_headers(active_user.email),
    )
    assert delete_response.status_code == 204
    assert stored_path.exists()
