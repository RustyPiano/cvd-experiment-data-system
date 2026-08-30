from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.scientific_units import canonicalize_process_channel
from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.file_asset import FileAsset
from app.models.scientific import (
    ProcessChannel,
    ProcessSegment,
    RunContributor,
    RunFeature,
    RunRevision,
    ScientificProcessEvent,
    SourceLoad,
    SourceLoadIngredient,
    TargetCompositionRelation,
    TargetMaterialRegion,
    TargetSpec,
)
from app.models.user import User, UserRole
from app.models.v2_entities import ContainerInstance
from app.schemas.scientific import (
    ProcessTimelinePayload,
    RunRevisionListResponse,
    RunRevisionRead,
    ScientificBasicInfo,
    ScientificProcessEventsPayload,
    SourceLoadsPayload,
    TargetSpecPayload,
)
from app.services.audit_service import AuditService
from app.services.file_storage_service import FileStorageService
from app.services.process_timeseries import (
    ProcessTimeseriesError,
    project_process_timeseries,
)
from app.services.v2_entity_service import V2EntityService
from app.services.v2_entity_snapshot_service import material_lot_version_snapshot
from app.services.v2_field_source import load_field_source
from app.services.v2_process_semantics import valid_frozen_gas_reference


def validate_scientific_module_payload(module_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    models = {
        "basic_info": ScientificBasicInfo,
        "target_product": TargetSpecPayload,
        "precursors": SourceLoadsPayload,
        "process_steps": ProcessTimelinePayload,
        "process_events": ScientificProcessEventsPayload,
    }
    model = models.get(module_key)
    if model is None:
        return payload
    return model.model_validate(payload).model_dump(mode="json", exclude_none=True)


class ScientificRevisionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit = AuditService(db)
        self.entities = V2EntityService(db)
        self.file_storage = FileStorageService()

    def create_locked_revision(
        self,
        run: ExperimentRun,
        modules: dict[str, dict[str, Any]],
        actor: User,
    ) -> RunRevision:
        normalized = {
            key: validate_scientific_module_payload(key, value)
            for key, value in sorted(modules.items())
        }
        normalized["process_steps"] = self.normalize_process_references(
            run,
            normalized["process_steps"],
        )
        self._validate_basic(run, normalized["basic_info"])
        self.validate_source_references(normalized["precursors"])
        process_end = self._validate_process_references(run, normalized)
        content = {
            "run": {
                "id": str(run.id),
                "run_code": run.run_code,
                "experiment_date": run.experiment_date.isoformat(),
                "objective": run.objective,
                "setup_ref": str(run.setup_ref) if run.setup_ref else None,
                "setup_ref_version": run.setup_ref_version,
                "setup_ref_snapshot": run.setup_ref_snapshot_json,
            },
            "modules": normalized,
        }
        canonical = json.dumps(
            content,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        previous = (
            self.db.get(RunRevision, run.draft_supersedes_revision_id)
            if run.draft_supersedes_revision_id
            else None
        )
        revision_number = (
            self.db.scalar(
                select(func.max(RunRevision.revision_number)).where(
                    RunRevision.experiment_run_id == run.id
                )
            )
            or 0
        ) + 1
        meta = load_field_source()["meta"]
        revision = RunRevision(
            experiment_run_id=run.id,
            revision_number=revision_number,
            supersedes_revision_id=previous.id if previous else None,
            schema_version=str(meta["version"]),
            schema_status=str(meta["status"]).lower(),
            content_json=content,
            content_sha256=hashlib.sha256(canonical).hexdigest(),
            correction_reason=run.correction_reason,
            locked_by_id=actor.id,
            locked_at=datetime.now(UTC),
        )
        self.db.add(revision)
        self.db.flush()

        self._project_contributors(revision, normalized["basic_info"])
        self._project_target(revision, normalized["target_product"])
        self._project_source_loads(revision, normalized["precursors"])
        excluded_ranges = [
            time_range
            for event in (normalized.get("process_events") or {}).get("items") or []
            if "process_channel" in (event.get("affected_objects") or [])
            for time_range in event.get("excluded_time_ranges") or []
        ]
        self._project_timeline(
            revision,
            normalized["process_steps"],
            excluded_ranges,
            process_end,
        )
        self._project_events(revision, normalized.get("process_events") or {"items": []})
        self._project_features(revision, normalized, run)

        if previous:
            previous.status = "superseded"
            previous.superseded_at = datetime.now(UTC)
        run.current_revision_id = revision.id
        run.draft_supersedes_revision_id = None
        run.correction_reason = None
        return revision

    def list_revisions(self, run: ExperimentRun) -> RunRevisionListResponse:
        rows = list(
            self.db.scalars(
                select(RunRevision)
                .where(RunRevision.experiment_run_id == run.id)
                .order_by(RunRevision.revision_number.desc())
            )
        )
        return RunRevisionListResponse(
            items=[RunRevisionRead.model_validate(row) for row in rows],
            total=len(rows),
        )

    def create_correction_draft(
        self,
        run: ExperimentRun,
        reason: str,
        actor: User,
    ) -> None:
        if run.status not in {ExperimentStatus.LOCKED, ExperimentStatus.REVIEWED}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only a locked or reviewed run can be corrected",
            )
        if run.owner_id != actor.id and actor.role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if run.current_revision_id is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Run has no immutable revision",
            )
        run.draft_supersedes_revision_id = run.current_revision_id
        run.correction_reason = reason
        run.status = ExperimentStatus.DRAFT
        run.locked_at = None
        run.result_missing_todo = False
        self.audit.record_event(
            actor=actor,
            entity_type="experiment_run",
            entity_id=run.id,
            action="create_correction_draft",
            before_json={"current_revision_id": str(run.current_revision_id)},
            after_json={
                "draft_supersedes_revision_id": str(run.draft_supersedes_revision_id),
                "status": "draft",
            },
            reason=reason,
        )

    def review(self, run: ExperimentRun, actor: User, note: str | None) -> RunRevision:
        if actor.role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if run.status != ExperimentStatus.LOCKED or run.current_revision_id is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only the current locked revision can be reviewed",
            )
        revision = self.db.get(RunRevision, run.current_revision_id)
        if revision is None or revision.status != "locked":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Current locked revision is unavailable",
            )
        revision.status = "reviewed"
        revision.reviewed_by_id = actor.id
        revision.reviewed_at = datetime.now(UTC)
        run.status = ExperimentStatus.REVIEWED
        self.db.add(
            RunContributor(
                run_revision_id=revision.id,
                user_id=actor.id,
                role="reviewed_by",
                user_snapshot_json={
                    "id": str(actor.id),
                    "name": actor.name,
                    "email": actor.email,
                },
            )
        )
        self.audit.record_event(
            actor=actor,
            entity_type="experiment_run",
            entity_id=run.id,
            action="review",
            before_json={"status": "locked", "revision_id": str(revision.id)},
            after_json={"status": "reviewed", "revision_id": str(revision.id)},
            reason=note,
        )
        return revision

    def _validate_contributors(self, basic: dict[str, Any]) -> None:
        user_ids = {
            UUID(value)
            for value in [
                basic["created_by_user_id"],
                basic["recorded_by_user_id"],
                *basic["performed_by_user_ids"],
            ]
        }
        users = list(
            self.db.scalars(select(User).where(User.id.in_(user_ids), User.is_active.is_(True)))
        )
        if {user.id for user in users} != user_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"invalid": [{"key": "performed_by_user_ids", "reason": "user"}]},
            )

    def _validate_basic(self, run: ExperimentRun, basic: dict[str, Any]) -> None:
        self._validate_contributors(basic)
        if (
            UUID(basic["created_by_user_id"]) != run.owner_id
            or basic["run_code"] != run.run_code
            or not basic["precheck"]["confirmed"]
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "invalid": [
                        {
                            "key": "basic_info",
                            "reason": "ownership_run_code_or_precheck",
                        }
                    ]
                },
            )

    def validate_source_references(self, payload: dict[str, Any]) -> None:
        for source_load in payload["items"]:
            expected_category = (
                "gas_cylinder" if source_load["loading_method"] == "gas_line" else "chemical"
            )
            for ingredient in source_load["ingredients"]:
                try:
                    version = self.entities.get_version(
                        "material_lot",
                        UUID(ingredient["material_lot_id"]),
                        ingredient["material_lot_version"],
                    )
                except (HTTPException, KeyError, TypeError, ValueError):
                    self._invalid_source_reference("material_lot_id", "reference")
                if version.lot_category != expected_category:
                    self._invalid_source_reference(
                        "material_lot_id",
                        "category",
                        expected_category=expected_category,
                    )
            container_id = source_load.get("container_instance_id")
            if not container_id:
                continue
            container = self.db.get(ContainerInstance, UUID(container_id))
            ingredient_lot_ids = {
                UUID(item["material_lot_id"]) for item in source_load["ingredients"]
            }
            if (
                container is None
                or container.status not in {"available", "in_use"}
                or container.material_lot_id not in ingredient_lot_ids
            ):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={
                        "invalid": [
                            {
                                "key": "container_instance_id",
                                "reason": "container_or_lot",
                            }
                        ]
                    },
                )

    @staticmethod
    def _invalid_source_reference(
        key: str,
        reason: str,
        *,
        expected_category: str | None = None,
    ) -> None:
        invalid = {"key": key, "reason": reason}
        if expected_category is not None:
            invalid["expected_category"] = expected_category
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"invalid": [invalid]},
        )

    def _validate_process_references(
        self,
        run: ExperimentRun,
        modules: dict[str, dict[str, Any]],
    ) -> float:
        timeline = modules["process_steps"]
        process_end = max(
            0,
            *(item["end_s"] for item in timeline["segments"]),
            *(
                point.get("end_s", point["start_s"])
                for channel in timeline["channels"]
                for point in channel.get("series") or []
            ),
            *(field["end_min"] * 60 for field in timeline.get("field_params") or []),
            *(
                point["t_s"]
                for source_load in modules["precursors"]["items"]
                for point in source_load.get("position_program") or []
            ),
            *(
                event.get("end_s") or event["start_s"]
                for event in (modules.get("process_events") or {}).get("items") or []
            ),
        )
        referenced: dict[UUID, tuple[str, str]] = {}
        for channel in timeline["channels"]:
            if channel.get("file_asset_id"):
                referenced[UUID(channel["file_asset_id"])] = (
                    "process_timeseries",
                    channel["channel_key"],
                )
            if any(
                point.get("end_s", point["start_s"]) > process_end
                for point in channel.get("series") or []
            ):
                self._invalid_process_reference(
                    "process_steps.channels",
                    "outside_process_timeline",
                )
        zone_count = (run.setup_ref_snapshot_json or {}).get("zone_count_snapshot")
        valid_zones = (
            {f"zone_{index}" for index in range(1, zone_count + 1)}
            if isinstance(zone_count, int)
            else set()
        )
        setpoint_temperatures = [
            channel
            for channel in timeline["channels"]
            if channel["channel_type"] == "temperature" and channel["source_type"] == "setpoint"
        ]
        if (
            len(setpoint_temperatures) != len(valid_zones)
            or {channel["subject_ref"] for channel in setpoint_temperatures} != valid_zones
            or any(channel["data_kind"] != "interval_series" for channel in setpoint_temperatures)
        ):
            self._invalid_process_reference(
                "process_steps.temperature_program",
                "setup_zone_coverage",
            )
        raw_field_capabilities = (run.setup_ref_snapshot_json or {}).get("field_devices") or []
        field_capabilities = set(
            raw_field_capabilities
            if isinstance(raw_field_capabilities, list)
            else [raw_field_capabilities]
        )
        for field in timeline.get("field_params") or []:
            if field["field_type"] not in field_capabilities:
                self._invalid_process_reference(
                    "process_steps.field_params",
                    "setup_capability",
                )
            if field["end_min"] * 60 > process_end:
                self._invalid_process_reference(
                    "process_steps.field_params",
                    "outside_process_timeline",
                )
        for channel in timeline["channels"]:
            if (
                channel["channel_type"] == "temperature"
                and channel["subject_ref"] not in valid_zones
            ):
                self._invalid_process_reference("process_steps.zone_index", "setup_zone")
            gas_lot_id = channel.get("gas_lot_id")
            if gas_lot_id:
                version = self.entities.get_version(
                    "material_lot",
                    UUID(gas_lot_id),
                    channel["gas_lot_version"],
                )
                if not valid_frozen_gas_reference(
                    {
                        "species": channel["gas_species_code"],
                        "lot_ref": {
                            "entity_id": str(version.entity_id),
                            "version": version.version,
                            "snapshot": material_lot_version_snapshot(version),
                        },
                    }
                ):
                    self._invalid_process_reference(
                        "process_steps.channels.gas_lot_id",
                        "gas_identity",
                    )
        for source_load in modules["precursors"]["items"]:
            if (
                source_load.get("heating_zone_ref")
                and source_load["heating_zone_ref"] not in valid_zones
            ):
                self._invalid_process_reference(
                    "precursors.heating_zone_ref",
                    "setup_zone",
                )
            if any(
                point["t_s"] > process_end for point in source_load.get("position_program") or []
            ):
                self._invalid_process_reference(
                    "precursors.position_program",
                    "outside_process_timeline",
                )
        for event in (modules.get("process_events") or {}).get("items") or []:
            if (event.get("end_s") or event["start_s"]) > process_end:
                self._invalid_process_reference(
                    "process_events",
                    "outside_process_timeline",
                )
            for file_id in event.get("attachment_file_ids") or []:
                referenced[UUID(file_id)] = (
                    "process_event_attachment",
                    event["event_key"],
                )
        if referenced:
            files = {
                item.id: item
                for item in self.db.scalars(
                    select(FileAsset).where(
                        FileAsset.id.in_(referenced),
                        FileAsset.experiment_run_id == run.id,
                        FileAsset.deleted_at.is_(None),
                    )
                )
            }
            if set(files) != set(referenced) or any(
                files[file_id].asset_role != expected_role
                or files[file_id].metadata_json.get("binding_id") != expected_binding
                for file_id, (expected_role, expected_binding) in referenced.items()
                if file_id in files
            ):
                self._invalid_process_reference(
                    "file_asset_id",
                    "missing_run_or_role",
                )
        return process_end

    def freeze_process_gas_references(self, payload: dict[str, Any]) -> None:
        for operation in payload.get("preparation_operations") or []:
            if operation.get("operation_type") != "gas_exchange":
                continue
            sources = operation.get("gas_sources") or []
            if not sources:
                self._invalid_process_reference(
                    "process_steps.preparation_operations.gas_sources",
                    "required",
                )
            operation.pop("gases", None)
            for source in sources:
                try:
                    version = self.entities.get_version(
                        "material_lot",
                        UUID(source["material_lot_id"]),
                        source["material_lot_version"],
                    )
                except (HTTPException, KeyError, TypeError, ValueError):
                    self._invalid_process_reference(
                        "process_steps.preparation_operations.gas_sources",
                        "reference",
                    )
                if version.lot_category != "gas_cylinder":
                    self._invalid_process_reference(
                        "process_steps.preparation_operations.gas_sources",
                        "category",
                    )
                source["snapshot"] = material_lot_version_snapshot(version)
                if not valid_frozen_gas_reference(source):
                    self._invalid_process_reference(
                        "process_steps.preparation_operations.gas_sources",
                        "gas_identity",
                    )
        for channel in payload.get("channels") or []:
            if channel.get("channel_type") != "flow":
                continue
            try:
                version = self.entities.get_version(
                    "material_lot",
                    UUID(channel["gas_lot_id"]),
                    channel["gas_lot_version"],
                )
            except (HTTPException, KeyError, TypeError, ValueError):
                self._invalid_process_reference(
                    "process_steps.channels.gas_lot_id",
                    "reference",
                )
            snapshot = material_lot_version_snapshot(version)
            if not valid_frozen_gas_reference(
                {
                    "species": channel.get("gas_species_code"),
                    "lot_ref": {
                        "entity_id": str(version.entity_id),
                        "version": version.version,
                        "snapshot": snapshot,
                    },
                }
            ):
                self._invalid_process_reference(
                    "process_steps.channels.gas_lot_id",
                    "gas_identity",
                )
            channel["subject_snapshot"] = snapshot

    def normalize_process_references(
        self,
        run: ExperimentRun,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if run.setup_ref is None:
            self._invalid_process_reference(
                "process_steps.channels.subject_instance_ref",
                "setup_required",
            )
        setup_id = str(run.setup_ref)
        self.freeze_process_gas_references(payload)
        for channel in payload.get("channels") or []:
            channel_type = channel.get("channel_type")
            if channel_type == "temperature":
                channel["subject_instance_ref"] = f"setup:{setup_id}:zone:{channel['zone_index']}"
            elif channel_type == "flow":
                channel["subject_instance_ref"] = (
                    f"setup:{setup_id}:gas:{channel['gas_species_code']}:1"
                )
            elif channel_type == "pressure":
                channel["subject_instance_ref"] = (
                    f"setup:{setup_id}:pressure:{channel['pressure_location']}"
                )
        return validate_scientific_module_payload("process_steps", payload)

    @staticmethod
    def _invalid_process_reference(key: str, reason: str) -> None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"invalid": [{"key": key, "reason": reason}]},
        )

    def _project_contributors(self, revision: RunRevision, basic: dict[str, Any]) -> None:
        roles = [
            ("recorded_by", UUID(basic["recorded_by_user_id"])),
            *[("performed_by", UUID(user_id)) for user_id in basic["performed_by_user_ids"]],
        ]
        users = {
            user.id: user
            for user in self.db.scalars(
                select(User).where(User.id.in_({user_id for _, user_id in roles}))
            )
        }
        for role, user_id in roles:
            user = users[user_id]
            self.db.add(
                RunContributor(
                    run_revision_id=revision.id,
                    user_id=user_id,
                    role=role,
                    user_snapshot_json={
                        "id": str(user.id),
                        "name": user.name,
                        "email": user.email,
                    },
                )
            )

    def _project_target(self, revision: RunRevision, payload: dict[str, Any]) -> None:
        target = TargetSpec(
            run_revision_id=revision.id,
            architecture_type=payload["architecture_type"],
            dimensional_form=payload.get("dimensional_form"),
            coverage_state=payload.get("coverage_state"),
            orientation=payload.get("orientation"),
            optimization_objective=payload.get("optimization_objective"),
            note=payload.get("note"),
        )
        self.db.add(target)
        self.db.flush()
        regions: dict[str, TargetMaterialRegion] = {}
        for item in payload["material_regions"]:
            region = TargetMaterialRegion(
                target_spec_id=target.id,
                region_key=item["region_key"],
                formula=item["formula"],
                spatial_role=item["spatial_role"],
                layer_index=item.get("layer_index"),
                lateral_region=item.get("lateral_region"),
                target_layer_count=item.get("target_layer_count"),
                target_bulk_phase=item.get("target_bulk_phase"),
                target_bulk_space_group_number=item.get("target_bulk_space_group_number"),
                attrs=item.get("attrs") or {},
            )
            self.db.add(region)
            self.db.flush()
            regions[item["region_key"]] = region
        for item in payload.get("composition_relations") or []:
            self.db.add(
                TargetCompositionRelation(
                    target_spec_id=target.id,
                    host_region_id=regions[item["host_region_key"]].id,
                    relation_type=item["relation_type"],
                    species=item["species"],
                    nominal_value=item.get("nominal_value"),
                    value_basis=item["value_basis"],
                    site_or_location=item.get("site_or_location"),
                )
            )

    def _project_source_loads(self, revision: RunRevision, payload: dict[str, Any]) -> None:
        for item in payload["items"]:
            container = (
                self.db.get(ContainerInstance, UUID(item["container_instance_id"]))
                if item.get("container_instance_id")
                else None
            )
            load = SourceLoad(
                run_revision_id=revision.id,
                load_key=item["load_key"],
                container_instance_id=container.id if container else None,
                container_snapshot_json=(
                    {
                        "id": str(container.id),
                        "material_lot_id": str(container.material_lot_id),
                        "container_code": container.container_code,
                        "container_type": container.container_type,
                        "opened_date": (
                            container.opened_date.isoformat() if container.opened_date else None
                        ),
                        "storage_history": container.storage_history,
                        "remaining_amount": container.remaining_amount,
                        "remaining_unit": container.remaining_unit,
                        "status": container.status,
                        "attrs": container.attrs,
                    }
                    if container
                    else None
                ),
                container_state_at_loading=container.status if container else None,
                loading_method=item["loading_method"],
                preparation_steps=item.get("preparation_steps") or [],
                initial_position=item.get("initial_position"),
                position_program=item.get("position_program") or [],
                heating_zone_ref=item.get("heating_zone_ref"),
                substrate_source_ids=item.get("substrate_source_ids") or [],
                attrs=item.get("attrs") or {},
            )
            self.db.add(load)
            self.db.flush()
            for ingredient in item["ingredients"]:
                lot_id = UUID(ingredient["material_lot_id"])
                version_number = ingredient["material_lot_version"]
                version = self.entities.get_version("material_lot", lot_id, version_number)
                self.db.add(
                    SourceLoadIngredient(
                        source_load_id=load.id,
                        material_lot_id=lot_id,
                        material_lot_version=version_number,
                        material_snapshot_json=material_lot_version_snapshot(version),
                        function_role=ingredient.get("function_role"),
                        process_roles=ingredient.get("process_roles") or [],
                        process_role_other=ingredient.get("process_role_other"),
                        amount=ingredient.get("amount"),
                        unit=ingredient.get("unit"),
                        concentration_value=ingredient.get("concentration_value"),
                        concentration_unit=ingredient.get("concentration_unit"),
                        concentration_unit_other=ingredient.get("concentration_unit_other"),
                        composition_basis=ingredient.get("composition_basis"),
                        uncertainty=ingredient.get("uncertainty"),
                        attrs=ingredient.get("attrs") or {},
                    )
                )

    def _project_timeline(
        self,
        revision: RunRevision,
        payload: dict[str, Any],
        excluded_ranges: list[dict[str, Any]],
        process_end: float,
    ) -> None:
        for item in payload["segments"]:
            self.db.add(
                ProcessSegment(
                    run_revision_id=revision.id,
                    segment_key=item["segment_key"],
                    segment_type=item["segment_type"],
                    sequence=item["sequence"],
                    start_s=item["start_s"],
                    end_s=item["end_s"],
                    label=item.get("label"),
                    note=item.get("note"),
                )
            )
        for item in payload["channels"]:
            statistics = None
            source_file_sha256 = None
            parser_version = None
            if item["data_kind"] == "timeseries_file":
                file_asset = self.db.get(FileAsset, UUID(item["file_asset_id"]))
                if file_asset is None:
                    self._invalid_process_reference("file_asset_id", "missing")
                try:
                    canonical_series, statistics = project_process_timeseries(
                        file_asset,
                        self.file_storage,
                        item["channel_type"],
                        item["unit"],
                        excluded_ranges,
                        process_end,
                    )
                except ProcessTimeseriesError as exc:
                    self._invalid_process_reference(
                        "process_steps.timeseries_file",
                        str(exc),
                    )
                canonical_unit = (
                    "state"
                    if item["channel_type"].endswith("_state")
                    else canonicalize_process_channel(
                        {**item, "data_kind": "scalar", "scalar_value": 0, "file_asset_id": None}
                    )[0]
                )
                canonical_scalar = None
                projection_status = "ready"
                source_file_sha256 = file_asset.sha256
                parser_version = str(statistics["parser_version"])
            else:
                canonical_unit, canonical_scalar, canonical_series, projection_status = (
                    canonicalize_process_channel(item)
                )
            gas_lot_snapshot = None
            if item.get("gas_lot_id"):
                gas_lot_snapshot = material_lot_version_snapshot(
                    self.entities.get_version(
                        "material_lot",
                        UUID(item["gas_lot_id"]),
                        item["gas_lot_version"],
                    )
                )
            self.db.add(
                ProcessChannel(
                    run_revision_id=revision.id,
                    channel_key=item["channel_key"],
                    channel_type=item["channel_type"],
                    source_type=item["source_type"],
                    subject_type=item["subject_type"],
                    subject_ref=item["subject_ref"],
                    subject_instance_ref=item["subject_instance_ref"],
                    subject_snapshot_json=item.get("subject_snapshot")
                    or {
                        "subject_type": item["subject_type"],
                        "subject_ref": item["subject_ref"],
                        "subject_instance_ref": item["subject_instance_ref"],
                    },
                    gas_species_code=item.get("gas_species_code"),
                    gas_lot_id=(UUID(item["gas_lot_id"]) if item.get("gas_lot_id") else None),
                    gas_lot_version=item.get("gas_lot_version"),
                    gas_lot_snapshot_json=gas_lot_snapshot,
                    zone_index=item.get("zone_index"),
                    pressure_location=item.get("pressure_location"),
                    pressure_type=item.get("pressure_type"),
                    unit=item["unit"],
                    data_kind=item["data_kind"],
                    scalar_value=item.get("scalar_value"),
                    series_json=item.get("series"),
                    file_asset_id=(
                        UUID(item["file_asset_id"]) if item.get("file_asset_id") else None
                    ),
                    canonical_unit=canonical_unit,
                    canonical_scalar_value=canonical_scalar,
                    canonical_series_json=canonical_series,
                    projection_status=projection_status,
                    statistics_json=statistics,
                    source_file_sha256=source_file_sha256,
                    parser_version=parser_version,
                )
            )
        self.db.flush()

    def _project_events(self, revision: RunRevision, payload: dict[str, Any]) -> None:
        for item in payload.get("items") or []:
            self.db.add(
                ScientificProcessEvent(
                    run_revision_id=revision.id,
                    event_key=item["event_key"],
                    start_s=item["start_s"],
                    end_s=item.get("end_s"),
                    affected_objects=item.get("affected_objects") or [],
                    observed_deviations=item["observed_deviations"],
                    suspected_causes=item.get("suspected_causes") or [],
                    intervention_actions=item.get("intervention_actions") or [],
                    outcome=item.get("outcome"),
                    data_validity_impact=item.get("data_validity_impact"),
                    excluded_time_ranges=item.get("excluded_time_ranges") or [],
                    description=item.get("description"),
                    attachment_file_ids=item.get("attachment_file_ids") or [],
                )
            )

    def _project_features(
        self,
        revision: RunRevision,
        modules: dict[str, dict[str, Any]],
        run: ExperimentRun,
    ) -> None:
        target = modules["target_product"]
        for index, region in enumerate(target["material_regions"]):
            self._feature(
                revision,
                "target_formula",
                text=region["formula"],
                ordinal=index,
                source="target_product.material_regions",
            )
        self._feature(
            revision,
            "architecture_type",
            text=target["architecture_type"],
            source="target_product.architecture_type",
        )
        if run.setup_ref:
            self._feature(
                revision,
                "setup_id",
                text=str(run.setup_ref),
                source="run.setup_ref",
            )
        for load_index, load in enumerate(modules["precursors"]["items"]):
            for ingredient_index, ingredient in enumerate(load["ingredients"]):
                self._feature(
                    revision,
                    "material_lot_id",
                    text=ingredient["material_lot_id"],
                    ordinal=(load_index * 1000) + ingredient_index,
                    source="precursors.items.ingredients",
                )
        for index, substrate in enumerate(modules["substrates"]["items"]):
            material = substrate.get("material")
            if material:
                self._feature(
                    revision,
                    "substrate_material",
                    text=str(material),
                    ordinal=index,
                    source="substrates.items.material",
                )
        timeline = modules["process_steps"]
        numeric_by_type_and_source: dict[tuple[str, str], list[float]] = {}
        gas_ordinal = 0
        ramp_rates: dict[str, list[float]] = {"setpoint": [], "measured": []}
        cooling_rates: dict[str, list[float]] = {"setpoint": [], "measured": []}
        projected_channels = list(
            self.db.scalars(
                select(ProcessChannel).where(ProcessChannel.run_revision_id == revision.id)
            )
        )
        for channel in projected_channels:
            if channel.projection_status != "ready":
                continue
            values = numeric_by_type_and_source.setdefault(
                (channel.channel_type, channel.source_type),
                [],
            )
            if channel.canonical_scalar_value is not None:
                values.append(channel.canonical_scalar_value)
            for point in channel.canonical_series_json or []:
                value = point.get("value")
                if isinstance(value, int | float) and not isinstance(value, bool):
                    values.append(float(value))
            if channel.statistics_json:
                values.extend(
                    float(channel.statistics_json[key])
                    for key in ("min", "max")
                    if isinstance(channel.statistics_json.get(key), int | float)
                )
            if channel.channel_type == "temperature" and channel.source_type in ramp_rates:
                if channel.statistics_json:
                    ramp_rates[channel.source_type].append(
                        float(channel.statistics_json["ramp_rate_per_min"])
                    )
                    cooling_rates[channel.source_type].append(
                        float(channel.statistics_json["cooling_rate_per_min"])
                    )
                numeric_points = [
                    point
                    for point in channel.canonical_series_json or []
                    if isinstance(point.get("value"), int | float)
                    and not isinstance(point.get("value"), bool)
                    and "start_s" in point
                ]
                for left, right in zip(numeric_points, numeric_points[1:], strict=False):
                    elapsed_s = right["start_s"] - left["start_s"]
                    if elapsed_s > 0:
                        ramp_rates[channel.source_type].append(
                            abs(float(right["value"]) - float(left["value"])) / (elapsed_s / 60)
                        )
            if channel.channel_type == "flow":
                self._feature(
                    revision,
                    "gas_species",
                    text=channel.gas_species_code,
                    ordinal=gas_ordinal,
                    source="process_steps.channels.gas_species_code",
                )
                gas_ordinal += 1
        for source_type, rates in ramp_rates.items():
            if rates:
                self._feature(
                    revision,
                    f"ramp_rate_{source_type}_C_min",
                    numeric=max(rates),
                    unit="°C/min",
                    source=f"process_steps.channels.temperature.{source_type}",
                )
        for source_type, rates in cooling_rates.items():
            if rates:
                self._feature(
                    revision,
                    f"cooling_rate_{source_type}_C_min",
                    numeric=max(rates),
                    unit="°C/min",
                    source=f"process_steps.channels.temperature.{source_type}",
                )
        for source_type in ("setpoint", "measured"):
            temperature = numeric_by_type_and_source.get(("temperature", source_type)) or []
            pressure = numeric_by_type_and_source.get(("pressure", source_type)) or []
            if temperature:
                self._feature(
                    revision,
                    f"max_temperature_{source_type}_C",
                    numeric=max(temperature),
                    unit="°C",
                    source=f"process_steps.channels.temperature.{source_type}",
                )
            for suffix, reducer in (("min", min), ("max", max)):
                if pressure:
                    self._feature(
                        revision,
                        f"pressure_{source_type}_{suffix}_Pa",
                        numeric=reducer(pressure),
                        unit="Pa",
                        source=f"process_steps.channels.pressure.{source_type}",
                    )
        growth_duration = sum(
            item["end_s"] - item["start_s"]
            for item in timeline["segments"]
            if item["segment_type"] in {"reaction", "nucleation", "growth"}
        )
        if growth_duration > 0:
            self._feature(
                revision,
                "growth_duration_s",
                numeric=growth_duration,
                unit="s",
                source="process_steps.segments",
            )
        self._feature(
            revision,
            "has_process_event",
            boolean=bool((modules.get("process_events") or {}).get("items")),
            source="process_events.items",
        )
        self._feature(
            revision,
            "provenance_complete",
            boolean=False,
            source="measurement evidence pending",
        )

    def _feature(
        self,
        revision: RunRevision,
        code: str,
        *,
        numeric: float | None = None,
        text: str | None = None,
        boolean: bool | None = None,
        unit: str | None = None,
        ordinal: int = 0,
        source: str,
    ) -> None:
        self.db.add(
            RunFeature(
                run_revision_id=revision.id,
                feature_code=code,
                ordinal=ordinal,
                numeric_value=numeric,
                text_value=text,
                boolean_value=boolean,
                unit=unit,
                source_path=source,
            )
        )
