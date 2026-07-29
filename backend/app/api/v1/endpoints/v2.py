from __future__ import annotations

from datetime import date
from typing import Annotated, NoReturn
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
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
from app.schemas.scientific import (
    ContainerInstanceCreate,
    ContainerInstanceRead,
    CreateCorrectionDraftRequest,
    DatasetQuery,
    DatasetQueryResponse,
    EquipmentComponentCreate,
    EquipmentComponentRead,
    LifecycleEventCreate,
    LifecycleEventRead,
    MeasurementBundleCreate,
    MeasurementListResponse,
    MeasurementSummaryRead,
    ReviewRunRequest,
    RunRevisionListResponse,
    RunRevisionRead,
    SampleLineageRead,
    SetupComponentBindingCreate,
    TransformationRunCreate,
    TransformationRunRead,
)
from app.schemas.user import UserRead
from app.schemas.v2 import (
    CharacterizationRecordListResponse,
    MeasuredProductListResponse,
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
    V2RunAuditEventListResponse,
    V2SetupReferenceRequest,
)
from app.services.dataset_query_service import DatasetQueryService
from app.services.reference_data_service import ReferenceDataService
from app.services.scientific_measurement_service import ScientificMeasurementService
from app.services.scientific_sample_service import ScientificSampleService
from app.services.v2_entity_service import V2EntityService
from app.services.v2_experiment_service import V2ExperimentService
from app.services.v2_reporting_service import V2ReportingService
from app.services.v2_results_service import V2ResultsService

router = APIRouter(prefix="/api/v1", tags=["v2"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentAdmin = Annotated[User, Depends(get_current_admin_user)]


@router.get("/contributors", response_model=list[UserRead])
def list_contributors(db: DbSession, _current_user: CurrentUser) -> list[User]:
    return list(db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.name)))


@router.get("/container-instances", response_model=list[ContainerInstanceRead])
def list_container_instances(
    db: DbSession,
    _current_user: CurrentUser,
    material_lot_id: UUID | None = None,
) -> list[ContainerInstanceRead]:
    return ReferenceDataService(db).list_containers(material_lot_id)


@router.post(
    "/container-instances",
    response_model=ContainerInstanceRead,
    status_code=status.HTTP_201_CREATED,
)
def create_container_instance(
    payload: ContainerInstanceCreate,
    db: DbSession,
    current_user: CurrentAdmin,
) -> ContainerInstanceRead:
    return ReferenceDataService(db).create_container(payload, current_user)


@router.get("/equipment-components", response_model=list[EquipmentComponentRead])
def list_equipment_components(
    db: DbSession,
    _current_user: CurrentUser,
) -> list[EquipmentComponentRead]:
    return ReferenceDataService(db).list_components()


