from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.file_asset import FileAsset
from app.models.user import User, UserRole
from app.repositories.file_asset_repository import FileAssetRepository
from app.schemas.file_asset import FileAssetRead
from app.services.audit_service import AuditService
from app.services.file_asset_service import normalize_file_note
from app.services.file_storage_service import FileStorageService

ENTITY_ASSET_ROLE = "entity_attachment"
ENTITY_REFERENCE_METHOD = "entity_reference"


class EntityFileService:
    """Upload immutable evidence before an entity/version exists, then expose it after binding."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit = AuditService(db)
        self.files = FileAssetRepository(db)
        self.storage = FileStorageService()

    def upload(
        self,
        *,
        upload: UploadFile,
        current_user: User,
        note: str | None = None,
    ) -> FileAssetRead:
        normalized_note = normalize_file_note(note)
        content = self._read_upload_content(upload)
        file_id = uuid4()
        original_name = self.storage.normalize_original_name(upload.filename or "upload.bin")
        relative_path, sha256 = self.storage.persist(
            experiment_run_code=f"entity-reference-{current_user.id}",
            file_id=file_id,
            original_name=original_name,
            content=content,
        )
        asset = FileAsset(
            id=file_id,
            experiment_run_id=None,
            sample_id=None,
            characterization_record_id=None,
            entity_type=None,
            entity_id=None,
            entity_version=None,
            uploaded_by_id=current_user.id,
            original_name=original_name,
            storage_path=relative_path,
            content_type=upload.content_type,
            size_bytes=len(content),
            sha256=sha256,
            method=ENTITY_REFERENCE_METHOD,
            file_category="raw",
            asset_role=ENTITY_ASSET_ROLE,
            note=normalized_note,
            file_kind=ENTITY_REFERENCE_METHOD,
            metadata_json={},
        )
        try:
            self.db.add(asset)
            self.db.flush()
            self.db.refresh(asset)
            self.audit.record_event(
                actor=current_user,
                entity_type="file_asset",
                entity_id=asset.id,
                action="create_entity_reference",
                before_json=None,
                after_json=self._audit_snapshot(asset),
            )
            self.db.commit()
            self.db.refresh(asset)
        except Exception:
            self.db.rollback()
            self.storage.delete(relative_path)
            raise
        return self._read_model(asset)

    def get(self, file_id: UUID, current_user: User) -> FileAssetRead:
        return self._read_model(self._get_visible(file_id, current_user))

    def resolve_download(self, file_id: UUID, current_user: User) -> tuple[Path, FileAsset]:
        asset = self._get_visible(file_id, current_user)
        try:
            absolute_path = self.storage.resolve(asset.storage_path)
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
        return absolute_path, asset

    def delete(self, file_id: UUID, current_user: User) -> None:
        asset = self._get_existing(file_id, for_update=True)
        if asset.entity_id is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Entity-bound files are immutable",
            )
        if asset.experiment_run_id is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
        if current_user.role != UserRole.ADMIN and asset.uploaded_by_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
        before = self._audit_snapshot(asset)
        asset.deleted_at = datetime.now(UTC)
        asset.deleted_by_id = current_user.id
        self.audit.record_event(
            actor=current_user,
            entity_type="file_asset",
            entity_id=asset.id,
            action="delete_entity_reference",
            before_json=before,
            after_json=self._audit_snapshot(asset),
        )
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def _get_existing(self, file_id: UUID, *, for_update: bool = False) -> FileAsset:
        asset = (
            self.files.get_by_id_for_update(file_id)
            if for_update
            else self.files.get_by_id(file_id)
        )
        if asset is None or asset.deleted_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
        return asset

    def _get_visible(self, file_id: UUID, current_user: User) -> FileAsset:
        asset = self._get_existing(file_id)
        if asset.entity_id is not None:
            return asset
        if asset.experiment_run_id is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
        if current_user.role == UserRole.ADMIN or asset.uploaded_by_id == current_user.id:
            return asset
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    @staticmethod
    def _audit_snapshot(asset: FileAsset) -> dict[str, Any]:
        return {
            "id": str(asset.id),
            "uploaded_by_id": str(asset.uploaded_by_id),
            "entity_type": asset.entity_type,
            "entity_id": str(asset.entity_id) if asset.entity_id else None,
            "entity_version": asset.entity_version,
            "original_name": asset.original_name,
            "size_bytes": asset.size_bytes,
            "sha256": asset.sha256,
            "deleted_at": asset.deleted_at.isoformat() if asset.deleted_at else None,
        }

    @staticmethod
    def _read_model(asset: FileAsset) -> FileAssetRead:
        return FileAssetRead(
            id=asset.id,
            experiment_run_id=None,
            sample_id=None,
            characterization_record_id=None,
            entity_type=asset.entity_type,
            entity_id=asset.entity_id,
            entity_version=asset.entity_version,
            uploaded_by_id=asset.uploaded_by_id,
            deleted_by_id=asset.deleted_by_id,
            original_name=asset.original_name,
            storage_path=asset.storage_path,
            download_url=f"/api/v1/entity-files/{asset.id}/download",
            content_type=asset.content_type,
            size_bytes=asset.size_bytes,
            sha256=asset.sha256,
            method=asset.method,
            file_category=asset.file_category,
            asset_role=asset.asset_role,
            note=asset.note,
            metadata_json=asset.metadata_json,
            created_at=asset.created_at,
            updated_at=asset.updated_at,
            deleted_at=asset.deleted_at,
            is_deleted=asset.deleted_at is not None,
        )

    @staticmethod
    def _read_upload_content(upload: UploadFile) -> bytes:
        max_bytes = get_settings().file_upload_max_bytes
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
