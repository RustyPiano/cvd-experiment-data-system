from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.vocabulary import (
    ControlledVocabularyCreate,
    ControlledVocabularyListResponse,
    ControlledVocabularyRead,
    ControlledVocabularyUpdate,
)
from app.services.vocabulary_service import VocabularyService

router = APIRouter(prefix="/api/v1", tags=["vocabularies"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("/vocabularies", response_model=ControlledVocabularyListResponse)
def list_active_vocabularies(
    db: DbSession,
    _current_user: CurrentUser,
    vocab_key: Annotated[str | None, Query()] = None,
) -> ControlledVocabularyListResponse:
    return VocabularyService(db).list_active_vocabularies(vocab_key=vocab_key)


@router.get("/admin/vocabularies", response_model=ControlledVocabularyListResponse)
def list_admin_vocabularies(
    db: DbSession,
    current_user: CurrentUser,
    vocab_key: Annotated[str | None, Query()] = None,
) -> ControlledVocabularyListResponse:
    return VocabularyService(db).list_admin_vocabularies(
        current_user=current_user,
        vocab_key=vocab_key,
    )


@router.post(
    "/admin/vocabularies",
    response_model=ControlledVocabularyRead,
    status_code=status.HTTP_201_CREATED,
)
def create_vocabulary(
    payload: ControlledVocabularyCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> ControlledVocabularyRead:
    return VocabularyService(db).create_vocabulary(payload, current_user)


@router.patch("/admin/vocabularies/{vocab_id}", response_model=ControlledVocabularyRead)
def update_vocabulary(
    vocab_id: UUID,
    payload: ControlledVocabularyUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> ControlledVocabularyRead:
    return VocabularyService(db).update_vocabulary(vocab_id, payload, current_user)
