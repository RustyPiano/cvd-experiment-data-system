from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.sample import SampleRole
from app.models.user import User
from app.schemas.sample import SampleCreate, SampleListResponse, SampleRead, SampleUpdate
from app.services.sample_service import SampleService

router = APIRouter(prefix="/api/v1", tags=["samples"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("/samples", response_model=SampleListResponse)
def list_samples(
    db: DbSession,
    current_user: CurrentUser,
    experiment_id: Annotated[UUID | None, Query()] = None,
    role: Annotated[SampleRole | None, Query()] = None,
    sample_code: Annotated[str | None, Query()] = None,
) -> SampleListResponse:
    return SampleService(db).list_samples(
        current_user=current_user,
        experiment_id=experiment_id,
        role=role,
        sample_code=sample_code,
    )


@router.post(
    "/experiments/{experiment_id}/samples",
    response_model=SampleRead,
    status_code=status.HTTP_201_CREATED,
)
def create_sample(
    experiment_id: UUID,
    payload: SampleCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> SampleRead:
    return SampleService(db).create_sample(experiment_id, payload, current_user)


@router.get("/samples/{sample_id}", response_model=SampleRead)
def get_sample(
    sample_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> SampleRead:
    return SampleService(db).get_sample(sample_id, current_user)


@router.patch("/samples/{sample_id}", response_model=SampleRead)
def update_sample(
    sample_id: UUID,
    payload: SampleUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> SampleRead:
    return SampleService(db).update_sample(sample_id, payload, current_user)
