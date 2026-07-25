from __future__ import annotations

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_admin_user, get_current_user
from app.db.session import get_db
from app.models.experiment import ExperimentStatus
from app.models.user import User
from app.schemas.generated.v2_module_payload import (
    InstrumentVersionPayload,
    MaterialLotVersionPayload,
    SetupVersionPayload,
)
from app.schemas.v2 import (
    CharacterizationRecordCreate,
    CharacterizationRecordListResponse,
    CharacterizationRecordRead,
    CharacterizationRecordUpdate,
    MeasuredProductCreate,
    MeasuredProductListResponse,
    MeasuredProductRead,
    MeasuredProductUpdate,
    V2EntityListResponse,
    V2EntityRead,
    V2EntityVersionListResponse,
    V2EntityVersionRead,
    V2ExperimentCreate,
    V2ExperimentListResponse,
    V2ExperimentRead,
    V2InvalidateRequest,
    V2ModulePayloadRead,
    V2ModulePayloadUpsert,
    V2NotCharacterizedRequest,
    V2ResultListResponse,
    V2ResultRead,
    V2ResultWrite,
    V2RunAuditEventListResponse,
    V2SetupReferenceRequest,
)
from app.services.v2_entity_service import V2EntityService
from app.services.v2_experiment_service import V2ExperimentService
from app.services.v2_reporting_service import V2ReportingService
from app.services.v2_results_service import V2ResultsService

