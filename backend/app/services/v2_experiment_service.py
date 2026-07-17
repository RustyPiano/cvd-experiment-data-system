from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.module_payload import ExperimentModulePayload
from app.models.user import User, UserRole
from app.repositories.experiment_repository import ExperimentRepository
from app.repositories.module_payload_repository import ModulePayloadRepository
from app.schemas.generated.v2_module_payload import validate_v2_module_payload
from app.schemas.v2 import (
    V2ExperimentCreate,
    V2ExperimentListResponse,
    V2ExperimentRead,
    V2ModulePayloadRead,
    V2ModulePayloadUpsert,
)
from app.services.audit_service import AuditService
from app.services.experiment_guards import (
    ensure_process_editable,
    get_owned_experiment,
    get_visible_experiment,
)
from app.services.v2_entity_service import V2EntityService
from app.services.v2_entity_snapshot_service import apply_setup_reference
from app.services.v2_field_source import (
    SCHEMA_VERSION,
    missing,
    stage_types_with_group,
)
from app.services.v2_r0_service import missing_r0_fields, missing_required_fields
from app.services.v2_result_status_service import refresh_result_missing_todo


class V2ExperimentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)
        self.module_payloads = ModulePayloadRepository(db)
        self.entities = V2EntityService(db)
        self.audit = AuditService(db)

    def create_run(self, payload: V2ExperimentCreate, current_user: User) -> V2ExperimentRead:
        attempts = 1 if payload.run_code else 4
        for attempt in range(attempts):
            try:
                run_code = payload.run_code or self.experiments.next_run_code(
                    payload.started_at.date()
                )
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=str(exc),
                ) from exc
            run = ExperimentRun(
                run_code=run_code,
                owner_id=current_user.id,
                schema_version=SCHEMA_VERSION,
                material_system=payload.chemical_formula,
                experiment_date=payload.started_at.date(),
                objective=payload.objective,
                status=ExperimentStatus.DRAFT,
            )
            self.db.add(run)
            try:
                self.db.flush()
                break
            except IntegrityError as exc:
                self.db.rollback()
                if attempt == attempts - 1:
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
                # structure_type defaults to "本征" here; the user refines it in the form later.
                {"chemical_formula": payload.chemical_formula, "structure_type": "本征"},
            )
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=run.id,
            action="create",
            before_json=None,
            after_json={"run_code": run.run_code, "status": run.status.value},
        )
        self.db.commit()
        self.db.refresh(run)
        return self._run_read(run)

    def list_runs(
        self, current_user: User, *, page: int = 1, page_size: int = 20
    ) -> V2ExperimentListResponse:
        runs, total = self.experiments.list_visible(
            current_user=current_user,
            status_filters=None,
            page=page,
            page_size=page_size,
            schema_version=SCHEMA_VERSION,
        )
        return V2ExperimentListResponse(
            items=[self._run_read(item) for item in runs],
            total=total,
        )

    def get_run(self, run_id: UUID, current_user: User) -> V2ExperimentRead:
        return self._run_read(
            get_visible_experiment(
                self.experiments, run_id, current_user, schema_version=SCHEMA_VERSION
            )
        )

    def submit(self, run_id: UUID, current_user: User) -> V2ExperimentRead:
        run = get_owned_experiment(
            self.experiments, run_id, current_user, schema_version=SCHEMA_VERSION
        )
        self._require_status(run, ExperimentStatus.DRAFT)
        self._require_r0(run)
        run.submitted_at = datetime.now(UTC)
        return self._transition(run, ExperimentStatus.SUBMITTED, "submit", current_user)

    def lock(self, run_id: UUID, current_user: User) -> V2ExperimentRead:
        run = get_owned_experiment(
            self.experiments, run_id, current_user, schema_version=SCHEMA_VERSION
        )
        self._require_status(run, ExperimentStatus.SUBMITTED)
        self._require_r0(run)
        run.locked_at = datetime.now(UTC)
        self._transition(run, ExperimentStatus.LOCKED, "lock", current_user, commit=False)
        refresh_result_missing_todo(self.db, run)
        self.db.commit()
        self.db.refresh(run)
        return self._run_read(run)

    def unlock(self, run_id: UUID, current_user: User) -> V2ExperimentRead:
        run = get_visible_experiment(
            self.experiments, run_id, current_user, schema_version=SCHEMA_VERSION
        )
        if current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
        self._require_status(run, ExperimentStatus.LOCKED)
        run.locked_at = None
        self._transition(run, ExperimentStatus.SUBMITTED, "unlock", current_user, commit=False)
        refresh_result_missing_todo(self.db, run)
        self.db.commit()
        self.db.refresh(run)
        return self._run_read(run)

    def return_to_draft(self, run_id: UUID, current_user: User) -> V2ExperimentRead:
        run = get_owned_experiment(
            self.experiments, run_id, current_user, schema_version=SCHEMA_VERSION
        )
        self._require_status(run, ExperimentStatus.SUBMITTED)
        run.submitted_at = None
        run.locked_at = None
        return self._transition(run, ExperimentStatus.DRAFT, "return_to_draft", current_user)

    def invalidate(self, run_id: UUID, reason: str, current_user: User) -> V2ExperimentRead:
        run = get_owned_experiment(
            self.experiments, run_id, current_user, schema_version=SCHEMA_VERSION
        )
        if run.status in {ExperimentStatus.INVALID, ExperimentStatus.LOCKED}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Experiment cannot be invalidated"
            )
        run.invalid_reason = reason
        return self._transition(
            run, ExperimentStatus.INVALID, "invalidate", current_user, reason=reason
        )

    def set_setup_reference(
        self,
        run_id: UUID,
        setup_id: UUID,
        setup_version: int,
        current_user: User,
    ) -> V2ExperimentRead:
        run = get_owned_experiment(
            self.experiments, run_id, current_user, schema_version=SCHEMA_VERSION
        )
        ensure_process_editable(run)
        before = {
            "setup_ref": str(run.setup_ref) if run.setup_ref else None,
            "setup_ref_version": run.setup_ref_version,
        }
        version = self.entities.get_version("setup", setup_id, setup_version)
        apply_setup_reference(run, version)
        self._save_v2_payload(
            run.id,
            "equipment",
            {
                "setup_ref": str(version.entity_id),
                "brand_model": version.attrs.get("brand_model"),
                "wall_type": version.attrs.get("wall_type"),
                "zone_count": version.zone_count,
                "orientation": version.orientation,
                "coordinate_system": version.coordinate_system,
            },
        )
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=run.id,
            action="set_setup_reference",
            before_json=before,
            after_json={
                "setup_ref": str(run.setup_ref),
                "setup_ref_version": run.setup_ref_version,
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
        run = get_owned_experiment(
            self.experiments, run_id, current_user, schema_version=SCHEMA_VERSION
        )
        ensure_process_editable(run)
        try:
            validated = validate_v2_module_payload(module_key, payload.payload_json)
        except ValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"invalid": self._validation_errors(exc)},
            ) from exc
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"invalid": [{"key": module_key, "reason": "value"}]},
            ) from exc
        if module_key == "basic_info":
            validated["run_code"] = run.run_code
            started_at = validated["started_at"]
            if not isinstance(started_at, str):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={"invalid": [{"key": "started_at", "reason": "type"}]},
                )
            try:
                run.experiment_date = datetime.fromisoformat(
                    started_at.replace("Z", "+00:00")
                ).date()
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={"invalid": [{"key": "started_at", "reason": "value"}]},
                ) from exc
        if module_key == "process_steps":
            self._validate_external_field_requirement(run, validated)
        if module_key == "target_product":
            chemical_formula = validated.get("chemical_formula")
            if chemical_formula is not None and not isinstance(chemical_formula, str):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={"invalid": [{"key": "chemical_formula", "reason": "type"}]},
                )
            if len(chemical_formula or "") > 64:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={"invalid": [{"key": "chemical_formula", "reason": "length"}]},
                )
            run.material_system = validated.get("chemical_formula") or None
        saved = self._save_v2_payload(run.id, module_key, validated)
        # Audit only the module key: payload snapshots are too noisy for routine upserts.
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=run.id,
            action="upsert_module",
            before_json=None,
            after_json={"module_key": module_key},
        )
        self.db.commit()
        return self._module_read(saved)

    def get_module(self, run_id: UUID, module_key: str, current_user: User) -> V2ModulePayloadRead:
        run = get_visible_experiment(
            self.experiments, run_id, current_user, schema_version=SCHEMA_VERSION
        )
        payload = self.module_payloads.get_by_run_and_key(run.id, module_key)
        if payload is None or payload.schema_version != SCHEMA_VERSION:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Module payload not found",
            )
        return self._module_read(payload)

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
        if isinstance(field_devices, list) and "无" in field_devices and field_devices != ["无"]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="无 must be the only external field device selection",
            )
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

    def _require_status(self, run: ExperimentRun, expected: ExperimentStatus) -> None:
        if run.status != expected:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail=f"Experiment must be {expected.value}"
            )

    def _require_r0(self, run: ExperimentRun) -> None:
        r0_fields = [{**item, "requirement": "r0"} for item in missing_r0_fields(run)]
        r0_keys = {item["key"] for item in r0_fields}
        required_fields = [
            {**item, "requirement": "required"}
            for item in missing_required_fields(run)
            if item["key"] not in r0_keys
        ]
        missing_fields = [*r0_fields, *required_fields]
        if missing_fields:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"missing": missing_fields},
            )

    def _transition(
        self,
        run: ExperimentRun,
        target: ExperimentStatus,
        action: str,
        actor: User,
        *,
        reason: str | None = None,
        commit: bool = True,
    ) -> V2ExperimentRead:
        before = {"status": run.status.value}
        run.status = target
        self.audit.record_event(
            actor=actor,
            entity_type="experiment_run",
            entity_id=run.id,
            action=action,
            before_json=before,
            after_json={"status": target.value},
            reason=reason,
        )
        if commit:
            self.db.commit()
            self.db.refresh(run)
        return self._run_read(run)

    def _run_read(self, run: ExperimentRun) -> V2ExperimentRead:
        return V2ExperimentRead(
            id=run.id,
            run_code=run.run_code,
            owner_id=run.owner_id,
            schema_version=run.schema_version,
            material_system=run.material_system,
            experiment_date=run.experiment_date,
            objective=run.objective,
            status=run.status.value,
            invalid_reason=run.invalid_reason,
            result_missing_todo=run.result_missing_todo,
            submitted_at=run.submitted_at,
            locked_at=run.locked_at,
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

    @staticmethod
    def _validation_errors(exc: ValidationError) -> list[dict[str, str]]:
        invalid = []
        for error in exc.errors():
            error_type = str(error["type"])
            reason = (
                "length"
                if any(token in error_type for token in ("length", "too_long", "too_short"))
                else "type"
                if "type" in error_type or "parsing" in error_type
                else "value"
            )
            loc = error.get("loc") or ("payload",)
            key = next((str(part) for part in reversed(loc) if isinstance(part, str)), "payload")
            invalid.append({"key": key, "reason": reason})
        return invalid
