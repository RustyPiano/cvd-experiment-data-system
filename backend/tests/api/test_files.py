from pathlib import Path
from uuid import UUID

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.models.audit import AuditEvent
from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.user import User, UserRole
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
            "started_at": "2026-04-23T10:00:00+08:00",
            "synthesis_method": "CVD",
            "operator": email,
            "chemical_formula": "MoS2",
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


def test_upload_file_creates_metadata_and_supports_download(active_user, db_session) -> None:
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
    event = db_session.query(AuditEvent).filter(AuditEvent.action == "upload_file").one()
    assert event.actor_id == active_user.id
    assert event.entity_id == UUID(experiment_id)
    assert event.action == "upload_file"


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


def test_upload_setup_diagram_allows_missing_method(active_user) -> None:
    experiment_id = create_experiment(active_user.email)

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"asset_role": "setup_diagram", "file_category": "raw"},
        files={"file": ("setup.png", b"diagram", "image/png")},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["asset_role"] == "setup_diagram"
    assert body["method"] == "setup_diagram"
    assert body["sample_id"] is None


def test_setup_diagram_rejects_sample_link(active_user) -> None:
    experiment_id = create_experiment(active_user.email)
    sample_id = create_sample(experiment_id, active_user.email)

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"asset_role": "setup_diagram", "sample_id": sample_id, "file_category": "raw"},
        files={"file": ("setup.png", b"diagram", "image/png")},
    )

    assert response.status_code == 422
    assert "sample" in response.json()["detail"].lower()


def test_upload_file_rejects_unknown_method(active_user) -> None:
    experiment_id = create_experiment(active_user.email)

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"method": "unknown"},
        files={"file": ("raman.txt", b"peak=404", "text/plain")},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Invalid file method"


def test_upload_file_accepts_legacy_file_kind_alias(active_user) -> None:
    experiment_id = create_experiment(active_user.email)

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"file_kind": "Raman"},
        files={"file": ("legacy.txt", b"legacy", "text/plain")},
    )

    assert response.status_code == 201
    assert response.json()["method"] == "Raman"


def test_upload_file_rejects_payloads_over_size_limit(active_user, monkeypatch) -> None:
    experiment_id = create_experiment(active_user.email)
    monkeypatch.setattr(get_settings(), "file_upload_max_bytes", 4)

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"method": "Raman"},
        files={"file": ("oversized.txt", b"12345", "text/plain")},
    )

    assert response.status_code == 413
    assert response.json()["detail"] == "Uploaded file exceeds 4 bytes"


def test_delete_file_soft_deletes_metadata_and_hides_content(active_user, db_session) -> None:
    experiment_id = create_experiment(active_user.email)
    upload_response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"method": "Raman"},
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
    event = db_session.query(AuditEvent).filter(AuditEvent.action == "delete_file").one()
    assert event.actor_id == active_user.id
    assert event.entity_id == UUID(experiment_id)
    assert event.action == "delete_file"


def test_locked_experiment_allows_characterization_file_but_rejects_setup_diagram(
    active_user, db_session
) -> None:
    experiment_id = create_experiment(active_user.email, objective="Locked file upload")
    setup_file = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"asset_role": "setup_diagram"},
        files={"file": ("setup.png", b"diagram", "image/png")},
    ).json()
    experiment = db_session.get(ExperimentRun, UUID(experiment_id))
    experiment.status = ExperimentStatus.LOCKED
    db_session.commit()

    characterization = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"method": "Raman", "asset_role": "characterization_file"},
        files={"file": ("locked.txt", b"allowed", "text/plain")},
    )
    assert characterization.status_code == 201, characterization.text
    assert (
        client.delete(
            f"/api/v1/files/{characterization.json()['id']}",
            headers=auth_headers(active_user.email),
        ).status_code
        == 204
    )

    setup_upload = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"asset_role": "setup_diagram"},
        files={"file": ("locked-setup.png", b"blocked", "image/png")},
    )
    assert setup_upload.status_code == 409
    assert (
        client.delete(
            f"/api/v1/files/{setup_file['id']}", headers=auth_headers(active_user.email)
        ).status_code
        == 409
    )


def test_file_write_permissions_follow_run_visibility(active_user, db_session) -> None:
    experiment_id = create_experiment(active_user.email)
    other = User(
        email="file-other@example.com",
        name="File Other",
        password_hash=active_user.password_hash,
        role=UserRole.MEMBER,
        is_active=True,
    )
    db_session.add(other)
    db_session.commit()
    headers = auth_headers(other.email)

    hidden = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=headers,
        data={"method": "Raman"},
        files={"file": ("hidden.txt", b"hidden", "text/plain")},
    )
    assert hidden.status_code == 404

    experiment = db_session.get(ExperimentRun, UUID(experiment_id))
    experiment.status = ExperimentStatus.SUBMITTED
    db_session.commit()
    visible = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=headers,
        data={"method": "Raman"},
        files={"file": ("visible.txt", b"visible", "text/plain")},
    )
    assert visible.status_code == 403


def test_invalid_experiment_rejects_characterization_file_writes(active_user, db_session) -> None:
    experiment_id = create_experiment(active_user.email, objective="Invalid file upload")
    created = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"method": "Raman", "asset_role": "characterization_file"},
        files={"file": ("before-invalid.txt", b"data", "text/plain")},
    ).json()
    experiment = db_session.get(ExperimentRun, UUID(experiment_id))
    experiment.status = ExperimentStatus.INVALID
    db_session.commit()

    upload = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"method": "Raman", "asset_role": "characterization_file"},
        files={"file": ("invalid.txt", b"blocked", "text/plain")},
    )
    assert upload.status_code == 409
    assert (
        client.delete(
            f"/api/v1/files/{created['id']}", headers=auth_headers(active_user.email)
        ).status_code
        == 409
    )


def test_upload_file_allowed_on_submitted_experiment(active_user, db_session) -> None:
    # Characterization files can be attached to a submitted (still-editable)
    # experiment, not only to drafts.
    experiment_id = create_experiment(active_user.email, objective="Submitted file upload")

    experiment = db_session.get(ExperimentRun, UUID(experiment_id))
    experiment.status = ExperimentStatus.SUBMITTED
    db_session.commit()

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"method": "Raman", "asset_role": "characterization_file"},
        files={"file": ("om.txt", b"image-bytes", "text/plain")},
    )

    assert response.status_code == 201
    assert response.json()["method"] == "Raman"


def test_deleted_file_keeps_storage_blob_for_soft_delete(active_user) -> None:
    experiment_id = create_experiment(active_user.email, objective="Storage cleanup")

    upload_response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(active_user.email),
        data={"method": "Raman"},
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