router = APIRouter(prefix="/api/v1", tags=["v2"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentAdmin = Annotated[User, Depends(get_current_admin_user)]


@router.get("/material-lots", response_model=V2EntityListResponse)
def list_material_lots(db: DbSession, _current_user: CurrentUser) -> V2EntityListResponse:
    return V2EntityService(db).list_entities("material_lot")


@router.post(
    "/material-lots",
    response_model=V2EntityRead,
    status_code=status.HTTP_201_CREATED,
)
def create_material_lot(
    payload: MaterialLotVersionPayload,
    db: DbSession,
    current_user: CurrentAdmin,
) -> V2EntityRead:
    return V2EntityService(db).create_entity("material_lot", payload, current_user)


@router.get("/material-lots/{entity_id}", response_model=V2EntityRead)
def get_material_lot(entity_id: UUID, db: DbSession, _current_user: CurrentUser) -> V2EntityRead:
    return V2EntityService(db).get_entity("material_lot", entity_id)


@router.get("/material-lots/{entity_id}/versions", response_model=V2EntityVersionListResponse)
def list_material_lot_versions(
    entity_id: UUID, db: DbSession, _current_user: CurrentUser
) -> V2EntityVersionListResponse:
    return V2EntityService(db).list_versions("material_lot", entity_id)


@router.post(
    "/material-lots/{entity_id}/versions",
    response_model=V2EntityVersionRead,
    status_code=status.HTTP_201_CREATED,
)
def append_material_lot_version(
    entity_id: UUID,
    payload: MaterialLotVersionPayload,
    db: DbSession,
    current_user: CurrentAdmin,
) -> V2EntityVersionRead:
    return V2EntityService(db).append_version("material_lot", entity_id, payload, current_user)


@router.get("/setups", response_model=V2EntityListResponse)
def list_setups(db: DbSession, _current_user: CurrentUser) -> V2EntityListResponse:
    return V2EntityService(db).list_entities("setup")


@router.post("/setups", response_model=V2EntityRead, status_code=status.HTTP_201_CREATED)
def create_setup(
    payload: SetupVersionPayload,
    db: DbSession,
    current_user: CurrentAdmin,
) -> V2EntityRead:
    return V2EntityService(db).create_entity("setup", payload, current_user)


@router.get("/setups/{entity_id}", response_model=V2EntityRead)
def get_setup(entity_id: UUID, db: DbSession, _current_user: CurrentUser) -> V2EntityRead:
    return V2EntityService(db).get_entity("setup", entity_id)


@router.get("/setups/{entity_id}/versions", response_model=V2EntityVersionListResponse)
def list_setup_versions(
    entity_id: UUID, db: DbSession, _current_user: CurrentUser
) -> V2EntityVersionListResponse:
    return V2EntityService(db).list_versions("setup", entity_id)


@router.post(
    "/setups/{entity_id}/versions",
    response_model=V2EntityVersionRead,
    status_code=status.HTTP_201_CREATED,
)
def append_setup_version(
    entity_id: UUID,
    payload: SetupVersionPayload,
    db: DbSession,
    current_user: CurrentAdmin,
) -> V2EntityVersionRead:
    return V2EntityService(db).append_version("setup", entity_id, payload, current_user)


@router.get("/instruments", response_model=V2EntityListResponse)
def list_instruments(db: DbSession, _current_user: CurrentUser) -> V2EntityListResponse:
    return V2EntityService(db).list_entities("instrument")


@router.post("/instruments", response_model=V2EntityRead, status_code=status.HTTP_201_CREATED)
def create_instrument(
    payload: InstrumentVersionPayload,
    db: DbSession,
    current_user: CurrentAdmin,
) -> V2EntityRead:
    return V2EntityService(db).create_entity("instrument", payload, current_user)


@router.get("/instruments/{entity_id}", response_model=V2EntityRead)
def get_instrument(entity_id: UUID, db: DbSession, _current_user: CurrentUser) -> V2EntityRead:
    return V2EntityService(db).get_entity("instrument", entity_id)


@router.get("/instruments/{entity_id}/versions", response_model=V2EntityVersionListResponse)
def list_instrument_versions(
    entity_id: UUID, db: DbSession, _current_user: CurrentUser
) -> V2EntityVersionListResponse:
    return V2EntityService(db).list_versions("instrument", entity_id)


@router.post(
    "/instruments/{entity_id}/versions",
    response_model=V2EntityVersionRead,
    status_code=status.HTTP_201_CREATED,
)
def append_instrument_version(
    entity_id: UUID,
    payload: InstrumentVersionPayload,
    db: DbSession,
    current_user: CurrentAdmin,
) -> V2EntityVersionRead:
    return V2EntityService(db).append_version("instrument", entity_id, payload, current_user)


@router.post("/experiments", response_model=V2ExperimentRead, status_code=status.HTTP_201_CREATED)
def create_v2_experiment(
    payload: V2ExperimentCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> V2ExperimentRead:
    return V2ExperimentService(db).create_run(payload, current_user)


@router.get("/experiments", response_model=V2ExperimentListResponse)
def list_v2_experiments(
    db: DbSession,
    current_user: CurrentUser,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    query: str | None = Query(default=None, max_length=200),
    material_system: str | None = Query(default=None, max_length=100),
    operator: str | None = Query(default=None, max_length=120),
    date_from: date | None = None,
    date_to: date | None = None,
    status_filter: Annotated[list[ExperimentStatus] | None, Query(alias="status")] = None,
) -> V2ExperimentListResponse:
    return V2ExperimentService(db).list_runs(
        current_user,
        page=page,
        page_size=page_size,
        query_text=query,
        material_system=material_system,
        operator=operator,
        date_from=date_from,
        date_to=date_to,
        status_filters=status_filter,
    )


@router.get("/experiments/{run_id}", response_model=V2ExperimentRead)
def get_v2_experiment(run_id: UUID, db: DbSession, current_user: CurrentUser) -> V2ExperimentRead:
    return V2ExperimentService(db).get_run(run_id, current_user)


@router.get(
    "/experiments/{run_id}/audit-events",
    response_model=V2RunAuditEventListResponse,
)
def list_run_audit_events(
    run_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> V2RunAuditEventListResponse:
    return V2ExperimentService(db).list_audit_events(run_id, current_user)


@router.get("/experiments/{run_id}/export")
def export_run_json(
    run_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> Response:
    content, filename = V2ReportingService(db).export_run_json(run_id, current_user)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/exports/runs")
def export_runs_zip(
    db: DbSession,
    current_user: CurrentUser,
    query: str | None = Query(default=None, max_length=200),
    material_system: str | None = Query(default=None, max_length=100),
    operator: str | None = Query(default=None, max_length=120),
    date_from: date | None = None,
    date_to: date | None = None,
    status_filter: Annotated[list[ExperimentStatus] | None, Query(alias="status")] = None,
) -> Response:
    content, filename = V2ReportingService(db).export_runs_zip(
        current_user,
        query_text=query,
        material_system=material_system,
        operator=operator,
        date_from=date_from,
        date_to=date_to,
        status_filters=status_filter,
    )
    return Response(
        content=content,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/experiments/{run_id}/lock", response_model=V2ExperimentRead)
def lock_v2_experiment(run_id: UUID, db: DbSession, current_user: CurrentUser) -> V2ExperimentRead:
    return V2ExperimentService(db).lock(run_id, current_user)


@router.post("/experiments/{run_id}/unlock", response_model=V2ExperimentRead)
def unlock_v2_experiment(
    run_id: UUID, db: DbSession, current_user: CurrentUser
) -> V2ExperimentRead:
    return V2ExperimentService(db).unlock(run_id, current_user)


@router.post("/experiments/{run_id}/invalidate", response_model=V2ExperimentRead)
def invalidate_v2_experiment(
    run_id: UUID, payload: V2InvalidateRequest, db: DbSession, current_user: CurrentUser
) -> V2ExperimentRead:
    return V2ExperimentService(db).invalidate(run_id, payload.reason, current_user)


@router.put("/experiments/{run_id}/not-characterized", response_model=V2ExperimentRead)
def set_v2_experiment_not_characterized(
    run_id: UUID,
    payload: V2NotCharacterizedRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> V2ExperimentRead:
    return V2ExperimentService(db).set_not_characterized(run_id, payload.confirmed, current_user)


@router.put("/experiments/{run_id}/setup-reference", response_model=V2ExperimentRead)
def set_v2_setup_reference(
    run_id: UUID,
    payload: V2SetupReferenceRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> V2ExperimentRead:
    return V2ExperimentService(db).set_setup_reference(
        run_id,
        payload.setup_id,
        payload.version,
        payload.tube_usage_history.model_dump(),
        current_user,
    )


@router.put("/experiments/{run_id}/modules/{module_key}", response_model=V2ModulePayloadRead)
def upsert_v2_module(
    run_id: UUID,
    module_key: str,
    payload: V2ModulePayloadUpsert,
    db: DbSession,
    current_user: CurrentUser,
) -> V2ModulePayloadRead:
    return V2ExperimentService(db).upsert_module(run_id, module_key, payload, current_user)


@router.get("/experiments/{run_id}/modules/{module_key}", response_model=V2ModulePayloadRead)
def get_v2_module(
    run_id: UUID,
    module_key: str,
    db: DbSession,
    current_user: CurrentUser,
) -> V2ModulePayloadRead:
    return V2ExperimentService(db).get_module(run_id, module_key, current_user)


@router.get(
    "/experiments/{run_id}/characterization-records",
    response_model=CharacterizationRecordListResponse,
)
def list_characterization_records(
    run_id: UUID, db: DbSession, current_user: CurrentUser
) -> CharacterizationRecordListResponse:
    return V2ResultsService(db).list_characterization_records(run_id, current_user)


@router.post(
    "/experiments/{run_id}/characterization-records",
    response_model=CharacterizationRecordRead,
    status_code=status.HTTP_201_CREATED,
)
def create_characterization_record(
    run_id: UUID,
    payload: CharacterizationRecordCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> CharacterizationRecordRead:
    return V2ResultsService(db).create_characterization_record(run_id, payload, current_user)


@router.patch(
    "/characterization-records/{record_id}",
    response_model=CharacterizationRecordRead,
)
def update_characterization_record(
    record_id: UUID,
    payload: CharacterizationRecordUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> CharacterizationRecordRead:
    return V2ResultsService(db).update_characterization_record(record_id, payload, current_user)


@router.delete("/characterization-records/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_characterization_record(
    record_id: UUID, db: DbSession, current_user: CurrentUser
) -> None:
    V2ResultsService(db).delete_characterization_record(record_id, current_user)


@router.get(
    "/samples/{sample_id}/measured-products",
    response_model=MeasuredProductListResponse,
)
def list_measured_products(
    sample_id: UUID, db: DbSession, current_user: CurrentUser
) -> MeasuredProductListResponse:
    return V2ResultsService(db).list_measured_products(sample_id, current_user)


@router.post(
    "/samples/{sample_id}/measured-products",
    response_model=MeasuredProductRead,
    status_code=status.HTTP_201_CREATED,
)
def create_measured_product(
    sample_id: UUID,
    payload: MeasuredProductCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> MeasuredProductRead:
    return V2ResultsService(db).create_measured_product(sample_id, payload, current_user)


@router.patch("/measured-products/{product_id}", response_model=MeasuredProductRead)
def update_measured_product(
    product_id: UUID,
    payload: MeasuredProductUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> MeasuredProductRead:
    return V2ResultsService(db).update_measured_product(product_id, payload, current_user)


@router.delete("/measured-products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_measured_product(product_id: UUID, db: DbSession, current_user: CurrentUser) -> None:
    V2ResultsService(db).delete_measured_product(product_id, current_user)


@router.get("/samples/{sample_id}/results", response_model=V2ResultListResponse)
def list_results(
    sample_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> V2ResultListResponse:
    return V2ResultsService(db).list_results(sample_id, current_user)


@router.post(
    "/samples/{sample_id}/results",
    response_model=V2ResultRead,
    status_code=status.HTTP_201_CREATED,
)
def create_result(
    sample_id: UUID,
    payload: V2ResultWrite,
    db: DbSession,
    current_user: CurrentUser,
) -> V2ResultRead:
    return V2ResultsService(db).create_result(sample_id, payload, current_user)


@router.put("/results/{result_id}", response_model=V2ResultRead)
def update_result(
    result_id: UUID,
    payload: V2ResultWrite,
    db: DbSession,
    current_user: CurrentUser,
) -> V2ResultRead:
    return V2ResultsService(db).update_result(result_id, payload, current_user)


@router.delete("/results/{result_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_result(result_id: UUID, db: DbSession, current_user: CurrentUser) -> None:
    V2ResultsService(db).delete_result(result_id, current_user)
