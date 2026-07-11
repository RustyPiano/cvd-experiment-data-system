from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
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
from app.services.v2_entity_service import V2EntityService
from app.services.v2_entity_snapshot_service import apply_setup_reference
from app.services.v2_field_source import (
    SCHEMA_VERSION,
    missing,
    stage_types_with_group,
)
from app.services.v2_r0_service import missing_r0_fields
from app.services.v2_result_status_service import refresh_result_missing_todo


class V2ExperimentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)
        self.module_payloads = ModulePayloadRepository(db)
        self.entities = V2EntityService(db)
        self.audit = AuditService(db)

    def create_run(self, payload: V2ExperimentCreate, current_user: User) -> V2ExperimentRead:
        run_code = payload.run_code or self.experiments.next_run_code(payload.started_at.date())
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
                # structure_type defaults to "本征" here; the user refines it in the form later.
                {"chemical_formula": payload.chemical_formula, "structure_type": "本征"},
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
        return self._run_read(self._get_visible_run(run_id, current_user))

    def submit(self, run_id: UUID, current_user: User) -> V2ExperimentRead:
        run = self._get_owned_run(run_id, current_user)
        self._require_status(run, ExperimentStatus.DRAFT)
        self._require_r0(run)
        run.submitted_at = datetime.now(UTC)
        return self._transition(run, ExperimentStatus.SUBMITTED, "submit", current_user)

    def lock(self, run_id: UUID, current_user: User) -> V2ExperimentRead:
        run = self._get_owned_run(run_id, current_user)
        self._require_status(run, ExperimentStatus.SUBMITTED)
        self._require_r0(run)
        run.locked_at = datetime.now(UTC)
        self._transition(run, ExperimentStatus.LOCKED, "lock", current_user, commit=False)
        refresh_result_missing_todo(self.db, run)
        self.db.commit()
        self.db.refresh(run)
        return self._run_read(run)

    def unlock(self, run_id: UUID, current_user: User) -> V2ExperimentRead:
        run = self._get_visible_run(run_id, current_user)
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
        run = self._get_owned_run(run_id, current_user)
        self._require_status(run, ExperimentStatus.SUBMITTED)
        run.submitted_at = None
        run.locked_at = None
        return self._transition(run, ExperimentStatus.DRAFT, "return_to_draft", current_user)

    def invalidate(self, run_id: UUID, reason: str, current_user: User) -> V2ExperimentRead:
        run = self._get_owned_run(run_id, current_user)
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
        run = self._get_owned_run(run_id, current_user)
        self._ensure_process_editable(run)
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
        self._ensure_process_editable(run)
        try:
            validated = validate_v2_module_payload(module_key, payload.payload_json)
        # pydantic ValidationError is a subclass of ValueError, so this catches both.
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=str(exc),
            ) from exc
        if module_key == "process_steps":
            self._validate_external_field_requirement(run, validated)
        if module_key == "target_product":
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
        run = self._get_visible_run(run_id, current_user)
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
        run = self.experiments.get_visible_by_id(
            run_id, current_user=current_user, schema_version=SCHEMA_VERSION
        )
        if run is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Experiment not found",
            )
        return run

    def _get_owned_run(self, run_id: UUID, current_user: User) -> ExperimentRun:
        run = self._get_visible_run(run_id, current_user)
        if current_user.role != UserRole.ADMIN and run.owner_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return run

    def _require_status(self, run: ExperimentRun, expected: ExperimentStatus) -> None:
        if run.status != expected:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail=f"Experiment must be {expected.value}"
            )

    def _require_r0(self, run: ExperimentRun) -> None:
        missing_fields = missing_r0_fields(run)
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

    def _ensure_process_editable(self, run: ExperimentRun) -> None:
        if run.status in {ExperimentStatus.LOCKED, ExperimentStatus.INVALID}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Locked or invalid experiments cannot be edited",
            )

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