@router.post(
    "/equipment-components",
    response_model=EquipmentComponentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_equipment_component(
    payload: EquipmentComponentCreate,
    db: DbSession,
    current_user: CurrentAdmin,
) -> EquipmentComponentRead:
    return ReferenceDataService(db).create_component(payload, current_user)


@router.post(
    "/setup-versions/{setup_version_id}/components",
    status_code=status.HTTP_204_NO_CONTENT,
)
def bind_setup_component(
    setup_version_id: UUID,
    payload: SetupComponentBindingCreate,
    db: DbSession,
    current_user: CurrentAdmin,
) -> None:
    ReferenceDataService(db).bind_setup_component(
        setup_version_id,
        payload,
        current_user,
    )


@router.post(
    "/equipment-components/{component_id}/events",
    response_model=LifecycleEventRead,
    status_code=status.HTTP_201_CREATED,
)
def create_equipment_lifecycle_event(
    component_id: UUID,
    payload: LifecycleEventCreate,
    db: DbSession,
    current_user: CurrentAdmin,
) -> LifecycleEventRead:
    return ReferenceDataService(db).create_equipment_event(
        component_id,
        payload,
        current_user,
    )


@router.post(
    "/instruments/{instrument_id}/events",
    response_model=LifecycleEventRead,
    status_code=status.HTTP_201_CREATED,
)
def create_instrument_lifecycle_event(
    instrument_id: UUID,
    payload: LifecycleEventCreate,
    db: DbSession,
    current_user: CurrentAdmin,
) -> LifecycleEventRead:
    return ReferenceDataService(db).create_instrument_event(
        instrument_id,
        payload,
        current_user,
    )


@router.post("/datasets/query", response_model=DatasetQueryResponse)
def query_dataset(
    payload: DatasetQuery,
    db: DbSession,
    current_user: CurrentUser,
) -> DatasetQueryResponse:
    return DatasetQueryService(db).query(payload, current_user)


@router.get("/measurements", response_model=MeasurementListResponse)
def list_measurements(
    db: DbSession,
    current_user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
    run_id: UUID | None = None,
    sample_id: UUID | None = None,
    method_profile: str | None = Query(default=None, max_length=128),
) -> MeasurementListResponse:
    return ScientificMeasurementService(db).list_measurements(
        current_user,
        limit=limit,
        cursor=cursor,
        run_id=run_id,
        sample_id=sample_id,
        method_profile=method_profile,
    )


@router.post(
    "/measurements",
    response_model=MeasurementSummaryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_measurement(
    payload: MeasurementBundleCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> MeasurementSummaryRead:
    return ScientificMeasurementService(db).create_bundle(payload, current_user)


@router.post(
    "/transformations",
    response_model=TransformationRunRead,
    status_code=status.HTTP_201_CREATED,
)
def create_transformation(
    payload: TransformationRunCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> TransformationRunRead:
    return ScientificSampleService(db).create_transformation(payload, current_user)


@router.get("/samples/{sample_id}/lineage", response_model=SampleLineageRead)
def get_sample_lineage(
    sample_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> SampleLineageRead:
    return ScientificSampleService(db).lineage(sample_id, current_user)


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
    target_material_system: str | None = Query(default=None, max_length=100),
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
        material_system=target_material_system,
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
    revision_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> Response:
    content, filename = V2ReportingService(db).export_run_json(
        run_id,
        revision_id,
        current_user,
    )
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/experiments/{run_id}/draft-export")
def export_draft_run_json(
    run_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> Response:
    content, filename = V2ReportingService(db).export_draft_json(run_id, current_user)
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
    target_material_system: str | None = Query(default=None, max_length=100),
    operator: str | None = Query(default=None, max_length=120),
    date_from: date | None = None,
    date_to: date | None = None,
    status_filter: Annotated[list[ExperimentStatus] | None, Query(alias="status")] = None,
) -> Response:
    content, filename = V2ReportingService(db).export_runs_zip(
        current_user,
        query_text=query,
        material_system=target_material_system,
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


@router.get(
    "/experiments/{run_id}/revisions",
    response_model=RunRevisionListResponse,
)
def list_run_revisions(
    run_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> RunRevisionListResponse:
    return V2ExperimentService(db).list_revisions(run_id, current_user)


@router.post(
    "/experiments/{run_id}/correction-drafts",
    response_model=V2ExperimentRead,
)
def create_run_correction_draft(
    run_id: UUID,
    payload: CreateCorrectionDraftRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> V2ExperimentRead:
    return V2ExperimentService(db).create_correction_draft(
        run_id,
        payload.reason,
        current_user,
    )


@router.post(
    "/experiments/{run_id}/review",
    response_model=RunRevisionRead,
)
def review_run(
    run_id: UUID,
    payload: ReviewRunRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> RunRevisionRead:
    return V2ExperimentService(db).review(run_id, payload.note, current_user)


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


def _legacy_result_write_gone() -> NoReturn:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Legacy result writes are retired; use /api/v1/measurements",
    )


@router.post("/experiments/{run_id}/characterization-records", response_model=None)
def create_characterization_record(
    run_id: UUID,
    _current_user: CurrentUser,
) -> NoReturn:
    _legacy_result_write_gone()


@router.patch("/characterization-records/{record_id}", response_model=None)
def update_characterization_record(
    record_id: UUID,
    _current_user: CurrentUser,
) -> NoReturn:
    _legacy_result_write_gone()


@router.delete("/characterization-records/{record_id}", response_model=None)
def delete_characterization_record(
    record_id: UUID,
    _current_user: CurrentUser,
) -> NoReturn:
    _legacy_result_write_gone()


@router.get(
    "/samples/{sample_id}/measured-products",
    response_model=MeasuredProductListResponse,
)
def list_measured_products(
    sample_id: UUID, db: DbSession, current_user: CurrentUser
) -> MeasuredProductListResponse:
    return V2ResultsService(db).list_measured_products(sample_id, current_user)


@router.post("/samples/{sample_id}/measured-products", response_model=None)
def create_measured_product(
    sample_id: UUID,
    _current_user: CurrentUser,
) -> NoReturn:
    _legacy_result_write_gone()


@router.patch("/measured-products/{product_id}", response_model=None)
def update_measured_product(
    product_id: UUID,
    _current_user: CurrentUser,
) -> NoReturn:
    _legacy_result_write_gone()


@router.delete("/measured-products/{product_id}", response_model=None)
def delete_measured_product(product_id: UUID, _current_user: CurrentUser) -> NoReturn:
    _legacy_result_write_gone()


@router.get("/samples/{sample_id}/results", response_model=V2ResultListResponse)
def list_results(
    sample_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> V2ResultListResponse:
    return V2ResultsService(db).list_results(sample_id, current_user)


@router.post("/samples/{sample_id}/results", response_model=None)
def create_result(
    sample_id: UUID,
    _current_user: CurrentUser,
) -> NoReturn:
    _legacy_result_write_gone()


@router.put("/results/{result_id}", response_model=None)
def update_result(
    result_id: UUID,
    _current_user: CurrentUser,
) -> NoReturn:
    _legacy_result_write_gone()


@router.delete("/results/{result_id}", response_model=None)
def delete_result(result_id: UUID, _current_user: CurrentUser) -> NoReturn:
    _legacy_result_write_gone()
