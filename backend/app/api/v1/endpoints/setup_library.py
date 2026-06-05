from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.setup_library import (
    SetupLibraryCreate,
    SetupLibraryListResponse,
    SetupLibraryRead,
    SetupLibraryUpdate,
)
from app.services.setup_library_service import SetupLibraryService

router = APIRouter(prefix="/api/v1/setup-library", tags=["setup-library"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=SetupLibraryListResponse)
def list_setup_library(
    db: DbSession,
    current_user: CurrentUser,
) -> SetupLibraryListResponse:
    return SetupLibraryService(db).list_entries(current_user)


@router.post("", response_model=SetupLibraryRead, status_code=status.HTTP_201_CREATED)
def create_setup_library_entry(
    payload: SetupLibraryCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> SetupLibraryRead:
    return SetupLibraryService(db).create_entry(payload, current_user)


@router.get("/{entry_id}", response_model=SetupLibraryRead)
def get_setup_library_entry(
    entry_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> SetupLibraryRead:
    return SetupLibraryService(db).get_entry(entry_id, current_user)


@router.patch("/{entry_id}", response_model=SetupLibraryRead)
def update_setup_library_entry(
    entry_id: UUID,
    payload: SetupLibraryUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> SetupLibraryRead:
    return SetupLibraryService(db).update_entry(entry_id, payload, current_user)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_setup_library_entry(
    entry_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> Response:
    SetupLibraryService(db).deactivate_entry(entry_id, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{entry_id}/diagram", response_model=SetupLibraryRead)
def upload_setup_library_diagram(
    entry_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
    file: Annotated[UploadFile, File()],
) -> SetupLibraryRead:
    return SetupLibraryService(db).upload_diagram(entry_id, file, current_user)


@router.get("/{entry_id}/diagram")
def download_setup_library_diagram(
    entry_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> FileResponse:
    absolute_path, entry = SetupLibraryService(db).resolve_diagram_download(entry_id, current_user)
    return FileResponse(
        absolute_path,
        media_type=entry.diagram_content_type or "application/octet-stream",
        filename=entry.diagram_original_name or "setup-diagram",
    )
