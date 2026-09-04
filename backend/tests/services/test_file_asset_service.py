from datetime import UTC, datetime
from io import BytesIO
from uuid import uuid4

import pytest
from fastapi import HTTPException, UploadFile
from openpyxl import Workbook

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.sample import Sample, SampleRole
from app.models.scientific import RunRevision
from app.models.v2_results import CharacterizationRecord
from app.services.file_asset_service import FileAssetService
from app.services.file_storage_service import FileStorageService
from app.services.v2_field_source import field_option_values


def build_upload(filename: str, content: bytes) -> UploadFile:
    return UploadFile(file=BytesIO(content), filename=filename)


def build_xlsx(rows: list[list[object]]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    for row in rows:
        sheet.append(row)
    output = BytesIO()
    workbook.save(output)
    workbook.close()
    return output.getvalue()


def test_characterization_methods_come_from_field_source() -> None:
    assert field_option_values("method_instrument") == {
        "optical_microscopy",
        "SEM",
        "Raman",
        "low_frequency_raman",
        "PL",
        "SHG",
        "AFM",
        "XRD",
        "TEM",
        "other",
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
    revision = RunRevision(
        experiment_run_id=experiment.id,
        revision_number=1,
        schema_version="v4.0-alpha.19",
        schema_status="internal_validation",
        status="locked",
        content_json={},
        content_sha256="1" * 64,
        locked_by_id=experiment.owner_id,
        locked_at=datetime(2026, 4, 23, tzinfo=UTC),
    )
    service.db.add(revision)
    service.db.flush()
    experiment.current_revision_id = revision.id
    experiment.status = ExperimentStatus.LOCKED
    sample = Sample(
        sample_code=f"{experiment.run_code}-S1",
        experiment_run_id=experiment.id,
        run_revision_id=revision.id,
        role=SampleRole.GROWTH,
    )
    service.db.add(sample)
    service.db.flush()
    record = CharacterizationRecord(
        experiment_run_id=experiment.id,
        run_revision_id=revision.id,
        sample_id=sample.id,
        method_instrument="Raman",
        performed_by_id=experiment.owner_id,
        measured_at=datetime(2026, 4, 23, 12, tzinfo=UTC),
        sample_region={"geometry_type": "whole_sample"},
        typed_conditions={"laser_wavelength_nm": 532},
        quality_flag="valid",
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


def test_upload_rejects_note_beyond_database_limit(active_user, db_session) -> None:
    service = FileAssetService(db_session)
    experiment = create_draft_experiment(service, active_user.id)

    with pytest.raises(HTTPException) as exc_info:
        service.upload_file(
            experiment_id=experiment.id,
            upload=build_upload("note.txt", b"payload"),
            current_user=active_user,
            method="Raman",
            note="n" * 501,
        )

    assert exc_info.value.status_code == 422


@pytest.mark.parametrize(
    ("filename", "content", "columns", "row_count"),
    [
        (
            "temperatures.csv",
            b"elapsed_min,zone_1_C,comment\n0,25,start\n1,30,heat\n",
            ["elapsed_min", "zone_1_C", "comment"],
            2,
        ),
        (
            "temperatures.xlsx",
            build_xlsx(
                [
                    ["elapsed_min", "zone_1_C", "comment"],
                    [0, 25, "start"],
                    [1, 30, "heat"],
                ]
            ),
            ["elapsed_min", "zone_1_C", "comment"],
            2,
        ),
    ],
)
def test_temperature_timeseries_upload_parses_columns(
    active_user,
    db_session,
    filename,
    content,
    columns,
    row_count,
) -> None:
    service = FileAssetService(db_session)
    experiment = create_draft_experiment(service, active_user.id)

    created = service.upload_file(
        experiment_id=experiment.id,
        upload=build_upload(filename, content),
        current_user=active_user,
        asset_role="temperature_timeseries",
        binding_type="process_channel",
        binding_id="temperature.zone_1",
    )

    assert created.metadata_json["columns"] == columns
    assert created.metadata_json["numeric_columns"] == ["elapsed_min", "zone_1_C"]
    assert created.metadata_json["numeric_column_pairs"] == [["elapsed_min", "zone_1_C"]]
    assert created.metadata_json["row_count"] == row_count


@pytest.mark.parametrize(
    ("filename", "content"),
    [
        ("temperatures.jpg", b"elapsed_min,zone_1_C\n0,25\n"),
        ("temperatures.xlsx", b"not-an-xlsx"),
        ("temperatures.csv", b"elapsed_min\n0\n"),
        ("temperatures.csv", b"elapsed_min,zone_1_C\n0,hot\n"),
        ("temperatures.csv", b"elapsed_min,\n0,25\n"),
        ("temperatures.csv", b"elapsed_min,elapsed_min\n0,25\n"),
        ("temperatures.csv", b"elapsed_min,zone_1_C\n0,\n,25\n"),
    ],
)
def test_temperature_timeseries_upload_rejects_invalid_files(
    active_user,
    db_session,
    filename,
    content,
) -> None:
    service = FileAssetService(db_session)
    experiment = create_draft_experiment(service, active_user.id)

    with pytest.raises(HTTPException) as exc_info:
        service.upload_file(
            experiment_id=experiment.id,
            upload=build_upload(filename, content),
            current_user=active_user,
            asset_role="temperature_timeseries",
            binding_type="process_step",
            binding_id="reaction_conditions",
        )

    assert exc_info.value.status_code == 422
    assert not any(path.is_file() for path in service.storage.root.rglob("*"))


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


def test_upload_file_cleans_up_disk_when_duplicate_lookup_fails(
    active_user,
    db_session,
    monkeypatch,
) -> None:
    service = FileAssetService(db_session)
    experiment = create_draft_experiment(service, active_user.id)

    def fail_duplicate_lookup(*_args) -> None:
        raise RuntimeError("duplicate lookup failed")

    monkeypatch.setattr(service.files, "find_active_duplicate", fail_duplicate_lookup)

    with pytest.raises(RuntimeError, match="duplicate lookup failed"):
        service.upload_file(
            experiment_id=experiment.id,
            upload=build_upload("duplicate-query-fail.txt", b"payload"),
            current_user=active_user,
            method="Raman",
        )

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


def test_storage_truncates_long_filenames_within_filesystem_byte_limit() -> None:
    storage = FileStorageService()

    storage_path, _ = storage.persist(
        experiment_run_code="CVD-2026-9999",
        file_id=uuid4(),
        original_name=f"{'a' * 400}.csv",
        content=b"value\n1\n",
    )

    stored = storage.resolve(storage_path)
    assert stored.exists()
    assert len(stored.name.encode("utf-8")) <= 255
    assert stored.suffix == ".csv"


def test_storage_preserves_safe_extension_for_unicode_and_emoji_stem() -> None:
    storage = FileStorageService()

    storage_path, _ = storage.persist(
        experiment_run_code="CVD-2026-9998",
        file_id=uuid4(),
        original_name=f"{'实验🧪' * 200}.csv",
        content=b"value\n1\n",
    )

    stored = storage.resolve(storage_path)
    assert stored.exists()
    assert len(stored.name.encode("utf-8")) <= 255
    assert stored.suffix == ".csv"


def test_upload_truncates_long_original_name_before_database_write(
    active_user,
    db_session,
) -> None:
    service = FileAssetService(db_session)
    experiment = create_draft_experiment(service, active_user.id)

    created = service.upload_file(
        experiment_id=experiment.id,
        upload=build_upload(f"{'a' * 400}.csv", b"value\n1\n"),
        current_user=active_user,
        method="Raman",
    )

    assert len(created.original_name) <= 255
    assert created.original_name.endswith(".csv")
