from datetime import datetime
from io import BytesIO

import pytest
from fastapi import UploadFile

from app.models.experiment import ExperimentRun
from app.services.file_asset_service import FileAssetService
from app.services.file_storage_service import FileStorageService


def build_upload(filename: str, content: bytes) -> UploadFile:
    return UploadFile(file=BytesIO(content), filename=filename)


def create_draft_experiment(service: FileAssetService, owner_id) -> ExperimentRun:
    experiment = service.experiments.create(
        ExperimentRun(
            run_code="CVD-2026-0001",
            owner_id=owner_id,
            experiment_type="cvd_2zone",
            material_system="MoS2",
            experiment_date=datetime(2026, 4, 23).date(),
            objective="File asset service tests",
        )
    )
    service.db.commit()
    service.db.refresh(experiment)
    return experiment


def test_upload_file_cleans_up_disk_when_audit_fails(active_user, db_session, monkeypatch) -> None:
    service = FileAssetService(db_session)
    experiment = create_draft_experiment(service, active_user.id)

    def fake_record_event(**_kwargs) -> None:
        raise RuntimeError("audit failed")

    monkeypatch.setattr(service.audit, "record_event", fake_record_event)

    with pytest.raises(RuntimeError, match="audit failed"):
        service.upload_file(
            experiment_id=experiment.id,
            upload=build_upload("audit-fail.txt", b"payload"),
            current_user=active_user,
            method="OM",
        )

    db_session.rollback()
    assert not any(path.is_file() for path in service.storage.root.rglob("*"))


def test_delete_file_keeps_disk_content_when_commit_fails(
    active_user,
    db_session,
    monkeypatch,
) -> None:
    service = FileAssetService(db_session)
    experiment = create_draft_experiment(service, active_user.id)
    created = service.upload_file(
        experiment_id=experiment.id,
        upload=build_upload("delete-fail.txt", b"payload"),
        current_user=active_user,
        method="OM",
    )
    stored_path = service.storage.resolve(created.storage_path)
    assert stored_path.exists()

    def fake_commit() -> None:
        raise RuntimeError("commit failed")

    monkeypatch.setattr(db_session, "commit", fake_commit)

    with pytest.raises(RuntimeError, match="commit failed"):
        service.delete_file(created.id, active_user)

    db_session.rollback()
    assert stored_path.exists()


def test_storage_service_rejects_paths_outside_storage_root() -> None:
    storage = FileStorageService()

    with pytest.raises(ValueError, match="outside storage root"):
        storage.resolve("../escape.txt")

    with pytest.raises(ValueError, match="outside storage root"):
        storage.resolve("/tmp/escape.txt")
