from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus, QualityLabel
from app.models.module_payload import ExperimentModulePayload
from app.models.sample import Sample
from app.models.user import User, UserRole
from app.models.v2_entities import (
    Instrument,
    InstrumentVersion,
    MaterialLot,
    MaterialLotVersion,
    Setup,
    SetupVersion,
)
from app.models.v2_results import CharacterizationRecord, MeasuredProduct
from app.repositories.experiment_repository import ExperimentRepository
from app.repositories.module_payload_repository import ModulePayloadRepository
from app.repositories.v2_repository import V2EntityRepository, V2ResultRepository
from app.schemas.generated.v2_module_payload import validate_v2_module_payload
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
    V2EntityVersionPayload,
    V2EntityVersionRead,
    V2ExperimentCreate,
    V2ExperimentListResponse,
    V2ExperimentRead,
    V2ModulePayloadRead,
    V2ModulePayloadUpsert,
)
from app.services.v2_entity_snapshot_service import (
    apply_setup_reference,
    instrument_version_snapshot,
)
from app.services.v2_field_source import (
    SCHEMA_VERSION,
    condition_local_key,
    condition_matches,
    entity_fields_by_key,
    load_field_source,
    missing,
    stage_types_with_group,
)


@dataclass(frozen=True)
class EntityConfig:
    key: str
    entity_model: type
    version_model: type
    columns: tuple[str, ...]


ENTITY_CONFIGS = {
    "material_lot": EntityConfig(
        key="material_lot",
        entity_model=MaterialLot,
        version_model=MaterialLotVersion,
        columns=("lot_category", "substance_name", "chemical_formula", "batch_number"),
    ),
    "setup": EntityConfig(
        key="setup",
        entity_model=Setup,
        version_model=SetupVersion,
        columns=("setup_code", "setup_name", "zone_count", "orientation", "coordinate_system"),
    ),
    "instrument": EntityConfig(
        key="instrument",
        entity_model=Instrument,
        version_model=InstrumentVersion,
        columns=("instrument_code", "name_type"),
    ),
}


class V2EntityService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.doc = load_field_source()
        self.fields = entity_fields_by_key(self.doc)

    def list_entities(self, kind: str) -> V2EntityListResponse:
        repo = self._repo(kind)
        items = [
            self._entity_read(kind, entity, repo.latest_version(entity.id))
            for entity in repo.list_entities()
        ]
        return V2EntityListResponse(items=items, total=len(items))

    def create_entity(self, kind: str, payload: V2EntityVersionPayload) -> V2EntityRead:
        repo = self._repo(kind)
        entity = repo.create_entity()
        version = self._build_version(kind, entity.id, 1, payload)
        repo.save_version(version)
        self.db.commit()
        return self._entity_read(kind, entity, version)

    def get_entity(self, kind: str, entity_id: UUID) -> V2EntityRead:
        repo = self._repo(kind)
        entity = repo.get_entity(entity_id)
        if entity is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")
        return self._entity_read(kind, entity, repo.latest_version(entity.id))

    def list_versions(self, kind: str, entity_id: UUID) -> V2EntityVersionListResponse:
        repo = self._repo(kind)
        if repo.get_entity(entity_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")
        items = [self._version_read(kind, version) for version in repo.list_versions(entity_id)]
        return V2EntityVersionListResponse(items=items, total=len(items))

    def append_version(
        self, kind: str, entity_id: UUID, payload: V2EntityVersionPayload
    ) -> V2EntityVersionRead:
        repo = self._repo(kind)
        if repo.get_entity(entity_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")
        version = self._build_version(kind, entity_id, repo.next_version(entity_id), payload)
        repo.save_version(version)
        self.db.commit()
        return self._version_read(kind, version)

    def get_version(self, kind: str, entity_id: UUID, version: int) -> Any:
        row = self._repo(kind).get_version(entity_id, version)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
        return row

    def _repo(self, kind: str) -> V2EntityRepository:
        config = ENTITY_CONFIGS[kind]
        return V2EntityRepository(self.db, config.entity_model, config.version_model)

    def _build_version(
        self,
        kind: str,
        entity_id: UUID,
        version_number: int,
        payload: V2EntityVersionPayload,
    ) -> Any:
        config = ENTITY_CONFIGS[kind]
        data = payload.model_dump()
        allowed = {field["key"] for field in self.fields[kind]} - {"version"}
        unknown = sorted(set(data) - allowed)
        if unknown:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Unknown {kind} field keys: {', '.join(unknown)}",
            )
        self._validate_entity_payload(kind, data)
        column_values = {key: data[key] for key in config.columns}
        attrs = {key: value for key, value in data.items() if key not in config.columns}
        return config.version_model(
            entity_id=entity_id,
            version=version_number,
            attrs=attrs,
            **column_values,
        )

    def _validate_entity_payload(self, kind: str, data: dict[str, Any]) -> None:
        for field in self.fields[kind]:
            key = field["key"]
            level = field["requirement"]["level"]
            if level == "required" and key != "version" and missing(data.get(key)):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=f"{key} is required",
                )
            condition = field["requirement"].get("condition")
            local_key = condition_local_key(field, condition, self.doc)
            if (
                level == "conditional_required"
                and condition
                and local_key
                and condition_matches(condition, data.get(local_key))
                and missing(data.get(key))
            ):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=f"{key} is conditionally required",
                )

    def _entity_read(self, kind: str, entity: Any, latest_version: Any | None) -> V2EntityRead:
        return V2EntityRead(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            latest_version=self._version_read(kind, latest_version) if latest_version else None,
        )

    def _version_read(self, kind: str, version: Any) -> V2EntityVersionRead:
        config = ENTITY_CONFIGS[kind]
        data = {key: getattr(version, key) for key in config.columns}
        data.update(version.attrs or {})
        return V2EntityVersionRead(
            id=version.id,
            entity_id=version.entity_id,
            version=version.version,
            data=data,
            created_at=version.created_at,
        )


