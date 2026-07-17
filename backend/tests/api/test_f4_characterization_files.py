from uuid import UUID
from zlib import crc32

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.experiment import ExperimentRun, ExperimentStatus

client = TestClient(app)


def auth_headers(email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def create_run(email: str, code: str) -> str:
    response = client.post(
        "/api/v1/experiments",
        json={
            "run_code": f"CVD-2026-{crc32(code.encode()) % 10000:04d}",
            "started_at": "2026-07-11T09:30:00",
            "synthesis_method": "APCVD",
            "operator": email,
        },
        headers=auth_headers(email),
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def create_sample(run_id: str, email: str) -> str:
    response = client.post(
        f"/api/v1/experiments/{run_id}/samples",
        json={"role": "control"},
        headers=auth_headers(email),
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def create_record(run_id: str, sample_id: str, email: str, method: str = "Raman") -> str:
    response = client.post(
        f"/api/v1/experiments/{run_id}/characterization-records",
        json={"sample_id": sample_id, "method_instrument": method},
        headers=auth_headers(email),
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def upload_record_file(
    run_id: str,
    record_id: str,
    email: str,
    *,
    sample_id: str | None = None,
    asset_role: str | None = None,
):
    data = {"characterization_record_id": record_id}
    if sample_id is not None:
        data["sample_id"] = sample_id
    if asset_role is not None:
        data["asset_role"] = asset_role
    return client.post(
        f"/api/v1/experiments/{run_id}/files",
        headers=auth_headers(email),
        data=data,
        files={"file": ("spectrum.txt", b"peak=404", "text/plain")},
    )


@pytest.mark.parametrize("locked", [False, True])
def test_record_upload_derives_sample_and_allows_locked(
    active_user, db_session, locked: bool
) -> None:
    run_id = create_run(active_user.email, f"RUN-F4-UPLOAD-{locked}")
    sample_id = create_sample(run_id, active_user.email)
    record_id = create_record(run_id, sample_id, active_user.email)
    if locked:
        run = db_session.get(ExperimentRun, UUID(run_id))
        run.status = ExperimentStatus.LOCKED
        db_session.commit()

    response = upload_record_file(run_id, record_id, active_user.email)

    assert response.status_code == 201, response.text
    assert response.json()["characterization_record_id"] == record_id
    assert response.json()["sample_id"] == sample_id
    assert response.json()["asset_role"] == "characterization_file"


def test_record_upload_rejects_cross_run_and_setup_diagram(active_user) -> None:
    first_run = create_run(active_user.email, "RUN-F4-FIRST")
    sample_id = create_sample(first_run, active_user.email)
    record_id = create_record(first_run, sample_id, active_user.email)
    second_run = create_run(active_user.email, "RUN-F4-SECOND")

    cross_run = upload_record_file(second_run, record_id, active_user.email)
    setup = upload_record_file(
        first_run,
        record_id,
        active_user.email,
        asset_role="setup_diagram",
    )

    assert cross_run.status_code == 422
    assert setup.status_code == 422


def test_record_upload_rejects_sample_mismatch(active_user) -> None:
    run_id = create_run(active_user.email, "RUN-F4-SAMPLE")
    record_sample = create_sample(run_id, active_user.email)
    other_sample = create_sample(run_id, active_user.email)
    record_id = create_record(run_id, record_sample, active_user.email)

    response = upload_record_file(
        run_id,
        record_id,
        active_user.email,
        sample_id=other_sample,
    )

    assert response.status_code == 422


def test_invalid_run_rejects_record_upload(active_user, db_session) -> None:
    run_id = create_run(active_user.email, "RUN-F4-INVALID")
    sample_id = create_sample(run_id, active_user.email)
    record_id = create_record(run_id, sample_id, active_user.email)
    run = db_session.get(ExperimentRun, UUID(run_id))
    run.status = ExperimentStatus.INVALID
    db_session.commit()

    response = upload_record_file(run_id, record_id, active_user.email)

    assert response.status_code == 409


def test_list_files_filters_by_characterization_record(active_user) -> None:
    run_id = create_run(active_user.email, "RUN-F4-LIST")
    sample_id = create_sample(run_id, active_user.email)
    first_record = create_record(run_id, sample_id, active_user.email)
    second_record = create_record(run_id, sample_id, active_user.email, "SEM")
    assert upload_record_file(run_id, first_record, active_user.email).status_code == 201
    assert upload_record_file(run_id, second_record, active_user.email).status_code == 201

    response = client.get(
        f"/api/v1/files?characterization_record_id={first_record}",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["characterization_record_id"] == first_record


def test_active_attachment_blocks_record_delete_until_soft_deleted(active_user) -> None:
    run_id = create_run(active_user.email, "RUN-F4-DELETE")
    sample_id = create_sample(run_id, active_user.email)
    record_id = create_record(run_id, sample_id, active_user.email)
    uploaded = upload_record_file(run_id, record_id, active_user.email)
    assert uploaded.status_code == 201, uploaded.text

    blocked = client.delete(
        f"/api/v1/characterization-records/{record_id}",
        headers=auth_headers(active_user.email),
    )

    assert blocked.status_code == 409
    assert "attachment" in blocked.json()["detail"].lower()
    assert (
        client.delete(
            f"/api/v1/files/{uploaded.json()['id']}",
            headers=auth_headers(active_user.email),
        ).status_code
        == 204
    )
    assert (
        client.delete(
            f"/api/v1/characterization-records/{record_id}",
            headers=auth_headers(active_user.email),
        ).status_code
        == 204
    )
