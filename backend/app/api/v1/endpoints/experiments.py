from io import BytesIO
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.module_payload import ExperimentModuleKey
from app.models.user import User
from app.schemas.audit import AuditEventListResponse
from app.schemas.experiment import (
    ExperimentAnalysisExportRead,
    ExperimentCreate,
    ExperimentExportRead,
    ExperimentFromRecipeCreate,
    ExperimentInvalidateRequest,
    ExperimentListResponse,
    ExperimentRead,
    ExperimentSaveAsRecipeRequest,
    ExperimentUpdate,
)
from app.schemas.experiment_validation import ExperimentValidationResponse
from app.schemas.module_payload import (
    ExperimentModulePayloadListResponse,
    ExperimentModulePayloadRead,
    ExperimentModulePayloadUpsert,
)
from app.schemas.recipe import RecipeRead
from app.services.experiment_service import ExperimentService
from app.services.experiment_validation_service import ExperimentValidationFailed

router = APIRouter(prefix="/api/v1/experiments", tags=["experiments"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=ExperimentListResponse)
def list_experiments(
    db: DbSession,
    current_user: CurrentUser,
    mine: Annotated[bool, Query()] = False,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    material_system: Annotated[str | None, Query()] = None,
    query_text: Annotated[str | None, Query(alias="q")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    sort_by: Annotated[
        Literal["run_code", "material_system", "experiment_date", "status", "updated_at"],
        Query(),
    ] = "updated_at",
    sort_order: Annotated[Literal["asc", "desc"], Query()] = "desc",
) -> ExperimentListResponse:
    return ExperimentService(db).list_experiments(
        current_user=current_user,
        mine=mine,
        status_filter=status_filter,
        material_system=material_system,
        query_text=query_text,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.post("", response_model=ExperimentRead, status_code=status.HTTP_201_CREATED)
def create_experiment(
    payload: ExperimentCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> ExperimentRead:
    return ExperimentService(db).create_experiment(payload, current_user)


@router.post("/from-recipe", response_model=ExperimentRead, status_code=status.HTTP_201_CREATED)
def create_experiment_from_recipe(
    payload: ExperimentFromRecipeCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> ExperimentRead:
    return ExperimentService(db).create_from_recipe(payload, current_user)


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


@router.get("/{experiment_id}/export/analysis", response_model=ExperimentAnalysisExportRead)
def export_experiment_analysis(
    experiment_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> ExperimentAnalysisExportRead:
    return ExperimentService(db).export_experiment_analysis(experiment_id, current_user)


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


@router.post(
    "/{experiment_id}/submit",
    response_model=ExperimentRead,
    responses={status.HTTP_422_UNPROCESSABLE_CONTENT: {"model": ExperimentValidationResponse}},
)
def submit_experiment(
    experiment_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> ExperimentRead:
    try:
        return ExperimentService(db).submit_experiment(experiment_id, current_user)
    except ExperimentValidationFailed as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=exc.result.model_dump(mode="json"),
        )


@router.post("/{experiment_id}/validate", response_model=ExperimentValidationResponse)
def validate_experiment(
    experiment_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> ExperimentValidationResponse:
    return ExperimentService(db).validate_experiment(experiment_id, current_user)


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


@router.post(
    "/{experiment_id}/save-as-recipe",
    response_model=RecipeRead,
    status_code=status.HTTP_201_CREATED,
)
def save_experiment_as_recipe(
    experiment_id: UUID,
    payload: ExperimentSaveAsRecipeRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> RecipeRead:
    return ExperimentService(db).save_as_recipe(experiment_id, payload, current_user)


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
