from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.file_asset import FileAssetListResponse, FileAssetRead
from app.services.file_asset_service import FileAssetService

router = APIRouter(prefix="/api/v1", tags=["files"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("/files", response_model=FileAssetListResponse)
def list_files(
    db: DbSession,
    current_user: CurrentUser,
    experiment_id: Annotated[UUID | None, Query()] = None,
    sample_id: Annotated[UUID | None, Query()] = None,
    method: Annotated[str | None, Query()] = None,
    file_category: Annotated[str | None, Query()] = None,
    legacy_file_kind: Annotated[
        str | None,
        Query(alias="file_kind", include_in_schema=False),
    ] = None,
) -> FileAssetListResponse:
    return FileAssetService(db).list_files(
        current_user=current_user,
        experiment_id=experiment_id,
        sample_id=sample_id,
        method=method or legacy_file_kind,
        file_category=file_category,
    )


@router.post(
    "/experiments/{experiment_id}/files",
    response_model=FileAssetRead,
    status_code=status.HTTP_201_CREATED,
)
def upload_file(
    experiment_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
    file: Annotated[UploadFile, File()],
    sample_id: Annotated[UUID | None, Form()] = None,
    method: Annotated[str | None, Form()] = None,
    file_category: Annotated[str | None, Form()] = None,
    note: Annotated[str | None, Form()] = None,
    legacy_file_kind: Annotated[
        str | None,
        Form(alias="file_kind", include_in_schema=False),
    ] = None,
) -> FileAssetRead:
    return FileAssetService(db).upload_file(
        experiment_id=experiment_id,
        upload=file,
        current_user=current_user,
        sample_id=sample_id,
        method=method or legacy_file_kind,
        file_category=file_category,
        note=note,
    )


@router.get("/files/{file_id}", response_model=FileAssetRead)
def get_file(
    file_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> FileAssetRead:
    return FileAssetService(db).get_file(file_id, current_user)


@router.get("/files/{file_id}/download")
def download_file(
    file_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> FileResponse:
    absolute_path, file_asset = FileAssetService(db).resolve_download(file_id, current_user)
    return FileResponse(
        absolute_path,
        media_type=file_asset.content_type or "application/octet-stream",
        filename=file_asset.original_name,
    )


@router.delete("/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> Response:
    FileAssetService(db).delete_file(file_id, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
