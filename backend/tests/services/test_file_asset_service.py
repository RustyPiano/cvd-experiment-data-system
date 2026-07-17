from datetime import datetime
from io import BytesIO

import pytest
from fastapi import HTTPException, UploadFile

from app.models.experiment import ExperimentRun
from app.models.sample import Sample, SampleRole
from app.models.v2_results import CharacterizationRecord
from app.services.file_asset_service import FileAssetService
from app.services.file_storage_service import FileStorageService
from app.services.v2_field_source import field_option_values


def build_upload(filename: str, content: bytes) -> UploadFile:
    return UploadFile(file=BytesIO(content), filename=filename)


def test_characterization_methods_come_from_field_source() -> None:
    assert field_option_values("method_instrument") == {
        "光镜",
        "SEM",
        "Raman",
        "低波数Raman",
        "PL",
        "AFM",
        "XRD",
        "TEM",
        "其他",
    }


def create_draft_experiment(service: FileAssetService, owner_id) -> ExperimentRun:
    experiment = service.experiments.create(
        ExperimentRun(
            run_code="CVD-2026-0001",
            owner_id=owner_id,
            schema_version="cvd_v2",
            material_system="MoS2",
            experiment_date=datetime(2026, 4, 23).date(),
            objective="File asset service tests",
        )
    )
    service.db.commit()
    service.db.refresh(experiment)
    return experiment


def create_characterization_record(
    service: FileAssetService, experiment: ExperimentRun
) -> CharacterizationRecord:
    sample = Sample(
        sample_code=f"{experiment.run_code}-S1",
        experiment_run_id=experiment.id,
        role=SampleRole.GROWTH,
    )
    service.db.add(sample)
    service.db.flush()
    record = CharacterizationRecord(
        experiment_run_id=experiment.id,
        sample_id=sample.id,
        method_instrument="Raman",
    )
    service.db.add(record)
    service.db.commit()
    return record


def test_characterization_upload_derives_omitted_method(active_user, db_session) -> None:
    service = FileAssetService(db_session)
    experiment = create_draft_experiment(service, active_user.id)
    record = create_characterization_record(service, experiment)

    created = service.upload_file(
        experiment_id=experiment.id,
        characterization_record_id=record.id,
        upload=build_upload("derived.txt", b"payload"),
        current_user=active_user,
    )

    assert created.method == "Raman"


def test_characterization_upload_rejects_mismatched_method(active_user, db_session) -> None:
    service = FileAssetService(db_session)
    experiment = create_draft_experiment(service, active_user.id)
    record = create_characterization_record(service, experiment)

    with pytest.raises(HTTPException) as exc_info:
        service.upload_file(
            experiment_id=experiment.id,
            characterization_record_id=record.id,
            method="SEM",
            upload=build_upload("mismatch.txt", b"payload"),
            current_user=active_user,
        )

    assert exc_info.value.status_code == 422


def test_characterization_upload_accepts_matching_method(active_user, db_session) -> None:
    service = FileAssetService(db_session)
    experiment = create_draft_experiment(service, active_user.id)
    record = create_characterization_record(service, experiment)

    created = service.upload_file(
        experiment_id=experiment.id,
        characterization_record_id=record.id,
        method="Raman",
        upload=build_upload("matching.txt", b"payload"),
        current_user=active_user,
    )

    assert created.method == "Raman"


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
            method="Raman",
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
        method="Raman",
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
