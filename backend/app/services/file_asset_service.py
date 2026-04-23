from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.file_asset import FileAsset
from app.models.user import User, UserRole
from app.repositories.experiment_repository import ExperimentRepository
from app.repositories.file_asset_repository import FileAssetRepository
from app.repositories.sample_repository import SampleRepository
from app.repositories.vocabulary_repository import VocabularyRepository
from app.schemas.file_asset import FileAssetListResponse, FileAssetRead
from app.services.audit_service import AuditService
from app.services.file_storage_service import FileStorageService


def serialize_file_asset(file_asset: FileAsset | None) -> dict[str, Any] | None:
    if file_asset is None:
        return None
    return {
        "id": str(file_asset.id),
        "experiment_run_id": str(file_asset.experiment_run_id),
        "sample_id": str(file_asset.sample_id) if file_asset.sample_id else None,
        "uploaded_by_id": str(file_asset.uploaded_by_id),
        "deleted_by_id": str(file_asset.deleted_by_id) if file_asset.deleted_by_id else None,
        "original_name": file_asset.original_name,
        "storage_path": file_asset.storage_path,
        "download_url": f"/api/v1/files/{file_asset.id}/download",
        "content_type": file_asset.content_type,
        "size_bytes": file_asset.size_bytes,
        "sha256": file_asset.sha256,
        "method": file_asset.method,
        "file_category": file_asset.file_category,
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


class FileAssetService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)
        self.samples = SampleRepository(db)
        self.files = FileAssetRepository(db)
        self.vocabularies = VocabularyRepository(db)
        self.audit = AuditService(db)
        self.storage = FileStorageService()

    def list_files(
        self,
        *,
        current_user: User,
        experiment_id: UUID | None = None,
        sample_id: UUID | None = None,
        method: str | None = None,
        file_category: str | None = None,
    ) -> FileAssetListResponse:
        items = self.files.list_visible(
            current_user=current_user,
            experiment_id=experiment_id,
            sample_id=sample_id,
            method=method,
            file_category=file_category,
        )
        return FileAssetListResponse(
            items=[to_file_asset_read_model(item) for item in items],
            total=len(items),
        )

    def get_file(self, file_id: UUID, current_user: User) -> FileAssetRead:
        file_asset = self._get_visible_file(file_id, current_user)
        return to_file_asset_read_model(file_asset)

    def upload_file(
        self,
        *,
        experiment_id: UUID,
        upload: UploadFile,
        current_user: User,
        sample_id: UUID | None = None,
        method: str | None = None,
        file_category: str | None = None,
        note: str | None = None,
    ) -> FileAssetRead:
        experiment = self._get_owned_draft_experiment(experiment_id, current_user)
        if sample_id is not None:
            sample = self.samples.get_by_id(sample_id)
            if sample is None or sample.experiment_run_id != experiment.id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Sample must belong to the same experiment",
                )

        content = self._read_upload_content(upload)
        resolved_method = self._normalize_method(method)
        if resolved_method is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="File method is required",
            )
        resolved_category = self._normalize_file_category(file_category)
        file_id = uuid4()
        relative_path, sha256 = self.storage.persist(
            experiment_run_code=experiment.run_code,
            file_id=file_id,
            original_name=upload.filename or "upload.bin",
            content=content,
        )
        duplicate = self.files.find_active_duplicate(experiment.id, sha256)
        metadata_json: dict[str, object] = {}
        if duplicate is not None:
            metadata_json = {
                "duplicate_in_experiment": True,
                "duplicate_of_file_id": str(duplicate.id),
            }
        file_asset = FileAsset(
            id=file_id,
            experiment_run_id=experiment.id,
            sample_id=sample_id,
            uploaded_by_id=current_user.id,
            original_name=upload.filename or "upload.bin",
            storage_path=relative_path,
            content_type=upload.content_type,
            size_bytes=len(content),
            sha256=sha256,
            method=resolved_method,
            file_category=resolved_category,
            note=self._normalize_note(note),
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
                reason=str(saved.id),
            )
            self.db.commit()
        except Exception:
            self.db.rollback()
            self.storage.delete(relative_path)
            raise
        return to_file_asset_read_model(saved)

    def delete_file(self, file_id: UUID, current_user: User) -> None:
        file_asset = self._get_owned_draft_file(file_id, current_user)
        before = serialize_file_asset(file_asset)
        file_asset.deleted_at = datetime.now(UTC)
        file_asset.deleted_by_id = current_user.id
        saved = self.files.save(file_asset)
        self.audit.record_event(
            actor=current_user,
            entity_type="file_asset",
            entity_id=saved.id,
            action="delete",
            before_json=before,
            after_json=serialize_file_asset(saved),
        )
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=saved.experiment_run_id,
            action="delete_file",
            before_json=before,
            after_json=serialize_file_asset(saved),
            reason=str(saved.id),
        )
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

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

    def _get_visible_file(self, file_id: UUID, current_user: User) -> FileAsset:
        file_asset = self.files.get_by_id(file_id)
        if file_asset is None or file_asset.deleted_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
        self._assert_experiment_visible(file_asset.experiment_run_id, current_user)
        return file_asset

    def _get_owned_draft_file(self, file_id: UUID, current_user: User) -> FileAsset:
        file_asset = self.files.get_by_id(file_id)
        if file_asset is None or file_asset.deleted_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
        self._get_owned_draft_experiment(file_asset.experiment_run_id, current_user)
        return file_asset

    def _get_owned_draft_experiment(self, experiment_id: UUID, current_user: User) -> ExperimentRun:
        experiment = self.experiments.get_by_id(experiment_id)
        if experiment is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Experiment not found",
            )
        if current_user.role == UserRole.VIEWER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        if current_user.role != UserRole.ADMIN and experiment.owner_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        if experiment.status != ExperimentStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only draft experiments can be updated",
            )
        return experiment

    def _assert_experiment_visible(self, experiment_id: UUID, current_user: User) -> None:
        experiment = self.experiments.get_by_id(experiment_id)
        if experiment is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Experiment not found",
            )
        if current_user.role == UserRole.ADMIN:
            return
        if current_user.role == UserRole.MEMBER:
            if experiment.owner_id == current_user.id:
                return
            if experiment.status in {ExperimentStatus.SUBMITTED, ExperimentStatus.LOCKED}:
                return
        elif experiment.status in {ExperimentStatus.SUBMITTED, ExperimentStatus.LOCKED}:
            return
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    def to_read_model(self, file_asset: FileAsset) -> FileAssetRead:
        return to_file_asset_read_model(file_asset)

    def _normalize_method(self, method: str | None) -> str | None:
        normalized = (method or "").strip()
        if not normalized:
            return None
        if self.vocabularies.get_active_by_key_value("characterization_method", normalized) is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid file method",
            )
        return normalized

    def _normalize_file_category(self, file_category: str | None) -> str:
        normalized = (file_category or "raw").strip().lower()
        if normalized not in {"raw", "processed"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid file category",
            )
        return normalized

    def _normalize_note(self, note: str | None) -> str | None:
        normalized = (note or "").strip()
        return normalized or None
