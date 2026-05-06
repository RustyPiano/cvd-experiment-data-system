from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.field_definition import (
    FieldDefinitionCreate,
    FieldDefinitionListResponse,
    FieldDefinitionRead,
    FieldDefinitionUpdate,
)
from app.services.field_definition_service import FieldDefinitionService

router = APIRouter(prefix="/api/v1", tags=["field-definitions"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("/field-definitions", response_model=FieldDefinitionListResponse)
def list_active_definitions(
    db: DbSession,
    _current_user: CurrentUser,
    module_key: Annotated[str | None, Query()] = None,
) -> FieldDefinitionListResponse:
    return FieldDefinitionService(db).list_active_definitions(module_key=module_key)


@router.get("/field-definitions/{field_id}", response_model=FieldDefinitionRead)
def get_definition(
    field_id: UUID,
    db: DbSession,
    _current_user: CurrentUser,
) -> FieldDefinitionRead:
    return FieldDefinitionService(db).get_definition(field_id)


@router.get("/admin/field-definitions", response_model=FieldDefinitionListResponse)
def list_admin_definitions(
    db: DbSession,
    current_user: CurrentUser,
    module_key: Annotated[str | None, Query()] = None,
) -> FieldDefinitionListResponse:
    return FieldDefinitionService(db).list_admin_definitions(
        current_user=current_user,
        module_key=module_key,
    )


@router.post(
    "/admin/field-definitions",
    response_model=FieldDefinitionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_definition(
    payload: FieldDefinitionCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> FieldDefinitionRead:
    return FieldDefinitionService(db).create_definition(payload, current_user)


@router.patch("/admin/field-definitions/{field_id}", response_model=FieldDefinitionRead)
def update_definition(
    field_id: UUID,
    payload: FieldDefinitionUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> FieldDefinitionRead:
    return FieldDefinitionService(db).update_definition(field_id, payload, current_user)


@router.post(
    "/admin/field-definitions/{field_id}/deactivate",
    response_model=FieldDefinitionRead,
)
def deactivate_definition(
    field_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> FieldDefinitionRead:
    return FieldDefinitionService(db).deactivate_definition(field_id, current_user)


@router.post(
    "/admin/field-definitions/{field_id}/reactivate",
    response_model=FieldDefinitionRead,
)
def reactivate_definition(
    field_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> FieldDefinitionRead:
    return FieldDefinitionService(db).reactivate_definition(field_id, current_user)
