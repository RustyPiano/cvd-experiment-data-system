from __future__ import annotations

from copy import deepcopy
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID, uuid4

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
    V2RunAuditEventListResponse,
    V2RunAuditEventRead,
)
from app.services.audit_service import AuditService
from app.services.experiment_guards import (
    ensure_process_editable,
    get_owned_experiment,
    get_visible_experiment,
)
from app.services.sample_service import SampleService
from app.services.v2_entity_service import V2EntityService
from app.services.v2_entity_snapshot_service import apply_setup_reference
from app.services.v2_field_source import (
    SCHEMA_VERSION,
    missing,
    stage_types_with_group,
)
from app.services.v2_r0_service import missing_r0_fields, missing_required_fields
from app.services.v2_result_status_service import (
    is_result_missing_todo,
    refresh_result_missing_todo,
)


class V2ExperimentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)
        self.module_payloads = ModulePayloadRepository(db)
        self.entities = V2EntityService(db)
        self.samples = SampleService(db)
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
        self,
        current_user: User,
        *,
        page: int = 1,
        page_size: int = 20,
        query_text: str | None = None,
        material_system: str | None = None,
        operator: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        status_filters: list[ExperimentStatus] | None = None,
    ) -> V2ExperimentListResponse:
        runs, total = self.experiments.list_visible(
            current_user=current_user,
            status_filters=status_filters,
            material_system=material_system,
            query_text=query_text,
            operator=operator,
            date_from=date_from,
            date_to=date_to,
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

    def list_audit_events(self, run_id: UUID, current_user: User) -> V2RunAuditEventListResponse:
        run = get_visible_experiment(
            self.experiments,
            run_id,
            current_user,
            schema_version=SCHEMA_VERSION,
        )
        events = self.audit.list_events(
            entity_type="experiment_run",
            entity_id=run.id,
        ).items
        actor_names: dict[UUID, str] = {}
        for actor_id in {event.actor_id for event in events}:
            actor = self.db.get(User, actor_id)
            actor_names[actor_id] = actor.name if actor else "Unknown user"
        return V2RunAuditEventListResponse(
            items=[
                V2RunAuditEventRead(
                    actor_name=actor_names[event.actor_id],
                    action=event.action,
                    reason=event.reason,
                    created_at=event.created_at,
                )
                for event in events
            ],
            total=len(events),
        )

    def lock(self, run_id: UUID, current_user: User) -> V2ExperimentRead:
        run = get_owned_experiment(
            self.experiments, run_id, current_user, schema_version=SCHEMA_VERSION
        )
        self._require_status(run, ExperimentStatus.DRAFT)
        self._require_r0(run)
        self.samples.sync_growth_samples(run, self._substrate_items(run.id), current_user)
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
        self._transition(run, ExperimentStatus.DRAFT, "unlock", current_user, commit=False)
        refresh_result_missing_todo(self.db, run)
        self.db.commit()
        self.db.refresh(run)
        return self._run_read(run)

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
            payload_json = deepcopy(payload.payload_json)
            substrate_source_ids: list[object | None] = []
            if module_key == "substrates":
                payload_json, substrate_source_ids = self._strip_substrate_source_ids(payload_json)
            validated = validate_v2_module_payload(module_key, payload_json)
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
        if module_key == "substrates":
            validated = self._attach_substrate_source_ids(
                run.id,
                validated,
                substrate_source_ids,
            )
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

    def set_not_characterized(
        self,
        run_id: UUID,
        confirmed: bool,
        current_user: User,
    ) -> V2ExperimentRead:
        run = get_visible_experiment(
            self.experiments, run_id, current_user, schema_version=SCHEMA_VERSION
        )
        self._require_status(run, ExperimentStatus.LOCKED)
        if (
            confirmed
            and run.not_characterized_at is None
            and not is_result_missing_todo(self.db, run)
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Run already has results",
            )
        before = {
            "not_characterized_by_id": (
                str(run.not_characterized_by_id) if run.not_characterized_by_id else None
            ),
            "not_characterized_at": (
                run.not_characterized_at.isoformat() if run.not_characterized_at else None
            ),
        }
        if confirmed:
            run.not_characterized_by_id = current_user.id
            run.not_characterized_at = datetime.now(UTC)
            action = "confirm_not_characterized"
        else:
            run.not_characterized_by_id = None
            run.not_characterized_at = None
            action = "clear_not_characterized"
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=run.id,
            action=action,
            before_json=before,
            after_json={
                "not_characterized_by_id": (
                    str(run.not_characterized_by_id) if run.not_characterized_by_id else None
                ),
                "not_characterized_at": (
                    run.not_characterized_at.isoformat() if run.not_characterized_at else None
                ),
            },
        )
        refresh_result_missing_todo(self.db, run)
        self.db.commit()
        self.db.refresh(run)
        return self._run_read(run)

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

    @staticmethod
    def _strip_substrate_source_ids(
        payload_json: dict[str, Any],
    ) -> tuple[dict[str, Any], list[object | None]]:
        source_ids: list[object | None] = []
        items = payload_json.get("items")
        if not isinstance(items, list):
            return payload_json, source_ids
        for item in items:
            source_ids.append(item.pop("source_id", None) if isinstance(item, dict) else None)
        return payload_json, source_ids

    def _attach_substrate_source_ids(
        self,
        run_id: UUID,
        payload_json: dict[str, Any],
        supplied_source_ids: list[object | None],
    ) -> dict[str, Any]:
        existing = self.module_payloads.get_by_run_and_key(run_id, "substrates")
        existing_items = (existing.payload_json.get("items") or []) if existing else []
        used: set[UUID] = set()
        for index, item in enumerate(payload_json.get("items") or []):
            candidate = supplied_source_ids[index] if index < len(supplied_source_ids) else None
            if candidate is None and index < len(existing_items):
                previous = existing_items[index]
                if isinstance(previous, dict):
                    candidate = previous.get("source_id")
            try:
                source_id = UUID(str(candidate)) if candidate is not None else uuid4()
            except (TypeError, ValueError, AttributeError) as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={"invalid": [{"key": "source_id", "reason": "value"}]},
                ) from exc
            if source_id in used:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={"invalid": [{"key": "source_id", "reason": "duplicate"}]},
                )
            used.add(source_id)
            item["source_id"] = str(source_id)
        return payload_json

    def _substrate_items(self, run_id: UUID) -> list[dict[str, Any]]:
        payload = self.module_payloads.get_by_run_and_key(run_id, "substrates")
        if payload is None:
            return []
        items = payload.payload_json.get("items") or []
        if all(isinstance(item, dict) and item.get("source_id") for item in items):
            return items
        normalized = self._attach_substrate_source_ids(run_id, deepcopy(payload.payload_json), [])
        payload.payload_json = normalized
        self.module_payloads.save(payload)
        return normalized.get("items") or []

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
        basic_info = next(
            (item.payload_json for item in run.module_payloads if item.module_key == "basic_info"),
            {},
        )
        return V2ExperimentRead(
            id=run.id,
            run_code=run.run_code,
            owner_id=run.owner_id,
            operator=basic_info.get("operator") or run.owner_name,
            schema_version=run.schema_version,
            material_system=run.material_system,
            experiment_date=run.experiment_date,
            objective=run.objective,
            status=run.status.value,
            invalid_reason=run.invalid_reason,
            result_missing_todo=run.result_missing_todo,
            locked_at=run.locked_at,
            not_characterized_by_id=run.not_characterized_by_id,
            not_characterized_at=run.not_characterized_at,
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
