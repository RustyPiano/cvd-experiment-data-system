from __future__ import annotations

from copy import deepcopy
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.module_payload import ExperimentModulePayload
from app.models.scientific import ProcessChannel, RunRevision, ScientificProcessEvent
from app.models.user import User
from app.repositories.experiment_repository import ExperimentRepository
from app.repositories.module_payload_repository import ModulePayloadRepository
from app.schemas.generated.v2_module_payload import validate_v2_module_payload
from app.schemas.scientific import RunRevisionListResponse, RunRevisionRead
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
from app.services.file_asset_service import FileAssetService
from app.services.sample_service import SampleService
from app.services.scientific_revision_service import (
    ScientificRevisionService,
    validate_scientific_module_payload,
)
from app.services.v2_entity_service import SUBSTRATE_FORMULAS, V2EntityService
from app.services.v2_entity_snapshot_service import (
    MATERIAL_LOT_PROJECTED_FIELDS,
    apply_setup_reference,
    material_lot_item_projection,
    material_lot_version_snapshot,
    missing_material_lot_projection_fields,
    setup_equipment_projection,
)
from app.services.v2_field_source import (
    SCHEMA_VERSION,
    canonical_option_value,
    normalize_offset_datetime,
    validate_chemical_formula,
)
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
        self.revisions = ScientificRevisionService(db)
        self.audit = AuditService(db)

    def create_run(self, payload: V2ExperimentCreate, current_user: User) -> V2ExperimentRead:
        started_at = normalize_offset_datetime(payload.started_at)
        try:
            chemical_formula = (
                validate_chemical_formula(payload.chemical_formula)
                if payload.chemical_formula
                else None
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"invalid": [{"key": "chemical_formula", "reason": "value"}]},
            ) from exc
        attempts = 1 if payload.run_code else 4
        for attempt in range(attempts):
            try:
                run_code = payload.run_code or self.experiments.next_run_code(started_at.date())
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=str(exc),
                ) from exc
            run = ExperimentRun(
                run_code=run_code,
                owner_id=current_user.id,
                schema_version=SCHEMA_VERSION,
                material_system=chemical_formula,
                experiment_date=started_at.date(),
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
        basic_info = {
            "started_at": started_at.isoformat(),
            "synthesis_method": "CVD",
            "run_code": run.run_code,
            "created_by_user_id": str(current_user.id),
            "performed_by_user_ids": [str(current_user.id)],
            "recorded_by_user_id": str(current_user.id),
            "precheck": {
                "checklist_version": "cvd-precheck-v1",
                "confirmed": bool(payload.precheck_confirmed),
                "confirmed_at": started_at.isoformat(),
            },
        }
        basic_info["ambient_temperature"] = payload.ambient_temperature.model_dump(
            mode="json",
            exclude_none=True,
        )
        basic_info["ambient_humidity"] = payload.ambient_humidity.model_dump(
            mode="json",
            exclude_none=True,
        )
        self._save_v2_payload(
            run.id,
            "basic_info",
            basic_info,
        )
        if chemical_formula:
            self._save_v2_payload(
                run.id,
                "target_product",
                {
                    "architecture_type": "single_region",
                    "material_regions": [
                        {
                            "region_key": "region_1",
                            "formula": chemical_formula,
                            "spatial_role": "single_region",
                        }
                    ],
                    "composition_relations": [],
                },
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
        run = self._locked_run(run.id)
        self._require_status(run, ExperimentStatus.DRAFT)
        validated_modules = self._validate_saved_modules_for_lock(run)
        try:
            revision = self.revisions.create_locked_revision(
                run,
                validated_modules,
                current_user,
            )
            self.samples.sync_growth_samples(
                run,
                self._substrate_items(run.id),
                current_user,
                revision.id,
            )
            run.locked_at = datetime.now(UTC)
            self._transition(run, ExperimentStatus.LOCKED, "lock", current_user, commit=False)
            refresh_result_missing_todo(self.db, run)
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Run was locked concurrently; reload and retry",
            ) from exc
        self.db.refresh(run)
        return self._run_read(run)

    def unlock(self, run_id: UUID, current_user: User) -> V2ExperimentRead:
        del run_id, current_user
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Unlock was replaced by immutable correction drafts",
        )

    def list_revisions(
        self,
        run_id: UUID,
        current_user: User,
    ) -> RunRevisionListResponse:
        run = get_visible_experiment(
            self.experiments,
            run_id,
            current_user,
            schema_version=SCHEMA_VERSION,
        )
        return self.revisions.list_revisions(run)

    def create_correction_draft(
        self,
        run_id: UUID,
        reason: str,
        current_user: User,
    ) -> V2ExperimentRead:
        run = get_visible_experiment(
            self.experiments,
            run_id,
            current_user,
            schema_version=SCHEMA_VERSION,
        )
        run = self._locked_run(run.id)
        self.revisions.create_correction_draft(run, reason, current_user)
        self.db.commit()
        self.db.refresh(run)
        return self._run_read(run)

    def review(
        self,
        run_id: UUID,
        note: str | None,
        current_user: User,
    ) -> RunRevisionRead:
        run = get_visible_experiment(
            self.experiments,
            run_id,
            current_user,
            schema_version=SCHEMA_VERSION,
        )
        run = self._locked_run(run.id)
        revision = self.revisions.review(run, current_user, note)
        self.db.commit()
        self.db.refresh(revision)
        return RunRevisionRead.model_validate(revision)

    def invalidate(self, run_id: UUID, reason: str, current_user: User) -> V2ExperimentRead:
        run = get_owned_experiment(
            self.experiments, run_id, current_user, schema_version=SCHEMA_VERSION
        )
        run = self._locked_run(run.id)
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
        tube_usage_history: dict[str, Any],
        current_user: User,
    ) -> V2ExperimentRead:
        run = get_owned_experiment(
            self.experiments, run_id, current_user, schema_version=SCHEMA_VERSION
        )
        run = self._locked_run(run.id)
        ensure_process_editable(run)
        before = {
            "setup_ref": str(run.setup_ref) if run.setup_ref else None,
            "setup_ref_version": run.setup_ref_version,
        }
        version = self.entities.get_version("setup", setup_id, setup_version)
        equipment = setup_equipment_projection(version)
        equipment.pop("setup_code", None)
        equipment.pop("setup_name", None)
        equipment = {key: value for key, value in equipment.items() if value is not None}
        equipment["tube_usage_history"] = tube_usage_history
        try:
            equipment = validate_v2_module_payload("equipment", equipment)
        except ValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"invalid": self._validation_errors(exc, "equipment")},
            ) from exc
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"invalid": [{"key": "equipment", "reason": "value"}]},
            ) from exc
        apply_setup_reference(run, version)
        self._save_v2_payload(run.id, "equipment", equipment)
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
        run = self._locked_run(run.id)
        ensure_process_editable(run)
        if module_key == "equipment":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Equipment is a read-only projection of the referenced Setup version",
            )
        if module_key == "pvd":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="PVD profiles are not released",
            )
        existing = self.module_payloads.get_by_run_and_key(run.id, module_key)
        before_payload = deepcopy(existing.payload_json) if existing else None
        try:
            payload_json = deepcopy(payload.payload_json)
            substrate_source_ids: list[object | None] = []
            if module_key == "basic_info":
                payload_json["run_code"] = run.run_code
                payload_json["created_by_user_id"] = str(run.owner_id)
            if module_key == "substrates":
                payload_json = self._prefill_material_lot_fields(module_key, payload_json)
                payload_json, substrate_source_ids = self._strip_substrate_source_ids(payload_json)
            if module_key in {
                "basic_info",
                "target_product",
                "precursors",
                "process_steps",
                "process_events",
            }:
                validated = validate_scientific_module_payload(module_key, payload_json)
            else:
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
            started_at = validated["started_at"]
            if not isinstance(started_at, str):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={"invalid": [{"key": "started_at", "reason": "type"}]},
                )
            try:
                normalized_started_at = normalize_offset_datetime(started_at)
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={"invalid": [{"key": "started_at", "reason": "value"}]},
                ) from exc
            run.experiment_date = normalized_started_at.date()
        if module_key == "substrates":
            validated = self._freeze_material_lot_references(module_key, validated)
            self._validate_zone_indices(run, module_key, validated)
            self._validate_substrate_piece_labels(validated)
        if module_key == "target_product":
            run.material_system = " / ".join(
                region["formula"] for region in validated["material_regions"]
            )[:64]
        if module_key == "substrates":
            validated = self._attach_substrate_source_ids(
                run.id,
                validated,
                substrate_source_ids,
            )
        saved = self._save_v2_payload(run.id, module_key, validated)
        if module_key in {"process_steps", "process_events"}:
            self._prune_unreferenced_process_files(
                run.id,
                module_key,
                validated,
                current_user,
            )
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=run.id,
            action="upsert_module",
            before_json={"module_key": module_key, "payload": before_payload},
            after_json={"module_key": module_key, "payload": validated},
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
        run = self._locked_run(run.id)
        if run.status not in {ExperimentStatus.LOCKED, ExperimentStatus.REVIEWED}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only locked or reviewed runs can update result status",
            )
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

    def _locked_run(self, run_id: UUID) -> ExperimentRun:
        run = self.experiments.get_by_id_for_update(run_id)
        if run is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Experiment not found",
            )
        return run

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

    def _validate_saved_modules_for_lock(
        self,
        run: ExperimentRun,
    ) -> dict[str, dict[str, Any]]:
        validated_modules: dict[str, dict[str, Any]] = {}
        for payload in self.module_payloads.list_by_run(run.id):
            payload_json = deepcopy(payload.payload_json)
            if payload.module_key == "equipment":
                payload_json.pop("setup_code", None)
                payload_json.pop("setup_name", None)
                payload_json = {
                    key: value for key, value in payload_json.items() if value is not None
                }
            elif payload.module_key == "substrates":
                payload_json, _ = self._strip_substrate_source_ids(payload_json)
            try:
                if payload.module_key in {
                    "basic_info",
                    "target_product",
                    "precursors",
                    "process_steps",
                    "process_events",
                }:
                    validated = validate_scientific_module_payload(
                        payload.module_key,
                        payload_json,
                    )
                else:
                    if payload.module_key == "substrates":
                        payload_json = self._prefill_material_lot_fields(
                            payload.module_key,
                            payload_json,
                        )
                    validated = validate_v2_module_payload(payload.module_key, payload_json)
                    if payload.module_key == "substrates":
                        validated = self._freeze_material_lot_references(
                            payload.module_key,
                            validated,
                        )
                        self._validate_zone_indices(run, payload.module_key, validated)
                        self._validate_substrate_piece_labels(validated)
                validated_modules[payload.module_key] = validated
            except ValidationError as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={"invalid": self._validation_errors(exc, payload.module_key)},
                ) from exc
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={"invalid": [{"key": payload.module_key, "reason": "value"}]},
                ) from exc
        required = {
            "basic_info",
            "target_product",
            "equipment",
            "precursors",
            "substrates",
            "process_steps",
        }
        missing_modules = sorted(required - validated_modules.keys())
        if missing_modules:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "missing": [
                        {"key": module_key, "requirement": "required"}
                        for module_key in missing_modules
                    ]
                },
            )
        if run.setup_ref is None or run.setup_ref_version is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"missing": [{"key": "setup_ref", "requirement": "required"}]},
            )
        return validated_modules

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

    @staticmethod
    def _validate_substrate_piece_labels(payload_json: dict[str, Any]) -> None:
        labels = [
            str(item.get("piece_label") or "").strip().casefold()
            for item in payload_json.get("items") or []
            if isinstance(item, dict)
        ]
        if len(labels) != len(set(labels)):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"invalid": [{"key": "piece_label", "reason": "duplicate"}]},
            )

    def _prune_unreferenced_process_files(
        self,
        run_id: UUID,
        module_key: str,
        payload_json: dict[str, Any],
        current_user: User,
    ) -> None:
        if module_key == "process_events":
            asset_role = "process_event_attachment"
            raw_ids = (
                raw_id
                for event in payload_json.get("items") or []
                if isinstance(event, dict)
                for raw_id in event.get("attachment_file_ids") or []
            )
        elif module_key == "process_steps":
            asset_role = "process_timeseries"
            raw_ids = (
                channel["file_asset_id"]
                for channel in payload_json.get("channels") or []
                if isinstance(channel, dict) and channel.get("file_asset_id")
            )
        else:
            return
        referenced_file_ids = {UUID(str(raw_id)) for raw_id in raw_ids}
        if asset_role == "process_timeseries":
            referenced_file_ids.update(
                self.db.scalars(
                    select(ProcessChannel.file_asset_id)
                    .join(RunRevision, RunRevision.id == ProcessChannel.run_revision_id)
                    .where(
                        RunRevision.experiment_run_id == run_id,
                        ProcessChannel.file_asset_id.is_not(None),
                    )
                )
            )
        else:
            for attachment_ids in self.db.scalars(
                select(ScientificProcessEvent.attachment_file_ids)
                .join(RunRevision, RunRevision.id == ScientificProcessEvent.run_revision_id)
                .where(RunRevision.experiment_run_id == run_id)
            ):
                referenced_file_ids.update(UUID(file_id) for file_id in attachment_ids)
        FileAssetService(self.db).soft_delete_unreferenced_process_files(
            experiment_id=run_id,
            asset_role=asset_role,
            referenced_file_ids=referenced_file_ids,
            current_user=current_user,
        )

    def _freeze_material_lot_references(
        self,
        module_key: str,
        payload_json: dict[str, Any],
    ) -> dict[str, Any]:
        if module_key == "pvd":
            reference = payload_json.get("target_lot_ref")
            if reference is None:
                return payload_json
            version = self._resolve_material_lot_reference(reference, "target_lot_ref")
            if version.lot_category != "chemical":
                self._raise_invalid_reference("target_lot_ref", "category")
            payload_json["target_lot_ref"] = {
                "entity_id": str(version.entity_id),
                "version": version.version,
                "snapshot": material_lot_version_snapshot(version),
            }
            return payload_json

        for item in payload_json.get("items") or []:
            reference = item.get("lot_ref")
            if reference is None:
                continue
            version = self._resolve_material_lot_reference(reference, "lot_ref")
            expected_categories = (
                {"substrate"}
                if module_key == "substrates"
                else {"gas_cylinder"}
                if item.get("phase_state") == "gas"
                else {"chemical"}
            )
            if version.lot_category not in expected_categories:
                self._raise_invalid_reference("lot_ref", "category")
            snapshot = material_lot_version_snapshot(version)
            if module_key == "substrates":
                self._validate_substrate_lot_identity(item, version)
            for key in MATERIAL_LOT_PROJECTED_FIELDS.get(module_key, ()):
                item.pop(key, None)
            item.update(self._complete_material_lot_projection(module_key, snapshot))
            item["lot_ref"] = {
                "entity_id": str(version.entity_id),
                "version": version.version,
                "snapshot": snapshot,
            }
        return payload_json

    def _prefill_material_lot_fields(
        self,
        module_key: str,
        payload_json: dict[str, Any],
    ) -> dict[str, Any]:
        """Supply lot-owned required values before validating the run payload."""
        items = payload_json.get("items")
        if not isinstance(items, list):
            return payload_json
        for item in items:
            if not isinstance(item, dict) or item.get("lot_ref") is None:
                continue
            version = self._resolve_material_lot_reference(item["lot_ref"], "lot_ref")
            projection = self._complete_material_lot_projection(
                module_key,
                material_lot_version_snapshot(version),
            )
            for key, value in projection.items():
                if item.get(key) in (None, "", {}, []):
                    item[key] = value
        return payload_json

    @staticmethod
    def _complete_material_lot_projection(
        module_key: str,
        snapshot: dict[str, Any],
    ) -> dict[str, Any]:
        missing = missing_material_lot_projection_fields(module_key, snapshot)
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "invalid": [
                        {
                            "key": "lot_ref",
                            "reason": "incomplete_stable_facts",
                            "missing": missing,
                        }
                    ]
                },
            )
        return material_lot_item_projection(module_key, snapshot)

    def _resolve_material_lot_reference(self, reference: Any, key: str) -> Any:
        try:
            entity_id = UUID(str(reference["entity_id"]))
            version_number = int(reference["version"])
            return self.entities.get_version(
                "material_lot",
                entity_id,
                version_number,
            )
        except (KeyError, TypeError, ValueError, HTTPException) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"invalid": [{"key": key, "reason": "reference"}]},
            ) from exc

    @staticmethod
    def _raise_invalid_reference(key: str, reason: str) -> None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"invalid": [{"key": key, "reason": reason}]},
        )

    def _validate_substrate_lot_identity(self, item: dict[str, Any], version: Any) -> None:
        material = canonical_option_value(item.get("material"))
        lot_material = canonical_option_value(version.attrs.get("substrate_material"))
        if lot_material and lot_material != material:
            self._raise_invalid_reference("lot_ref", "identity")

        expected_formulas = SUBSTRATE_FORMULAS.get(material)
        if expected_formulas is not None and version.chemical_formula not in expected_formulas:
            self._raise_invalid_reference("lot_ref", "identity")

        if item.get("chemical_formula") != version.chemical_formula:
            self._raise_invalid_reference("lot_ref", "identity")

    def _validate_zone_indices(
        self,
        run: ExperimentRun,
        module_key: str,
        payload_json: dict[str, Any],
    ) -> None:
        zone_count = (run.setup_ref_snapshot_json or {}).get("zone_count_snapshot")
        zone_key = (
            "source_position" if module_key == "precursors" else "zone_thermocouple_distance_mm"
        )
        has_zone = any(
            (item.get(zone_key) or {}).get("zone_index") for item in payload_json.get("items") or []
        )
        if has_zone and not isinstance(zone_count, int):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"invalid": [{"key": zone_key, "reason": "setup_required"}]},
            )
        if isinstance(zone_count, int):
            self._validate_zone_items(module_key, payload_json, zone_count)

    @staticmethod
    def _validate_zone_items(
        module_key: str,
        payload_json: dict[str, Any],
        zone_count: int,
    ) -> None:
        zone_key = (
            "source_position" if module_key == "precursors" else "zone_thermocouple_distance_mm"
        )
        for item in payload_json.get("items") or []:
            zone = item.get(zone_key)
            if zone is not None and zone.get("zone_index", 0) > zone_count:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={"invalid": [{"key": zone_key, "reason": "zone_count"}]},
                )

    def _require_status(self, run: ExperimentRun, expected: ExperimentStatus) -> None:
        if run.status != expected:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail=f"Experiment must be {expected.value}"
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
            target_material_system=run.target_material_system,
            experiment_date=run.experiment_date,
            objective=run.objective,
            status=run.status.value,
            invalid_reason=run.invalid_reason,
            result_missing_todo=run.result_missing_todo,
            locked_at=run.locked_at,
            current_revision_id=run.current_revision_id,
            draft_supersedes_revision_id=run.draft_supersedes_revision_id,
            correction_reason=run.correction_reason,
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
    def _validation_errors(
        exc: ValidationError,
        fallback_key: str = "payload",
    ) -> list[dict[str, str]]:
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
            key = next(
                (
                    str(part)
                    for part in reversed(loc)
                    if isinstance(part, str) and part != "payload"
                ),
                fallback_key,
            )
            invalid.append({"key": key, "reason": reason})
        return invalid
