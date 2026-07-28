from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.file_asset import FILE_NOTE_MAX_LENGTH, FileAsset
from app.models.user import User
from app.models.v2_results import CharacterizationRecord
from app.repositories.experiment_repository import ExperimentRepository
from app.repositories.file_asset_repository import FileAssetRepository
from app.repositories.sample_repository import SampleRepository
from app.schemas.file_asset import FileAssetListResponse, FileAssetRead
from app.services.audit_service import AuditService
from app.services.experiment_guards import (
    ensure_files_editable,
    get_locked_visible_experiment,
    get_visible_experiment,
)
from app.services.file_storage_service import FileStorageService
from app.services.temperature_timeseries import (
    TemperatureTimeseriesError,
    ensure_temperature_timeseries_metadata,
    parse_temperature_timeseries,
)
from app.services.v2_field_source import canonical_option_value, field_option_values
from app.services.v2_result_status_service import refresh_result_missing_todo


def serialize_file_asset(file_asset: FileAsset | None) -> dict[str, Any] | None:
    if file_asset is None:
        return None
    return {
        "id": str(file_asset.id),
        "experiment_run_id": str(file_asset.experiment_run_id),
        "sample_id": str(file_asset.sample_id) if file_asset.sample_id else None,
        "characterization_record_id": (
            str(file_asset.characterization_record_id)
            if file_asset.characterization_record_id
            else None
        ),
        "uploaded_by_id": str(file_asset.uploaded_by_id),
        "deleted_by_id": str(file_asset.deleted_by_id) if file_asset.deleted_by_id else None,
        "original_name": file_asset.original_name,
        "storage_path": file_asset.storage_path,
        "download_url": f"/api/v1/files/{file_asset.id}/download",
        "content_type": file_asset.content_type,
        "size_bytes": file_asset.size_bytes,
        "sha256": file_asset.sha256,
        "method": canonical_option_value(file_asset.method),
        "file_category": file_asset.file_category,
        "asset_role": file_asset.asset_role,
        "note": file_asset.note,
        "metadata_json": file_asset.metadata_json,
        "created_at": file_asset.created_at.isoformat() if file_asset.created_at else None,
        "updated_at": file_asset.updated_at.isoformat() if file_asset.updated_at else None,
        "deleted_at": file_asset.deleted_at.isoformat() if file_asset.deleted_at else None,
        "is_deleted": file_asset.deleted_at is not None,
    }


def to_file_asset_read_model(file_asset: FileAsset) -> FileAssetRead:
    payload = serialize_file_asset(file_asset)
    assert payload is not None
    return FileAssetRead.model_validate(payload)


def normalize_file_note(note: str | None) -> str | None:
    if note is not None and len(note) > FILE_NOTE_MAX_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"invalid": [{"key": "note", "reason": "length"}]},
        )
    normalized = (note or "").strip()
    return normalized or None


def _raise_invalid_temperature_timeseries(exc: TemperatureTimeseriesError) -> None:
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={"invalid": [{"key": "temperature_timeseries", "reason": exc.reason}]},
    ) from exc


