from datetime import UTC, date, datetime
from uuid import UUID

from fastapi import HTTPException, status
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
from app.services.audit_service import AuditService
from app.services.experiment_export_service import ExperimentExportService
from app.services.sample_service import SampleService


class ExperimentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)
        self.module_payloads = ModulePayloadRepository(db)
        self.audit = AuditService(db)
        self.exporter = ExperimentExportService(db)
        self.sample_service = SampleService(db)

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
        self._validate_submit(experiment)

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
                ExperimentModuleKey.CHARACTERIZATION.value,
                ExperimentModuleKey.PROCESS_OBSERVATION.value,
                ExperimentModuleKey.RESULT_SUMMARY.value,
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
            target.payload_json = normalize_module_payload(module_key.value, payload.payload_json)

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

    def _validate_submit(self, experiment: ExperimentRun) -> None:
        if self._collect_submit_errors(experiment):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Submit validation failed",
            )

    def _collect_submit_errors(self, experiment: ExperimentRun) -> list[str]:
        errors: list[str] = []
        if (
            experiment.experiment_date is None
            or experiment.owner_id is None
            or not experiment.experiment_type
            or not experiment.material_system
        ):
            errors.append("Missing required main fields")

        module_payloads = {
            item.module_key: item.payload_json
            for item in self.module_payloads.list_by_run(experiment.id)
        }

        precursor_payload = module_payloads.get(ExperimentModuleKey.PRECURSORS.value, {})
        precursor_items = (
            precursor_payload.get("items") if isinstance(precursor_payload, dict) else None
        )
        if not isinstance(precursor_items, list) or not precursor_items:
            errors.append("At least one precursor is required")
        elif not all(isinstance(item, dict) for item in precursor_items):
            errors.append("Each precursor item must be an object")

        furnace_payload = module_payloads.get(ExperimentModuleKey.FURNACE_PROGRAM.value, {})
        furnace_zones = furnace_payload.get("zones") if isinstance(furnace_payload, dict) else None
        if not isinstance(furnace_zones, list) or not furnace_zones:
            errors.append("At least one furnace zone is required")
        else:
            for zone in furnace_zones:
                if not isinstance(zone, dict):
                    errors.append("Each furnace zone must be an object")
                    continue
                temperature_program = zone.get("temperature_program")
                if not isinstance(temperature_program, list) or not temperature_program:
                    errors.append("Each furnace zone must include a temperature program")
                    continue

                if not all(isinstance(point, dict) for point in temperature_program):
                    errors.append("Furnace program points must be objects")
                    continue
                time_points = [point.get("time_min") for point in temperature_program]
                if not all(self._is_number(value) for value in time_points):
                    errors.append("Furnace program time points must be numeric")
                    continue
                if any(
                    current <= previous
                    for previous, current in zip(time_points, time_points[1:], strict=False)
                ):
                    errors.append("Furnace program time points must be strictly increasing")
                    break

        gas_payload = module_payloads.get(ExperimentModuleKey.GAS_PROGRAM.value, {})
        gas_segments = gas_payload.get("segments") if isinstance(gas_payload, dict) else None
        if isinstance(gas_segments, list) and gas_segments:
            normalized_segments: list[tuple[float, float]] = []
            for segment in gas_segments:
                if not isinstance(segment, dict):
                    errors.append("Gas segments must be objects")
                    continue
                start = segment.get("start_min")
                end = segment.get("end_min")
                if not self._is_number(start) or not self._is_number(end):
                    errors.append("Gas segment boundaries must be numeric")
                    continue
                start_value = float(start)
                end_value = float(end)
                if end_value <= start_value:
                    errors.append("Gas segment end time must be greater than start time")
                normalized_segments.append((start_value, end_value))

            normalized_segments.sort(key=lambda item: item[0])
            if any(
                current_start < previous_end
                for previous_end, (current_start, _current_end) in zip(
                    [segment[1] for segment in normalized_segments],
                    normalized_segments[1:],
                    strict=False,
                )
            ):
                errors.append("Gas segments must not overlap")

        precheck_payload = module_payloads.get(ExperimentModuleKey.PRECHECK.value, {})
        if (
            isinstance(precheck_payload, dict)
            and precheck_payload.get("seal_intact") is False
            and not str(precheck_payload.get("risk_note") or "").strip()
        ):
            errors.append("Risk note is required when seal integrity fails")

        return errors

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
