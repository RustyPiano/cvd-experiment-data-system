from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.deps import get_current_admin_user, get_current_user
from app.db.session import get_db
from app.models.file_asset import FILE_NOTE_MAX_LENGTH
from app.models.user import User
from app.schemas.file_asset import FileAssetRead
from app.services.entity_file_service import EntityFileService

router = APIRouter(prefix="/api/v1/entity-files", tags=["entity-files"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentAdmin = Annotated[User, Depends(get_current_admin_user)]


@router.post("", response_model=FileAssetRead, status_code=status.HTTP_201_CREATED)
def upload_entity_file(
    db: DbSession,
    current_user: CurrentAdmin,
    file: Annotated[UploadFile, File()],
    note: Annotated[str | None, Form(max_length=FILE_NOTE_MAX_LENGTH)] = None,
) -> FileAssetRead:
    return EntityFileService(db).upload(
        upload=file,
        current_user=current_user,
        note=note,
    )


@router.get("/{file_id}", response_model=FileAssetRead)
def get_entity_file(
    file_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> FileAssetRead:
    return EntityFileService(db).get(file_id, current_user)


@router.get("/{file_id}/download")
def download_entity_file(
    file_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> FileResponse:
    absolute_path, asset = EntityFileService(db).resolve_download(file_id, current_user)
    return FileResponse(
        absolute_path,
        media_type=asset.content_type or "application/octet-stream",
        filename=asset.original_name,
    )


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entity_file(
    file_id: UUID,
    db: DbSession,
    current_user: CurrentAdmin,
) -> Response:
    EntityFileService(db).delete(file_id, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
