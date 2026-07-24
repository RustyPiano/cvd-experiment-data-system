from __future__ import annotations

import re
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
from app.services.v2_entity_snapshot_service import (
    apply_setup_reference,
    material_lot_version_snapshot,
)
from app.services.v2_field_source import (
    SCHEMA_VERSION,
    canonical_option_value,
    experiment_fields,
    load_field_source,
    missing,
    module_key_for_field,
    normalize_offset_datetime,
    stage_types_with_group,
    validate_chemical_formula,
    validate_material_formula,
)
from app.services.v2_r0_service import missing_r0_fields, missing_required_fields
from app.services.v2_result_status_service import (
    is_result_missing_todo,
    refresh_result_missing_todo,
)

PRECURSOR_FORMULA_ALIASES = {
    "三氧化钼": "MoO3",
    "氧化钼": "MoO3",
    "三氧化钨": "WO3",
    "氧化钨": "WO3",
    "硫": "S",
    "硒": "Se",
    "碲": "Te",
}
SUBSTRATE_MATERIAL_ALIASES = {
    "sio2_si": {"sio2_si"},
    "sapphire_al2o3": {"sapphire", "sapphire_al2o3"},
    "quartz": {"quartz"},
    "mica": {"mica"},
    "cu_foil": {"cu_foil"},
    "au_foil": {"au_foil"},
    "h-BN": {"h-BN"},
}
SUBSTRATE_FORMULAS = {
    "sio2_si": {"Si", "SiO2"},
    "sapphire_al2o3": {"Al2O3"},
    "quartz": {"SiO2"},
    "cu_foil": {"Cu"},
    "au_foil": {"Au"},
    "h-BN": {"BN"},
}