class FileAssetService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)
        self.samples = SampleRepository(db)
        self.files = FileAssetRepository(db)
        self.audit = AuditService(db)
        self.storage = FileStorageService()

    def list_files(
        self,
        *,
        current_user: User,
        experiment_id: UUID | None = None,
        sample_id: UUID | None = None,
        characterization_record_id: UUID | None = None,
        method: str | None = None,
        file_category: str | None = None,
        asset_role: str | None = None,
        binding_type: str | None = None,
        binding_id: str | None = None,
    ) -> FileAssetListResponse:
        items = self.files.list_visible(
            current_user=current_user,
            experiment_id=experiment_id,
            sample_id=sample_id,
            characterization_record_id=characterization_record_id,
            method=method,
            file_category=file_category,
            asset_role=asset_role,
        )
        if binding_type is not None or binding_id is not None:
            items = [
                item
                for item in items
                if item.metadata_json.get("binding_type") == binding_type
                and item.metadata_json.get("binding_id") == binding_id
            ]
        if self._backfill_temperature_metadata(items):
            self.db.commit()
        return FileAssetListResponse(
            items=[to_file_asset_read_model(item) for item in items],
            total=len(items),
        )

    def get_file(self, file_id: UUID, current_user: User) -> FileAssetRead:
        file_asset = self._get_visible_file(file_id, current_user)
        if self._backfill_temperature_metadata([file_asset]):
            self.db.commit()
        return to_file_asset_read_model(file_asset)

    def upload_file(
        self,
        *,
        experiment_id: UUID,
        upload: UploadFile,
        current_user: User,
        sample_id: UUID | None = None,
        characterization_record_id: UUID | None = None,
        method: str | None = None,
        file_category: str | None = None,
        asset_role: str | None = None,
        binding_type: str | None = None,
        binding_id: str | None = None,
        note: str | None = None,
    ) -> FileAssetRead:
        normalized_note = normalize_file_note(note)
        resolved_asset_role = self._normalize_asset_role(asset_role)
        if (
            characterization_record_id is not None
            and resolved_asset_role != "characterization_file"
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Only characterization files can link to a characterization record",
            )
        experiment = get_locked_visible_experiment(
            self.experiments,
            experiment_id,
            current_user,
        )
        ensure_files_editable(experiment, resolved_asset_role)
        record_method: str | None = None
        if characterization_record_id is not None:
            record = self.db.get(CharacterizationRecord, characterization_record_id)
            if record is None or record.experiment_run_id != experiment.id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Characterization record must belong to the same experiment",
                )
            if sample_id is not None and sample_id != record.sample_id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Sample must match the characterization record",
                )
            sample_id = record.sample_id
            record_method = self._normalize_method(record.method_instrument)
        if sample_id is not None:
            sample = self.samples.get_by_id(sample_id)
            if sample is None or sample.experiment_run_id != experiment.id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Sample must belong to the same experiment",
                )
        if (
            resolved_asset_role
            in {
                "setup_diagram",
                "process_event_attachment",
                "temperature_timeseries",
                "process_timeseries",
            }
            and sample_id is not None
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="This file role cannot be linked to a sample",
            )
        if resolved_asset_role == "direct_observation_file" and sample_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Direct observation files require a sample",
            )
        binding_metadata = self._validate_binding(
            resolved_asset_role,
            binding_type,
            binding_id,
        )

        if resolved_asset_role == "characterization_file":
            resolved_method = self._normalize_method(method)
            if characterization_record_id is not None:
                if resolved_method is None:
                    resolved_method = record_method
                elif resolved_method != record_method:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail="File method must match the characterization record",
                    )
            if resolved_method is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="File method is required",
                )
        else:
            resolved_method = resolved_asset_role
        original_name = self.storage.normalize_original_name(upload.filename or "upload.bin")
        content = self._read_upload_content(upload)
        timeseries_metadata: dict[str, object] = {}
        if resolved_asset_role == "temperature_timeseries":
            try:
                timeseries_metadata = parse_temperature_timeseries(content, original_name)
            except TemperatureTimeseriesError as exc:
                _raise_invalid_temperature_timeseries(exc)
        resolved_category = self._normalize_file_category(file_category)
        file_id = uuid4()
        relative_path, sha256 = self.storage.persist(
            experiment_run_code=experiment.run_code,
            file_id=file_id,
            original_name=original_name,
            content=content,
        )
        duplicate = self.files.find_active_duplicate(experiment.id, sha256)
        metadata_json: dict[str, object] = {}
        if duplicate is not None:
            metadata_json = {
                "duplicate_in_experiment": True,
                "duplicate_of_file_id": str(duplicate.id),
            }
        metadata_json.update(binding_metadata)
        metadata_json.update(timeseries_metadata)
        file_asset = FileAsset(
            id=file_id,
            experiment_run_id=experiment.id,
            sample_id=sample_id,
            characterization_record_id=characterization_record_id,
            uploaded_by_id=current_user.id,
            original_name=original_name,
            storage_path=relative_path,
            content_type=upload.content_type,
            size_bytes=len(content),
            sha256=sha256,
            method=resolved_method,
            file_category=resolved_category,
            asset_role=resolved_asset_role,
            note=normalized_note,
            file_kind=resolved_method,
            metadata_json=metadata_json,
        )
        try:
            saved = self.files.create(file_asset)
            self.audit.record_event(
                actor=current_user,
                entity_type="file_asset",
                entity_id=saved.id,
                action="create",
                before_json=None,
                after_json=serialize_file_asset(saved),
            )
            self.audit.record_event(
                actor=current_user,
                entity_type="experiment_run",
                entity_id=experiment.id,
                action="upload_file",
                before_json=None,
                after_json=serialize_file_asset(saved),
            )
            self.db.commit()
        except Exception:
            self.db.rollback()
            self.storage.delete(relative_path)
            raise
        return to_file_asset_read_model(saved)

    def delete_file(self, file_id: UUID, current_user: User) -> None:
        file_asset = self._get_editable_file(file_id, current_user)
        self._soft_delete_files([file_asset], current_user)
        try:
            if file_asset.asset_role == "direct_observation_file":
                experiment = self.experiments.get_by_id(file_asset.experiment_run_id)
                if experiment is not None:
                    refresh_result_missing_todo(self.db, experiment)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def soft_delete_unreferenced_process_files(
        self,
        *,
        experiment_id: UUID,
        asset_role: str,
        referenced_file_ids: set[UUID],
        current_user: User,
        retained_binding_ids: set[str] | None = None,
    ) -> None:
        if asset_role not in {
            "process_event_attachment",
            "temperature_timeseries",
            "process_timeseries",
        }:
            raise ValueError("Only process-bound files can be pruned")
        experiment = get_locked_visible_experiment(
            self.experiments,
            experiment_id,
            current_user,
        )
        ensure_files_editable(experiment, asset_role)
        files = self.files.list_visible(
            current_user=current_user,
            experiment_id=experiment_id,
            asset_role=asset_role,
        )
        self._soft_delete_files(
            [
                file
                for file in files
                if file.id not in referenced_file_ids
                and str(file.metadata_json.get("binding_id") or "")
                not in (retained_binding_ids or set())
            ],
            current_user,
        )

    def resolve_download(self, file_id: UUID, current_user: User) -> tuple[Path, FileAsset]:
        file_asset = self._get_visible_file(file_id, current_user)
        try:
            absolute_path = self.storage.resolve(file_asset.storage_path)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found",
            ) from exc
        if not absolute_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File content not found",
            )
        return absolute_path, file_asset

    def _read_upload_content(self, upload: UploadFile) -> bytes:
        settings = get_settings()
        max_bytes = settings.file_upload_max_bytes
        content = bytearray()

        while chunk := upload.file.read(1024 * 1024):
            content.extend(chunk)
            if len(content) > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    detail=f"Uploaded file exceeds {max_bytes} bytes",
                )

        if not content:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Uploaded file is empty",
            )
        return bytes(content)

    def _backfill_temperature_metadata(self, files: list[FileAsset]) -> bool:
        changed = False
        for file_asset in files:
            if file_asset.asset_role != "temperature_timeseries":
                continue
            try:
                changed = (
                    ensure_temperature_timeseries_metadata(file_asset, self.storage) or changed
                )
            except TemperatureTimeseriesError as exc:
                _raise_invalid_temperature_timeseries(exc)
        return changed

    def _get_visible_file(self, file_id: UUID, current_user: User) -> FileAsset:
        file_asset = self.files.get_by_id(file_id)
        if file_asset is None or file_asset.deleted_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
        get_visible_experiment(self.experiments, file_asset.experiment_run_id, current_user)
        return file_asset

    def _get_editable_file(self, file_id: UUID, current_user: User) -> FileAsset:
        file_asset = self.files.get_by_id(file_id)
        if file_asset is None or file_asset.deleted_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
        experiment = get_locked_visible_experiment(
            self.experiments,
            file_asset.experiment_run_id,
            current_user,
        )
        ensure_files_editable(experiment, file_asset.asset_role)
        return file_asset

    def to_read_model(self, file_asset: FileAsset) -> FileAssetRead:
        return to_file_asset_read_model(file_asset)

    def _soft_delete_files(self, files: list[FileAsset], current_user: User) -> None:
        deleted_at = datetime.now(UTC)
        for file_asset in files:
            before = serialize_file_asset(file_asset)
            file_asset.deleted_at = deleted_at
            file_asset.deleted_by_id = current_user.id
            saved = self.files.save(file_asset)
            after = serialize_file_asset(saved)
            self.audit.record_event(
                actor=current_user,
                entity_type="file_asset",
                entity_id=saved.id,
                action="delete",
                before_json=before,
                after_json=after,
            )
            self.audit.record_event(
                actor=current_user,
                entity_type="experiment_run",
                entity_id=saved.experiment_run_id,
                action="delete_file",
                before_json=before,
                after_json=after,
            )

    def _normalize_method(self, method: str | None) -> str | None:
        normalized = canonical_option_value((method or "").strip())
        if not normalized:
            return None
        if normalized not in field_option_values("method_instrument"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid file method",
            )
        return normalized

    def _normalize_asset_role(self, value: str | None) -> str:
        normalized = (value or "characterization_file").strip()
        if normalized not in {
            "characterization_file",
            "setup_diagram",
            "process_event_attachment",
            "temperature_timeseries",
            "process_timeseries",
            "direct_observation_file",
        }:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid asset role",
            )
        return normalized

    def _validate_binding(
        self,
        asset_role: str,
        binding_type: str | None,
        binding_id: str | None,
    ) -> dict[str, str]:
        expected_type = {
            "process_event_attachment": "process_event",
            "temperature_timeseries": "process_channel",
            "process_timeseries": "process_channel",
        }.get(asset_role)
        if expected_type is None:
            if binding_type is not None or binding_id is not None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="This file role does not accept a process binding",
                )
            return {}
        if binding_type != expected_type or not (normalized_id := (binding_id or "").strip()):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="A valid process binding is required for this file role",
            )
        try:
            valid_id = (
                (
                    bool(re.fullmatch(r"[a-z][a-z0-9_]*", normalized_id))
                    or str(UUID(normalized_id)) == normalized_id
                )
                if asset_role == "process_event_attachment"
                else bool(re.fullmatch(r"[a-z][a-z0-9_.]*", normalized_id))
            )
        except ValueError:
            valid_id = False
        if not valid_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid process binding",
            )
        return {"binding_type": expected_type, "binding_id": normalized_id}

    def _normalize_file_category(self, file_category: str | None) -> str:
        normalized = (file_category or "raw").strip().lower()
        if normalized not in {"raw", "processed"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid file category",
            )
        return normalized
