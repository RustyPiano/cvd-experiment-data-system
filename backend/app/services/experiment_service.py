from datetime import UTC, date, datetime
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus, QualityLabel
from app.models.module_payload import (
    ExperimentModuleKey,
    ExperimentModulePayload,
    normalize_module_payload,
)
from app.models.user import User, UserRole
from app.repositories.experiment_repository import ExperimentRepository
from app.repositories.module_payload_repository import ModulePayloadRepository
from app.schemas.audit import AuditEventListResponse
from app.schemas.experiment import (
    ExperimentAnalysisExportRead,
    ExperimentCreate,
    ExperimentExportRead,
    ExperimentInvalidateRequest,
    ExperimentListResponse,
    ExperimentRead,
    ExperimentUpdate,
)
from app.schemas.experiment_validation import ExperimentValidationResponse
from app.schemas.module_payload import (
    ExperimentModulePayloadListResponse,
    ExperimentModulePayloadRead,
    ExperimentModulePayloadUpsert,
    validate_module_payload,
)
from app.services.audit_service import AuditService
from app.services.experiment_export_service import ExperimentExportService
from app.services.experiment_validation_service import (
    ExperimentValidationFailed,
    ExperimentValidationService,
)
from app.services.sample_service import SampleService


class ExperimentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)
        self.module_payloads = ModulePayloadRepository(db)
        self.audit = AuditService(db)
        self.exporter = ExperimentExportService(db)
        self.sample_service = SampleService(db)
        self.validation = ExperimentValidationService(db)

    def list_experiments(
        self,
        *,
        current_user: User,
        mine: bool = False,
        status_filter: str | None = None,
        material_system: str | None = None,
        query_text: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> ExperimentListResponse:
        status_filters = self._parse_status_filters(status_filter)
        items, total = self.experiments.list_visible(
            current_user=current_user,
            mine=mine,
            status_filters=status_filters,
            material_system=material_system,
            query_text=query_text,
            page=page,
            page_size=page_size,
        )
        return ExperimentListResponse(
            items=[ExperimentRead.model_validate(item) for item in items],
            total=total,
            page=page,
            page_size=page_size,
        )

    def create_experiment(self, payload: ExperimentCreate, current_user: User) -> ExperimentRead:
        if current_user.role == UserRole.VIEWER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

        created = self._create_experiment_with_retry(
            experiment_date=payload.experiment_date,
            build_experiment=lambda run_code: ExperimentRun(
                run_code=run_code,
                owner_id=current_user.id,
                experiment_type=payload.experiment_type,
                material_system=payload.material_system,
                experiment_date=payload.experiment_date,
                objective=payload.objective,
                status=ExperimentStatus.DRAFT,
                quality_label=QualityLabel.UNKNOWN,
            ),
        )
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=created.id,
            action="create",
            before_json=None,
            after_json=self._serialize_experiment(created),
        )
        self.db.commit()
        return ExperimentRead.model_validate(created)

    def get_experiment(self, experiment_id: UUID, current_user: User) -> ExperimentRead:
        experiment = self._get_visible_experiment(experiment_id, current_user)
        return ExperimentRead.model_validate(experiment)

    def validate_experiment(
        self,
        experiment_id: UUID,
        current_user: User,
    ) -> ExperimentValidationResponse:
        experiment = self._get_owned_experiment(experiment_id, current_user)
        return self.validation.validate_experiment(experiment)

    def update_experiment(
        self,
        experiment_id: UUID,
        payload: ExperimentUpdate,
        current_user: User,
    ) -> ExperimentRead:
        experiment = self._get_owned_experiment(experiment_id, current_user)
        if experiment.status != ExperimentStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only draft experiments can be updated",
            )

        before = self._serialize_experiment(experiment)
        updates = payload.model_dump(exclude_unset=True)
        for field, value in updates.items():
            if field == "experiment_type" and value is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="experiment_type cannot be null",
                )
            if field == "experiment_date" and value is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="experiment_date cannot be null",
                )
            setattr(experiment, field, value)
        saved = self.experiments.save(experiment)
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=saved.id,
            action="update",
            before_json=before,
            after_json=self._serialize_experiment(saved),
        )
        self.db.commit()
        return ExperimentRead.model_validate(saved)

    def submit_experiment(self, experiment_id: UUID, current_user: User) -> ExperimentRead:
        experiment = self._get_owned_experiment(experiment_id, current_user)
        if experiment.status != ExperimentStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only draft experiments can be submitted",
            )
        validation_result = self.validation.validate_experiment(experiment)
        if not validation_result.ok:
            raise ExperimentValidationFailed(validation_result)

        before = self._serialize_experiment(experiment)
        experiment.status = ExperimentStatus.SUBMITTED
        experiment.submitted_at = datetime.now(UTC)
        saved = self.experiments.save(experiment)
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=saved.id,
            action="submit",
            before_json=before,
            after_json=self._serialize_experiment(saved),
        )
        self.db.commit()
        return ExperimentRead.model_validate(saved)

    def lock_experiment(self, experiment_id: UUID, current_user: User) -> ExperimentRead:
        experiment = self._get_owned_experiment(experiment_id, current_user)
        if experiment.status != ExperimentStatus.SUBMITTED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only submitted experiments can be locked",
            )

        before = self._serialize_experiment(experiment)
        experiment.status = ExperimentStatus.LOCKED
        experiment.locked_at = datetime.now(UTC)
        saved = self.experiments.save(experiment)
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=saved.id,
            action="lock",
            before_json=before,
            after_json=self._serialize_experiment(saved),
        )
        self.db.commit()
        return ExperimentRead.model_validate(saved)

    def return_to_draft(self, experiment_id: UUID, current_user: User) -> ExperimentRead:
        experiment = self._get_owned_experiment(experiment_id, current_user)
        if experiment.status != ExperimentStatus.SUBMITTED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only submitted experiments can be returned to draft",
            )

        before = self._serialize_experiment(experiment)
        experiment.status = ExperimentStatus.DRAFT
        experiment.submitted_at = None
        experiment.locked_at = None
        saved = self.experiments.save(experiment)
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=saved.id,
            action="return_to_draft",
            before_json=before,
            after_json=self._serialize_experiment(saved),
        )
        self.db.commit()
        return ExperimentRead.model_validate(saved)

    def invalidate_experiment(
        self,
        experiment_id: UUID,
        payload: ExperimentInvalidateRequest,
        current_user: User,
    ) -> ExperimentRead:
        experiment = self._get_owned_experiment(experiment_id, current_user)
        if experiment.status == ExperimentStatus.INVALID:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Invalid experiments cannot be changed",
            )
        if experiment.status == ExperimentStatus.LOCKED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Locked experiments can only be cloned",
            )

        before = self._serialize_experiment(experiment)
        experiment.status = ExperimentStatus.INVALID
        experiment.invalid_reason = payload.reason
        saved = self.experiments.save(experiment)
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=saved.id,
            action="invalidate",
            before_json=before,
            after_json=self._serialize_experiment(saved),
            reason=payload.reason,
        )
        self.db.commit()
        return ExperimentRead.model_validate(saved)

    def clone_experiment(self, experiment_id: UUID, current_user: User) -> ExperimentRead:
        if current_user.role == UserRole.VIEWER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

        source = self._get_visible_experiment(experiment_id, current_user)
        if source.status in {ExperimentStatus.DRAFT, ExperimentStatus.INVALID}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only submitted or locked experiments can be cloned",
            )
        if source.owner_id != current_user.id and source.status != ExperimentStatus.LOCKED:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        created = self._create_experiment_with_retry(
            experiment_date=date.today(),
            build_experiment=lambda run_code: ExperimentRun(
                run_code=run_code,
                owner_id=current_user.id,
                derived_from_run_id=source.id,
                experiment_type=source.experiment_type,
                material_system=source.material_system,
                experiment_date=date.today(),
                objective=source.objective,
                status=ExperimentStatus.DRAFT,
                quality_label=QualityLabel.UNKNOWN,
                summary_result=None,
                invalid_reason=None,
            ),
        )
        self.module_payloads.clone_for_run(
            source_run_id=source.id,
            target_run_id=created.id,
            exclude_module_keys={
                ExperimentModuleKey.BASIC_INFO.value,
                ExperimentModuleKey.PROCESS_OBSERVATION.value,
                ExperimentModuleKey.RESULT_SUMMARY.value,
            },
        )
        self._apply_clone_payload_rules(source=source, created=created, current_user=current_user)
        self.sample_service.clone_samples(
            source_experiment=source,
            target_experiment=created,
            current_user=current_user,
        )
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=created.id,
            action="create",
            before_json=None,
            after_json=self._serialize_experiment(created),
        )
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=created.id,
            action="clone",
            before_json=self._serialize_experiment(source),
            after_json=self._serialize_experiment(created),
        )
        self.db.commit()
        return ExperimentRead.model_validate(created)

    def list_audit_events(self, experiment_id: UUID, current_user: User) -> AuditEventListResponse:
        experiment = self._get_visible_experiment(experiment_id, current_user)
        return self.audit.list_events(entity_type="experiment_run", entity_id=experiment.id)

    def export_experiment(
        self,
        experiment_id: UUID,
        current_user: User,
    ) -> ExperimentExportRead:
        experiment = self._get_visible_experiment(experiment_id, current_user)
        return self.exporter.build_json_export(experiment)

    def export_experiment_analysis(
        self,
        experiment_id: UUID,
        current_user: User,
    ) -> ExperimentAnalysisExportRead:
        experiment = self._get_visible_experiment(experiment_id, current_user)
        return self.exporter.build_analysis_export(experiment)

    def export_experiment_excel(self, experiment_id: UUID, current_user: User) -> bytes:
        experiment = self._get_visible_experiment(experiment_id, current_user)
        export_payload = self.exporter.build_json_export(experiment)
        return self.exporter.build_excel_bytes(export_payload)

    def list_modules(
        self,
        experiment_id: UUID,
        current_user: User,
    ) -> ExperimentModulePayloadListResponse:
        experiment = self._get_visible_experiment(experiment_id, current_user)
        items = self.module_payloads.list_by_run(experiment.id)
        return ExperimentModulePayloadListResponse(
            items=[self._to_module_payload_read(item) for item in items],
            total=len(items),
        )

    def get_module(
        self,
        experiment_id: UUID,
        module_key: ExperimentModuleKey,
        current_user: User,
    ) -> ExperimentModulePayloadRead:
        experiment = self._get_visible_experiment(experiment_id, current_user)
        payload = self.module_payloads.get_by_run_and_key(experiment.id, module_key.value)
        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Module payload not found",
            )
        return self._to_module_payload_read(payload)

    def upsert_module(
        self,
        experiment_id: UUID,
        module_key: ExperimentModuleKey,
        payload: ExperimentModulePayloadUpsert,
        current_user: User,
    ) -> ExperimentModulePayloadRead:
        experiment = self._get_owned_experiment(experiment_id, current_user)
        if experiment.status != ExperimentStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only draft experiments can be updated",
            )

        existing = self.module_payloads.get_by_run_and_key(experiment.id, module_key.value)
        before = self._serialize_module_payload(existing)
        saved = self._upsert_module_payload(
            experiment_id=experiment.id,
            module_key=module_key,
            payload=payload,
        )
        if module_key == ExperimentModuleKey.SUBSTRATES:
            self.sample_service.sync_substrate_samples(
                experiment=experiment,
                current_user=current_user,
                substrates_payload=saved.payload_json,
            )
        if module_key == ExperimentModuleKey.RESULT_SUMMARY:
            self._sync_result_summary_quality_label(experiment, saved.payload_json)
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=experiment.id,
            action="update_module",
            before_json=before,
            after_json=self._serialize_module_payload(saved),
            reason=module_key.value,
        )
        self.db.commit()
        return ExperimentModulePayloadRead.model_validate(saved)

    def _upsert_module_payload(
        self,
        *,
        experiment_id: UUID,
        module_key: ExperimentModuleKey,
        payload: ExperimentModulePayloadUpsert,
    ) -> ExperimentModulePayload:
        attempts = 0
        while True:
            attempts += 1
            existing = self.module_payloads.get_by_run_and_key(experiment_id, module_key.value)
            target = existing or ExperimentModulePayload(
                experiment_run_id=experiment_id,
                module_key=module_key.value,
            )
            target.schema_version = payload.schema_version
            normalized_payload = normalize_module_payload(module_key.value, payload.payload_json)
            try:
                target.payload_json = validate_module_payload(
                    module_key.value,
                    normalized_payload,
                )
            except ValidationError as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=exc.errors(),
                ) from exc

            try:
                return self.module_payloads.save(target)
            except IntegrityError as exc:
                self.db.rollback()
                if not self._is_retryable_integrity_error(exc, {"module_key", "experiment_run_id"}):
                    raise
                if attempts >= 2:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Failed to save module payload",
                    ) from exc

    def _create_experiment_with_retry(
        self,
        *,
        experiment_date: date,
        build_experiment,
    ) -> ExperimentRun:
        attempts = 0
        while True:
            attempts += 1
            try:
                run_code = self.experiments.next_run_code(experiment_date)
                experiment = build_experiment(run_code)
                return self.experiments.create(experiment)
            except IntegrityError as exc:
                self.db.rollback()
                if not self._is_retryable_integrity_error(exc, {"run_code"}):
                    raise
                if attempts >= 3:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Failed to allocate run code",
                    ) from exc

    def _apply_clone_payload_rules(
        self,
        *,
        source: ExperimentRun,
        created: ExperimentRun,
        current_user: User,
    ) -> None:
        self._upsert_module_payload_json(
            experiment_id=created.id,
            module_key=ExperimentModuleKey.BASIC_INFO,
            payload_json={
                "operator_id": str(current_user.id),
                "experiment_type": source.experiment_type,
                "material_system": source.material_system,
                "experiment_date": created.experiment_date.isoformat(),
                "objective": source.objective,
            },
        )

        cloned_environment = self.module_payloads.get_by_run_and_key(
            created.id,
            ExperimentModuleKey.ENVIRONMENT.value,
        )
        if cloned_environment is not None and isinstance(cloned_environment.payload_json, dict):
            cloned_environment.payload_json = normalize_module_payload(
                ExperimentModuleKey.ENVIRONMENT.value,
                {
                    "sample_env": cloned_environment.payload_json.get("sample_env"),
                    "abnormal_note": "",
                },
            )
            self.module_payloads.save(cloned_environment)

        cloned_precheck = self.module_payloads.get_by_run_and_key(
            created.id,
            ExperimentModuleKey.PRECHECK.value,
        )
        if cloned_precheck is not None:
            cloned_precheck.payload_json = normalize_module_payload(
                ExperimentModuleKey.PRECHECK.value,
                {
                    "seal_intact": None,
                    "risk_note": "",
                },
            )
            self.module_payloads.save(cloned_precheck)

        cloned_characterization = self.module_payloads.get_by_run_and_key(
            created.id,
            ExperimentModuleKey.CHARACTERIZATION.value,
        )
        if cloned_characterization is not None and isinstance(
            cloned_characterization.payload_json, dict
        ):
            normalized_payload = normalize_module_payload(
                ExperimentModuleKey.CHARACTERIZATION.value,
                cloned_characterization.payload_json,
            )
            methods = normalized_payload.get("methods")
            if isinstance(methods, list):
                normalized_payload["methods"] = [
                    {**method, "result": ""} for method in methods if isinstance(method, dict)
                ]
            cloned_characterization.payload_json = normalized_payload
            self.module_payloads.save(cloned_characterization)

        reset_result_summary = self._upsert_module_payload_json(
            experiment_id=created.id,
            module_key=ExperimentModuleKey.RESULT_SUMMARY,
            payload_json={
                "summary_result": "",
                "quality_label": QualityLabel.UNKNOWN.value,
                "next_step": "",
            },
        )
        self._sync_result_summary_quality_label(created, reset_result_summary.payload_json)

    def _get_visible_experiment(self, experiment_id: UUID, current_user: User) -> ExperimentRun:
        experiment = self.experiments.get_by_id(experiment_id)
        if experiment is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Experiment not found",
            )

        if current_user.role == UserRole.ADMIN:
            return experiment
        if current_user.role == UserRole.MEMBER:
            if experiment.owner_id == current_user.id:
                return experiment
            if experiment.status in {ExperimentStatus.SUBMITTED, ExperimentStatus.LOCKED}:
                return experiment
        elif experiment.status in {ExperimentStatus.SUBMITTED, ExperimentStatus.LOCKED}:
            return experiment

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")

    def _get_owned_experiment(self, experiment_id: UUID, current_user: User) -> ExperimentRun:
        experiment = self.experiments.get_by_id(experiment_id)
        if experiment is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Experiment not found",
            )
        if current_user.role != UserRole.ADMIN and experiment.owner_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return experiment

    def _serialize_experiment(self, experiment: ExperimentRun) -> dict:
        return {
            "id": str(experiment.id),
            "run_code": experiment.run_code,
            "owner_id": str(experiment.owner_id),
            "derived_from_run_id": (
                str(experiment.derived_from_run_id) if experiment.derived_from_run_id else None
            ),
            "derived_from_run_code": experiment.derived_from_run_code,
            "experiment_type": experiment.experiment_type,
            "material_system": experiment.material_system,
            "experiment_date": experiment.experiment_date.isoformat(),
            "objective": experiment.objective,
            "status": experiment.status.value,
            "quality_label": experiment.quality_label.value,
            "summary_result": experiment.summary_result,
            "invalid_reason": experiment.invalid_reason,
            "submitted_at": (
                experiment.submitted_at.isoformat() if experiment.submitted_at else None
            ),
            "locked_at": experiment.locked_at.isoformat() if experiment.locked_at else None,
        }

    def _serialize_module_payload(self, payload: ExperimentModulePayload | None) -> dict | None:
        if payload is None:
            return None
        return {
            "id": str(payload.id),
            "experiment_run_id": str(payload.experiment_run_id),
            "module_key": payload.module_key,
            "schema_version": payload.schema_version,
            "payload_json": normalize_module_payload(payload.module_key, payload.payload_json),
            "note": payload.note,
        }

    def _to_module_payload_read(
        self,
        payload: ExperimentModulePayload,
    ) -> ExperimentModulePayloadRead:
        return ExperimentModulePayloadRead(
            id=payload.id,
            experiment_run_id=payload.experiment_run_id,
            module_key=payload.module_key,
            schema_version=payload.schema_version,
            payload_json=normalize_module_payload(payload.module_key, payload.payload_json),
            note=payload.note,
            created_at=payload.created_at,
            updated_at=payload.updated_at,
        )

    def _sync_result_summary_quality_label(
        self,
        experiment: ExperimentRun,
        payload_json: dict,
    ) -> None:
        quality_label = payload_json.get("quality_label")
        try:
            experiment.quality_label = QualityLabel(str(quality_label))
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid quality_label",
            ) from exc

    def _upsert_module_payload_json(
        self,
        *,
        experiment_id: UUID,
        module_key: ExperimentModuleKey,
        payload_json: dict,
        schema_version: str = "cvd_v1",
    ) -> ExperimentModulePayload:
        return self._upsert_module_payload(
            experiment_id=experiment_id,
            module_key=module_key,
            payload=ExperimentModulePayloadUpsert(
                payload_json=payload_json,
                schema_version=schema_version,
            ),
        )

    def _is_number(self, value: object) -> bool:
        return isinstance(value, int | float) and not isinstance(value, bool)

    def _is_retryable_integrity_error(
        self,
        exc: IntegrityError,
        keywords: set[str],
    ) -> bool:
        message = str(exc).lower()
        return any(keyword in message for keyword in keywords)

    def _parse_status_filters(self, status_filter: str | None) -> list[ExperimentStatus] | None:
        if status_filter is None:
            return None

        parsed_values = [item.strip() for item in status_filter.split(",") if item.strip()]
        if not parsed_values:
            return None

        try:
            return [ExperimentStatus(item) for item in parsed_values]
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid experiment status filter",
            ) from exc