class V2ExperimentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)
        self.module_payloads = ModulePayloadRepository(db)
        self.entities = V2EntityService(db)
        self.samples = SampleService(db)
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
        self._save_v2_payload(
            run.id,
            "basic_info",
            {
                "started_at": started_at.isoformat(),
                "synthesis_method": canonical_option_value(payload.synthesis_method),
                "operator": current_user.name,
                "run_code": run.run_code,
            },
        )
        if chemical_formula:
            self._save_v2_payload(
                run.id,
                "target_product",
                # structure_type defaults to the stable controlled-vocabulary code.
                {
                    "chemical_formula": chemical_formula,
                    "structure_type": (
                        None
                        if any(separator in chemical_formula for separator in (":", "/", "-"))
                        else "intrinsic"
                    ),
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
        self._require_r0(run)
        try:
            self.samples.sync_growth_samples(run, self._substrate_items(run.id), current_user)
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
        run = get_visible_experiment(
            self.experiments, run_id, current_user, schema_version=SCHEMA_VERSION
        )
        if current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
        run = self._locked_run(run.id)
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
        self._validate_saved_zone_indices(run.id, version.zone_count)
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
        run = self._locked_run(run.id)
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
            validated["operator"] = run.owner_name or current_user.name
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
            self._validate_process_event_timeline(
                run.id,
                started_at=normalized_started_at,
                invalid_key="started_at",
            )
            run.experiment_date = normalized_started_at.date()
            process_payload = self.module_payloads.get_by_run_and_key(run.id, "process_steps")
            self._validate_pressure_regime(
                validated.get("synthesis_method"),
                process_payload.payload_json if process_payload else {},
            )
        if module_key == "process_steps":
            self._validate_external_field_requirement(run, validated)
            basic_payload = self.module_payloads.get_by_run_and_key(run.id, "basic_info")
            self._validate_pressure_regime(
                (basic_payload.payload_json if basic_payload else {}).get("synthesis_method"),
                validated,
            )
        if module_key == "process_events":
            self._validate_process_event_timeline(
                run.id,
                process_events=validated,
                invalid_key="occurred_at",
            )
        if module_key in {"precursors", "substrates", "pvd"}:
            validated = self._freeze_material_lot_references(module_key, validated)
        if module_key in {"precursors", "substrates"}:
            self._validate_zone_indices(run, module_key, validated)
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
        run = self._locked_run(run.id)
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
        if (
            isinstance(field_devices, list)
            and any(value in {"none", "无"} for value in field_devices)
            and field_devices not in (["none"], ["无"])
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="无 must be the only external field device selection",
            )
        if missing(field_devices) or field_devices in ("none", "无", ["none"], ["无"]):
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
            if module_key == "precursors":
                self._validate_precursor_lot_identity(item, version)
            else:
                self._validate_substrate_lot_identity(item, version)
            item["lot_ref"] = {
                "entity_id": str(version.entity_id),
                "version": version.version,
                "snapshot": material_lot_version_snapshot(version),
            }
        return payload_json

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

    def _validate_precursor_lot_identity(self, item: dict[str, Any], version: Any) -> None:
        supplied = str(item.get("name_formula") or "").strip()
        if supplied.casefold() == str(version.substance_name).strip().casefold():
            return
        formula = PRECURSOR_FORMULA_ALIASES.get(supplied)
        if formula is None:
            candidates = [part.strip() for part in supplied.split("/") if part.strip()]
            for candidate in reversed(candidates):
                try:
                    formula = validate_material_formula(candidate)
                    break
                except ValueError:
                    continue
        if formula != version.chemical_formula:
            self._raise_invalid_reference("lot_ref", "identity")

    def _validate_substrate_lot_identity(self, item: dict[str, Any], version: Any) -> None:
        material = canonical_option_value(item.get("material"))
        lot_material = canonical_option_value(version.attrs.get("substrate_material"))
        accepted_lot_materials = SUBSTRATE_MATERIAL_ALIASES.get(material, {material})
        if lot_material not in accepted_lot_materials:
            self._raise_invalid_reference("lot_ref", "identity")

        expected_formulas = SUBSTRATE_FORMULAS.get(material)
        if expected_formulas is not None and version.chemical_formula not in expected_formulas:
            self._raise_invalid_reference("lot_ref", "identity")

        orientation = str(item.get("formula_orientation") or "").strip()
        match = re.match(r"^((?:[A-Z][a-z]?(?:\d+(?:\.\d+)?)?)+)", orientation)
        if match:
            try:
                orientation_formula = validate_chemical_formula(match.group(1))
            except ValueError:
                orientation_formula = None
            if (
                orientation_formula is not None
                and expected_formulas is not None
                and orientation_formula not in expected_formulas
            ):
                self._raise_invalid_reference("lot_ref", "identity")

    def _validate_saved_zone_indices(self, run_id: UUID, zone_count: int) -> None:
        for module_key in ("precursors", "substrates"):
            payload = self.module_payloads.get_by_run_and_key(run_id, module_key)
            if payload is not None:
                self._validate_zone_items(module_key, payload.payload_json, zone_count)

    def _validate_process_event_timeline(
        self,
        run_id: UUID,
        *,
        started_at: datetime | None = None,
        process_events: dict[str, Any] | None = None,
        invalid_key: str,
    ) -> None:
        if started_at is None:
            basic = self.module_payloads.get_by_run_and_key(run_id, "basic_info")
            raw_started_at = (basic.payload_json if basic else {}).get("started_at")
            if raw_started_at is None:
                return
            started_at = normalize_offset_datetime(raw_started_at)
        if process_events is None:
            saved_events = self.module_payloads.get_by_run_and_key(run_id, "process_events")
            process_events = saved_events.payload_json if saved_events else {}
        for event in process_events.get("items") or []:
            raw_occurred_at = event.get("occurred_at")
            if raw_occurred_at is None:
                continue
            if normalize_offset_datetime(raw_occurred_at) < started_at:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={
                        "invalid": [
                            {
                                "key": invalid_key,
                                "reason": "before_started_at",
                            }
                        ]
                    },
                )

    def _validate_zone_indices(
        self,
        run: ExperimentRun,
        module_key: str,
        payload_json: dict[str, Any],
    ) -> None:
        zone_count = (run.setup_ref_snapshot_json or {}).get("zone_count_snapshot")
        zone_key = (
            "source_zone_temperature"
            if module_key == "precursors"
            else "zone_thermocouple_distance_mm"
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
            "source_zone_temperature"
            if module_key == "precursors"
            else "zone_thermocouple_distance_mm"
        )
        for item in payload_json.get("items") or []:
            zone = item.get(zone_key)
            if zone is not None and zone.get("zone_index", 0) > zone_count:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={"invalid": [{"key": zone_key, "reason": "zone_count"}]},
                )

    @staticmethod
    def _validate_pressure_regime(
        synthesis_method: Any,
        process_payload: dict[str, Any],
    ) -> None:
        expected = {
            "APCVD": "atmospheric_pressure",
            "LPCVD": "low_pressure",
        }.get(synthesis_method)
        if expected is None:
            return
        doc = load_field_source()
        pressure_field = next(
            field
            for field in experiment_fields(doc)
            if module_key_for_field(field, doc) == "process_steps"
            and field["key"] == "pressure_system"
        )
        option_ranges = (pressure_field.get("validation") or {}).get("option_ranges") or {}
        for step in process_payload.get("items") or []:
            if step.get("stage_type") != "growth":
                continue
            pressure = step.get("pressure_system") or {}
            if pressure.get("option") != expected:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={
                        "invalid": [
                            {
                                "key": "pressure_system",
                                "reason": "synthesis_method",
                            }
                        ]
                    },
                )
            value = pressure.get("value")
            bounds = option_ranges.get(expected) or {}
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or ("ge" in bounds and value < bounds["ge"])
                or ("gt" in bounds and value <= bounds["gt"])
                or ("le" in bounds and value > bounds["le"])
                or ("lt" in bounds and value >= bounds["lt"])
            ):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={
                        "invalid": [
                            {
                                "key": "pressure_system",
                                "reason": "range",
                            }
                        ]
                    },
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
