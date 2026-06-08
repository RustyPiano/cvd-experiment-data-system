from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.imports import (
    ImportCommitRequest,
    ImportCommitResponse,
    ImportPreviewResponse,
    ImportProfileListResponse,
)
from app.services.import_service import ImportService

router = APIRouter(prefix="/api/v1/imports", tags=["imports"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("/profiles", response_model=ImportProfileListResponse)
def list_import_profiles(
    db: DbSession,
    _current_user: CurrentUser,
) -> ImportProfileListResponse:
    return ImportService(db).list_profiles()


@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    db: DbSession,
    _current_user: CurrentUser,
    profile_key: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
) -> ImportPreviewResponse:
    content = await file.read()
    return ImportService(db).preview(content=content, profile_key=profile_key)


@router.post(
    "/commit",
    response_model=ImportCommitResponse,
    status_code=status.HTTP_201_CREATED,
)
def commit_import(
    payload: ImportCommitRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> ImportCommitResponse:
    return ImportService(db).commit(payload, current_user)