class V2ExperimentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)
        self.module_payloads = ModulePayloadRepository(db)
        self.entities = V2EntityService(db)
        self.results = V2ResultRepository(db)

    def create_run(self, payload: V2ExperimentCreate, current_user: User) -> V2ExperimentRead:
        run_code = payload.run_code or self.experiments.next_run_code(payload.started_at.date())
        run = ExperimentRun(
            run_code=run_code,
            owner_id=current_user.id,
            experiment_type=SCHEMA_VERSION,
            schema_version=SCHEMA_VERSION,
            material_system=payload.chemical_formula,
            experiment_date=payload.started_at.date(),
            objective=payload.objective,
            status=ExperimentStatus.DRAFT,
            quality_label=QualityLabel.UNKNOWN,
        )
        self.db.add(run)
        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Run code already exists",
            ) from exc
        self._save_v2_payload(
            run.id,
            "basic_info",
            {
                "started_at": payload.started_at.isoformat(),
                "synthesis_method": payload.synthesis_method,
                "operator": payload.operator,
                "run_code": run.run_code,
            },
        )
        if payload.chemical_formula:
            self._save_v2_payload(
                run.id,
                "target_product",
                {"chemical_formula": payload.chemical_formula, "structure_type": "本征"},
            )
        self.db.commit()
        self.db.refresh(run)
        return self._run_read(run)

    def list_runs(self, current_user: User) -> V2ExperimentListResponse:
        items, _ = self.experiments.list_visible(
            current_user=current_user,
            status_filters=None,
            page=1,
            page_size=100,
        )
        runs = [item for item in items if item.schema_version == SCHEMA_VERSION]
        return V2ExperimentListResponse(
            items=[self._run_read(item) for item in runs],
            total=len(runs),
        )

    def get_run(self, run_id: UUID, current_user: User) -> V2ExperimentRead:
        return self._run_read(self._get_visible_run(run_id, current_user))

    def set_setup_reference(
        self,
        run_id: UUID,
        setup_id: UUID,
        setup_version: int,
        current_user: User,
    ) -> V2ExperimentRead:
        run = self._get_owned_run(run_id, current_user)
        self._ensure_editable(run)
        version = self.entities.get_version("setup", setup_id, setup_version)
        apply_setup_reference(run, version)
        self._save_v2_payload(
            run.id,
            "equipment",
            {
                "setup_ref": str(version.entity_id),
                "brand_model": version.attrs.get("brand_model") if version.attrs else None,
                "wall_type": version.attrs.get("wall_type") if version.attrs else None,
                "zone_count": version.zone_count,
                "orientation": version.orientation,
                "coordinate_system": version.coordinate_system,
            },
        )
        self.db.commit()
        self.db.refresh(run)
        return self._run_read(run)

    def upsert_module(
        self,
        run_id: UUID,
        module_key: str,
        payload: V2ModulePayloadUpsert,
        current_user: User,
    ) -> V2ModulePayloadRead:
        run = self._get_owned_run(run_id, current_user)
        self._ensure_editable(run)
        try:
            validated = validate_v2_module_payload(module_key, payload.payload_json)
        except (ValidationError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=str(exc),
            ) from exc
        if module_key == "process_steps":
            self._validate_external_field_requirement(run, validated)
        saved = self._save_v2_payload(run.id, module_key, validated)
        self.db.commit()
        return self._module_read(saved)

    def get_module(self, run_id: UUID, module_key: str, current_user: User) -> V2ModulePayloadRead:
        run = self._get_visible_run(run_id, current_user)
        payload = self.module_payloads.get_by_run_and_key(run.id, module_key)
        if payload is None or payload.schema_version != SCHEMA_VERSION:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Module payload not found",
            )
        return self._module_read(payload)

    def list_characterization_records(
        self, run_id: UUID, current_user: User
    ) -> CharacterizationRecordListResponse:
        run = self._get_visible_run(run_id, current_user)
        items = self.results.list_characterization_records(run.id)
        return CharacterizationRecordListResponse(
            items=[CharacterizationRecordRead.model_validate(item) for item in items],
            total=len(items),
        )

    def create_characterization_record(
        self,
        run_id: UUID,
        payload: CharacterizationRecordCreate,
        current_user: User,
    ) -> CharacterizationRecordRead:
        run = self._get_owned_run(run_id, current_user)
        self._ensure_editable(run)
        self._sample_for_run(payload.sample_id, run.id)
        instrument_snapshot = None
        if payload.instrument_id and payload.instrument_version:
            version = self.entities.get_version(
                "instrument", payload.instrument_id, payload.instrument_version
            )
            instrument_snapshot = instrument_version_snapshot(version)
        record = CharacterizationRecord(
            experiment_run_id=run.id,
            sample_id=payload.sample_id,
            instrument_id=payload.instrument_id,
            instrument_version=payload.instrument_version,
            instrument_snapshot_json=instrument_snapshot,
            method_instrument=payload.method_instrument,
            test_conditions=payload.test_conditions,
            raw_data=payload.raw_data,
            attrs=payload.attrs,
        )
        saved = self.results.save_characterization_record(record)
        self.db.commit()
        return CharacterizationRecordRead.model_validate(saved)

    def update_characterization_record(
        self,
        record_id: UUID,
        payload: CharacterizationRecordUpdate,
        current_user: User,
    ) -> CharacterizationRecordRead:
        record = self._owned_characterization_record(record_id, current_user)
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(record, key, value)
        saved = self.results.save_characterization_record(record)
        self.db.commit()
        return CharacterizationRecordRead.model_validate(saved)

    def delete_characterization_record(self, record_id: UUID, current_user: User) -> None:
        record = self._owned_characterization_record(record_id, current_user)
        self.results.delete(record)
        self.db.commit()

    def list_measured_products(
        self, sample_id: UUID, current_user: User
    ) -> MeasuredProductListResponse:
        sample = self._visible_sample(sample_id, current_user)
        items = self.results.list_measured_products(sample.id)
        return MeasuredProductListResponse(
            items=[MeasuredProductRead.model_validate(item) for item in items],
            total=len(items),
        )

    def create_measured_product(
        self,
        sample_id: UUID,
        payload: MeasuredProductCreate,
        current_user: User,
    ) -> MeasuredProductRead:
        sample = self._owned_sample(sample_id, current_user)
        if payload.characterization_record_id:
            record = self.results.get_characterization_record(payload.characterization_record_id)
            if record is None or record.sample_id != sample.id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="characterization_record_id must belong to the sample",
                )
        product = MeasuredProduct(sample_id=sample.id, **payload.model_dump())
        saved = self.results.save_measured_product(product)
        self.db.commit()
        return MeasuredProductRead.model_validate(saved)

    def update_measured_product(
        self,
        product_id: UUID,
        payload: MeasuredProductUpdate,
        current_user: User,
    ) -> MeasuredProductRead:
        product = self._owned_measured_product(product_id, current_user)
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(product, key, value)
        saved = self.results.save_measured_product(product)
        self.db.commit()
        return MeasuredProductRead.model_validate(saved)

    def delete_measured_product(self, product_id: UUID, current_user: User) -> None:
        product = self._owned_measured_product(product_id, current_user)
        self.results.delete(product)
        self.db.commit()

    def _save_v2_payload(
        self, run_id: UUID, module_key: str, payload_json: dict[str, Any]
    ) -> ExperimentModulePayload:
        existing = self.module_payloads.get_by_run_and_key(run_id, module_key)
        payload = existing or ExperimentModulePayload(
            experiment_run_id=run_id,
            module_key=module_key,
        )
        payload.schema_version = SCHEMA_VERSION
        payload.payload_json = payload_json
        return self.module_payloads.save(payload)

    def _validate_external_field_requirement(
        self, run: ExperimentRun, payload_json: dict[str, Any]
    ) -> None:
        # Cross-entity condition from YAML:
        # field_params is required when 装置Setup.外场装置 != 无. The generated
        # module model cannot see the referenced Setup snapshot, so service layer owns it.
        snapshot = run.setup_ref_snapshot_json or {}
        attrs = snapshot.get("attrs_snapshot") or {}
        field_devices = attrs.get("field_devices")
        if missing(field_devices) or field_devices == "无" or field_devices == ["无"]:
            return
        external_stage_types = stage_types_with_group("external_field")
        for step in payload_json.get("items") or []:
            if step.get("stage_type") in external_stage_types and missing(step.get("field_params")):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=(
                        "field_params is required when referenced setup has external field devices"
                    ),
                )

    def _get_visible_run(self, run_id: UUID, current_user: User) -> ExperimentRun:
        run = self.experiments.get_by_id(run_id)
        if run is None or run.schema_version != SCHEMA_VERSION:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Experiment not found",
            )
        if current_user.role == UserRole.ADMIN or run.owner_id == current_user.id:
            return run
        if run.status in {ExperimentStatus.SUBMITTED, ExperimentStatus.LOCKED}:
            return run
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")

    def _get_owned_run(self, run_id: UUID, current_user: User) -> ExperimentRun:
        run = self._get_visible_run(run_id, current_user)
        if current_user.role != UserRole.ADMIN and run.owner_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return run

    def _ensure_editable(self, run: ExperimentRun) -> None:
        if run.status in {ExperimentStatus.LOCKED, ExperimentStatus.INVALID}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Locked or invalid experiments cannot be edited",
            )

    def _visible_sample(self, sample_id: UUID, current_user: User) -> Sample:
        sample = self.db.get(Sample, sample_id)
        if sample is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
        self._get_visible_run(sample.experiment_run_id, current_user)
        return sample

    def _owned_sample(self, sample_id: UUID, current_user: User) -> Sample:
        sample = self.db.get(Sample, sample_id)
        if sample is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
        self._get_owned_run(sample.experiment_run_id, current_user)
        return sample

    def _sample_for_run(self, sample_id: UUID, run_id: UUID) -> Sample:
        sample = self.db.get(Sample, sample_id)
        if sample is None or sample.experiment_run_id != run_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
        return sample

    def _owned_characterization_record(
        self, record_id: UUID, current_user: User
    ) -> CharacterizationRecord:
        record = self.results.get_characterization_record(record_id)
        if record is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
        self._get_owned_run(record.experiment_run_id, current_user)
        return record

    def _owned_measured_product(self, product_id: UUID, current_user: User) -> MeasuredProduct:
        product = self.results.get_measured_product(product_id)
        if product is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
        self._owned_sample(product.sample_id, current_user)
        return product

    def _run_read(self, run: ExperimentRun) -> V2ExperimentRead:
        return V2ExperimentRead(
            id=run.id,
            run_code=run.run_code,
            owner_id=run.owner_id,
            schema_version=run.schema_version or SCHEMA_VERSION,
            experiment_type=run.experiment_type,
            material_system=run.material_system,
            experiment_date=run.experiment_date,
            objective=run.objective,
            status=run.status.value,
            setup_ref=run.setup_ref,
            setup_ref_version=run.setup_ref_version,
            setup_ref_snapshot_json=run.setup_ref_snapshot_json,
            created_at=run.created_at,
            updated_at=run.updated_at,
        )

    def _module_read(self, payload: ExperimentModulePayload) -> V2ModulePayloadRead:
        return V2ModulePayloadRead(
            id=payload.id,
            experiment_run_id=payload.experiment_run_id,
            module_key=payload.module_key,
            schema_version=payload.schema_version,
            payload_json=payload.payload_json,
            created_at=payload.created_at,
            updated_at=payload.updated_at,
        )
