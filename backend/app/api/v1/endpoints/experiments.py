from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.experiment import ExperimentStatus
from app.models.user import User
from app.schemas.experiment import (
    ExperimentCreate,
    ExperimentInvalidateRequest,
    ExperimentListResponse,
    ExperimentRead,
    ExperimentUpdate,
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
