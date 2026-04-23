from io import BytesIO
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.experiment import ExperimentStatus
from app.models.module_payload import ExperimentModuleKey
from app.models.user import User
from app.schemas.audit import AuditEventListResponse
from app.schemas.experiment import (
    ExperimentCreate,
    ExperimentExportRead,
    ExperimentInvalidateRequest,
    ExperimentListResponse,
    ExperimentRead,
    ExperimentUpdate,
)
from app.schemas.module_payload import (
    ExperimentModulePayloadListResponse,
    ExperimentModulePayloadRead,
    ExperimentModulePayloadUpsert,
)
from app.services.experiment_service import ExperimentService

router = APIRouter(prefix="/api/v1/experiments", tags=["experiments"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=ExperimentListResponse)
def list_experiments(
    db: DbSession,
    current_user: CurrentUser,
    mine: Annotated[bool, Query()] = False,
    status_filter: Annotated[ExperimentStatus | None, Query(alias="status")] = None,
) -> ExperimentListResponse:
    return ExperimentService(db).list_experiments(
        current_user=current_user,
        mine=mine,
        status_filter=status_filter,
    )


@router.post("", response_model=ExperimentRead, status_code=status.HTTP_201_CREATED)
def create_experiment(
    payload: ExperimentCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> ExperimentRead:
    return ExperimentService(db).create_experiment(payload, current_user)


@router.get("/{experiment_id}", response_model=ExperimentRead)
def get_experiment(
    experiment_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> ExperimentRead:
    return ExperimentService(db).get_experiment(experiment_id, current_user)


@router.get("/{experiment_id}/export", response_model=ExperimentExportRead)
def export_experiment(
    experiment_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> ExperimentExportRead:
    return ExperimentService(db).export_experiment(experiment_id, current_user)


@router.get("/{experiment_id}/export/json", response_model=ExperimentExportRead)
def export_experiment_json(
    experiment_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> ExperimentExportRead:
    return ExperimentService(db).export_experiment(experiment_id, current_user)


@router.get("/{experiment_id}/export/excel")
def export_experiment_excel(
    experiment_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> StreamingResponse:
    workbook_bytes = ExperimentService(db).export_experiment_excel(experiment_id, current_user)
    return StreamingResponse(
        BytesIO(workbook_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="experiment-{experiment_id}.xlsx"'},
    )


@router.patch("/{experiment_id}", response_model=ExperimentRead)
def update_experiment(
    experiment_id: UUID,
    payload: ExperimentUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> ExperimentRead:
    return ExperimentService(db).update_experiment(experiment_id, payload, current_user)


@router.post("/{experiment_id}/submit", response_model=ExperimentRead)
def submit_experiment(
    experiment_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> ExperimentRead:
    return ExperimentService(db).submit_experiment(experiment_id, current_user)


@router.post("/{experiment_id}/return-to-draft", response_model=ExperimentRead)
def return_experiment_to_draft(
    experiment_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> ExperimentRead:
    return ExperimentService(db).return_to_draft(experiment_id, current_user)


@router.post("/{experiment_id}/lock", response_model=ExperimentRead)
def lock_experiment(
    experiment_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> ExperimentRead:
    return ExperimentService(db).lock_experiment(experiment_id, current_user)


@router.post("/{experiment_id}/invalidate", response_model=ExperimentRead)
def invalidate_experiment(
    experiment_id: UUID,
    payload: ExperimentInvalidateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> ExperimentRead:
    return ExperimentService(db).invalidate_experiment(experiment_id, payload, current_user)


@router.post(
    "/{experiment_id}/clone",
    response_model=ExperimentRead,
    status_code=status.HTTP_201_CREATED,
)
def clone_experiment(
    experiment_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> ExperimentRead:
    return ExperimentService(db).clone_experiment(experiment_id, current_user)


@router.get("/{experiment_id}/audit-events", response_model=AuditEventListResponse)
def list_audit_events(
    experiment_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> AuditEventListResponse:
    return ExperimentService(db).list_audit_events(experiment_id, current_user)


@router.get("/{experiment_id}/modules", response_model=ExperimentModulePayloadListResponse)
def list_modules(
    experiment_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> ExperimentModulePayloadListResponse:
    return ExperimentService(db).list_modules(experiment_id, current_user)


@router.get("/{experiment_id}/modules/{module_key}", response_model=ExperimentModulePayloadRead)
def get_module(
    experiment_id: UUID,
    module_key: ExperimentModuleKey,
    db: DbSession,
    current_user: CurrentUser,
) -> ExperimentModulePayloadRead:
    return ExperimentService(db).get_module(experiment_id, module_key, current_user)


@router.put("/{experiment_id}/modules/{module_key}", response_model=ExperimentModulePayloadRead)
def upsert_module(
    experiment_id: UUID,
    module_key: ExperimentModuleKey,
    payload: ExperimentModulePayloadUpsert,
    db: DbSession,
    current_user: CurrentUser,
) -> ExperimentModulePayloadRead:
    return ExperimentService(db).upsert_module(experiment_id, module_key, payload, current_user)
