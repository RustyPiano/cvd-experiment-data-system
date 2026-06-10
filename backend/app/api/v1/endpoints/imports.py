from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
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


async def _read_capped_upload(file: UploadFile, max_bytes: int) -> bytes:
    """分块读取上传内容，一旦超过上限即中止——避免把超大文件整体读入内存。"""
    content = bytearray()
    while chunk := await file.read(1024 * 1024):
        content.extend(chunk)
        if len(content) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"Uploaded file exceeds {max_bytes} bytes",
            )
    return bytes(content)


@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    db: DbSession,
    _current_user: CurrentUser,
    profile_key: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
) -> ImportPreviewResponse:
    content = await _read_capped_upload(file, get_settings().file_upload_max_bytes)
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
