from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.setup_library import SetupLibraryEntry, SetupVisibility
from app.models.user import User, UserRole
from app.repositories.setup_library_repository import SetupLibraryRepository
from app.schemas.setup_library import (
    SetupLibraryCreate,
    SetupLibraryListResponse,
    SetupLibraryRead,
    SetupLibraryUpdate,
)
from app.services.audit_service import AuditService
from app.services.file_storage_service import FileStorageService

CONTENT_HASH_FIELDS = (
    "name",
    "institution",
    "apparatus_description",
    "methods_text",
    "sample_placement_description",
    "reaction_flow_description",
    "reference_paper_url",
    "unpublished_reason",
    "diagram_sha256",
    "semantic_context",
)


class SetupLibraryService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.entries = SetupLibraryRepository(db)
        self.audit = AuditService(db)
        self.storage = FileStorageService()

    def list_entries(self, current_user: User) -> SetupLibraryListResponse:
        items = self.entries.list_visible(current_user)
        return SetupLibraryListResponse(
            items=[self._to_read(item, current_user) for item in items],
            total=len(items),
        )

    def get_entry(self, entry_id: UUID, current_user: User) -> SetupLibraryRead:
        entry = self._get_visible_entry(entry_id, current_user)
        return self._to_read(entry, current_user)

    def get_visible_entry(self, entry_id: UUID, current_user: User) -> SetupLibraryEntry:
        """Return the ORM entry if visible to the user, else raise 404."""
        return self._get_visible_entry(entry_id, current_user)

    def create_entry(
        self,
        payload: SetupLibraryCreate,
        current_user: User,
    ) -> SetupLibraryRead:
        entry = SetupLibraryEntry(
            owner_id=current_user.id,
            visibility=payload.visibility,
            is_active=True,
            name=payload.name.strip(),
            institution=self._normalized_optional(payload.institution),
            apparatus_description=payload.apparatus_description,
            methods_text=payload.methods_text,
            sample_placement_description=payload.sample_placement_description,
            reaction_flow_description=payload.reaction_flow_description,
            reference_paper_url=self._normalized_optional(payload.reference_paper_url),
            unpublished_reason=self._normalized_optional(payload.unpublished_reason),
            semantic_context=payload.semantic_context,
        )
        entry.content_hash = self._calculate_content_hash(entry)
        saved = self.entries.save(entry)
        self.audit.record_event(
            actor=current_user,
            entity_type="setup_library_entry",
            entity_id=saved.id,
            action="create",
            before_json=None,
            after_json=self._serialize(saved),
        )
        self.db.commit()
        return self._to_read(saved, current_user)

    def update_entry(
        self,
        entry_id: UUID,
        payload: SetupLibraryUpdate,
        current_user: User,
    ) -> SetupLibraryRead:
        entry = self._get_editable_entry(entry_id, current_user)
        before = self._serialize(entry)
        updates = payload.model_dump(exclude_unset=True)
        for field, value in updates.items():
            if field == "name" and isinstance(value, str):
                value = value.strip()
            if field in {"institution", "reference_paper_url", "unpublished_reason"}:
                value = self._normalized_optional(value)
            setattr(entry, field, value)
        entry.content_hash = self._calculate_content_hash(entry)
        saved = self.entries.save(entry)
        self.audit.record_event(
            actor=current_user,
            entity_type="setup_library_entry",
            entity_id=saved.id,
            action="update",
            before_json=before,
            after_json=self._serialize(saved),
        )
        self.db.commit()
        return self._to_read(saved, current_user)

    def deactivate_entry(self, entry_id: UUID, current_user: User) -> None:
        entry = self._get_editable_entry(entry_id, current_user)
        before = self._serialize(entry)
        entry.is_active = False
        saved = self.entries.save(entry)
        self.audit.record_event(
            actor=current_user,
            entity_type="setup_library_entry",
            entity_id=saved.id,
            action="deactivate",
            before_json=before,
            after_json=self._serialize(saved),
        )
        self.db.commit()

    def upload_diagram(
        self,
        entry_id: UUID,
        upload: UploadFile,
        current_user: User,
    ) -> SetupLibraryRead:
        entry = self._get_editable_entry(entry_id, current_user)
        content = self._read_upload_content(upload)
        previous_path = entry.diagram_storage_path
        before = self._serialize(entry)
        relative_path, sha256 = self.storage.persist(
            experiment_run_code=f"setup_library_{entry.id}",
            file_id=uuid4(),
            original_name=upload.filename or "setup-diagram.bin",
            content=content,
        )
        entry.diagram_storage_path = relative_path
        entry.diagram_sha256 = sha256
        entry.diagram_content_type = upload.content_type
        entry.diagram_size_bytes = len(content)
        entry.diagram_original_name = upload.filename or "setup-diagram.bin"
        entry.content_hash = self._calculate_content_hash(entry)
        saved = self.entries.save(entry)
        self.audit.record_event(
            actor=current_user,
            entity_type="setup_library_entry",
            entity_id=saved.id,
            action="upload_diagram",
            before_json=before,
            after_json=self._serialize(saved),
        )
        self.db.commit()
        if previous_path and previous_path != relative_path:
            try:
                self.storage.delete(previous_path)
            except (OSError, ValueError):
                pass
        return self._to_read(saved, current_user)

    def resolve_diagram_download(
        self,
        entry_id: UUID,
        current_user: User,
    ) -> tuple[Path, SetupLibraryEntry]:
        entry = self._get_visible_entry(entry_id, current_user)
        if entry.diagram_storage_path is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Setup diagram not found",
            )
        return self.storage.resolve(entry.diagram_storage_path), entry

    def _get_visible_entry(self, entry_id: UUID, current_user: User) -> SetupLibraryEntry:
        entry = self.entries.get_by_id(entry_id)
        if entry is None or not entry.is_active or not self._can_view(entry, current_user):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Setup library entry not found",
            )
        return entry

    def _get_editable_entry(self, entry_id: UUID, current_user: User) -> SetupLibraryEntry:
        entry = self.entries.get_by_id(entry_id)
        if entry is None or not entry.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Setup library entry not found",
            )
        if not self._can_edit(entry, current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return entry

    def _can_view(self, entry: SetupLibraryEntry, current_user: User) -> bool:
        if current_user.role == UserRole.ADMIN:
            return True
        if entry.owner_id == current_user.id:
            return True
        return entry.visibility == SetupVisibility.GROUP

    def _can_edit(self, entry: SetupLibraryEntry, current_user: User) -> bool:
        return current_user.role == UserRole.ADMIN or entry.owner_id == current_user.id

    def _to_read(self, entry: SetupLibraryEntry, current_user: User) -> SetupLibraryRead:
        return SetupLibraryRead(
            id=entry.id,
            owner_id=entry.owner_id,
            owner_name=entry.owner.name if entry.owner is not None else None,
            visibility=entry.visibility,
            is_active=entry.is_active,
            name=entry.name,
            institution=entry.institution,
            apparatus_description=entry.apparatus_description,
            methods_text=entry.methods_text,
            sample_placement_description=entry.sample_placement_description,
            reaction_flow_description=entry.reaction_flow_description,
            reference_paper_url=entry.reference_paper_url,
            unpublished_reason=entry.unpublished_reason,
            has_diagram=entry.has_diagram,
            diagram_original_name=entry.diagram_original_name,
            diagram_download_url=(
                f"/api/v1/setup-library/{entry.id}/diagram" if entry.has_diagram else None
            ),
            content_hash=entry.content_hash,
            can_edit=self._can_edit(entry, current_user),
            semantic_context=entry.semantic_context or {},
            created_at=entry.created_at,
            updated_at=entry.updated_at,
        )

    def _serialize(self, entry: SetupLibraryEntry) -> dict[str, Any]:
        return {
            "id": str(entry.id),
            "owner_id": str(entry.owner_id),
            "visibility": entry.visibility.value,
            "is_active": entry.is_active,
            "name": entry.name,
            "institution": entry.institution,
            "apparatus_description": entry.apparatus_description,
            "methods_text": entry.methods_text,
            "sample_placement_description": entry.sample_placement_description,
            "reaction_flow_description": entry.reaction_flow_description,
            "reference_paper_url": entry.reference_paper_url,
            "unpublished_reason": entry.unpublished_reason,
            "diagram_storage_path": entry.diagram_storage_path,
            "diagram_sha256": entry.diagram_sha256,
            "content_hash": entry.content_hash,
            "semantic_context": entry.semantic_context,
        }

    def _calculate_content_hash(self, entry: SetupLibraryEntry) -> str:
        canonical = {
            field: getattr(entry, field)
            for field in CONTENT_HASH_FIELDS
            if field != "semantic_context" and getattr(entry, field, None) is not None
        }
        canonical["semantic_context"] = entry.semantic_context or {}
        serialized = json.dumps(
            canonical,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        )
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

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

    def _normalized_optional(self, value: str | None) -> str | None:
        normalized = (value or "").strip()
        return normalized or None
