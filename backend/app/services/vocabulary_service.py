from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.models.vocabulary import ControlledVocabulary
from app.repositories.vocabulary_repository import VocabularyRepository
from app.schemas.vocabulary import (
    ControlledVocabularyCreate,
    ControlledVocabularyListResponse,
    ControlledVocabularyRead,
    ControlledVocabularyUpdate,
)
from app.services.audit_service import AuditService


class VocabularyService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit = AuditService(db)
        self.vocabularies = VocabularyRepository(db)

    def list_active_vocabularies(
        self,
        *,
        vocab_key: str | None = None,
    ) -> ControlledVocabularyListResponse:
        items = self.vocabularies.list_entries(vocab_key=vocab_key, active_only=True)
        return ControlledVocabularyListResponse(
            items=[ControlledVocabularyRead.model_validate(item) for item in items],
            total=len(items),
        )

    def list_admin_vocabularies(
        self,
        *,
        current_user: User,
        vocab_key: str | None = None,
    ) -> ControlledVocabularyListResponse:
        self._require_admin(current_user)
        items = self.vocabularies.list_entries(vocab_key=vocab_key, active_only=False)
        return ControlledVocabularyListResponse(
            items=[ControlledVocabularyRead.model_validate(item) for item in items],
            total=len(items),
        )

    def create_vocabulary(
        self,
        payload: ControlledVocabularyCreate,
        current_user: User,
    ) -> ControlledVocabularyRead:
        self._require_admin(current_user)
        entry = ControlledVocabulary(**payload.model_dump())
        try:
            saved = self.vocabularies.create(entry)
            self.audit.record_event(
                actor=current_user,
                entity_type="controlled_vocabulary",
                entity_id=saved.id,
                action="create",
                before_json=None,
                after_json=self._serialize_vocabulary(saved),
            )
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Vocabulary entry already exists",
            ) from exc
        return ControlledVocabularyRead.model_validate(saved)

    def update_vocabulary(
        self,
        vocab_id: UUID,
        payload: ControlledVocabularyUpdate,
        current_user: User,
    ) -> ControlledVocabularyRead:
        self._require_admin(current_user)
        entry = self.vocabularies.get_by_id(vocab_id)
        if entry is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vocabulary entry not found",
            )

        updates = payload.model_dump(exclude_unset=True)
        before = self._serialize_vocabulary(entry)
        for field, value in updates.items():
            setattr(entry, field, value)

        try:
            saved = self.vocabularies.save(entry)
            self.audit.record_event(
                actor=current_user,
                entity_type="controlled_vocabulary",
                entity_id=saved.id,
                action="update",
                before_json=before,
                after_json=self._serialize_vocabulary(saved),
            )
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Vocabulary entry already exists",
            ) from exc
        return ControlledVocabularyRead.model_validate(saved)

    def _require_admin(self, current_user: User) -> None:
        if current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

    def _serialize_vocabulary(self, entry: ControlledVocabulary) -> dict:
        return {
            "id": str(entry.id),
            "vocab_key": entry.vocab_key,
            "value": entry.value,
            "label_zh": entry.label_zh,
            "label_en": entry.label_en,
            "sort_order": entry.sort_order,
            "is_active": entry.is_active,
            "metadata_json": entry.metadata_json,
        }
