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


class VocabularyService:
    def __init__(self, db: Session) -> None:
        self.db = db
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
        for field, value in updates.items():
            setattr(entry, field, value)

        try:
            saved = self.vocabularies.save(entry)
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
