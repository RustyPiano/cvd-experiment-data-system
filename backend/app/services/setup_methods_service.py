from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.file_asset import FileAsset
from app.models.setup_library import SetupLibraryEntry
from app.models.setup_methods import ExperimentSetupSnapshot
from app.models.user import User, UserRole
from app.repositories.experiment_repository import ExperimentRepository
from app.repositories.file_asset_repository import FileAssetRepository
from app.repositories.setup_methods_repository import SetupMethodsRepository
from app.schemas.experiment_validation import (
    ExperimentValidationIssue,
    ExperimentValidationResponse,
)
from app.schemas.setup_methods import (
    SetupMethodsFromLibraryRequest,
    SetupMethodsFromTemplateRequest,
    SetupMethodsMutationResponse,
    SetupMethodsRead,
    SetupMethodsUpsert,
    SetupMethodTemplateRead,
)
from app.services.audit_service import AuditService
from app.services.experiment_validation_service import ExperimentValidationFailed
from app.services.file_storage_service import FileStorageService
from app.services.setup_library_service import SetupLibraryService
from app.services.setup_method_template_service import SetupMethodTemplateService
from app.services.setup_methods_content_validation import validate_setup_content
from app.services.setup_methods_hash_service import SetupMethodsHashService

TEMPLATE_CORE_FIELDS = (
    "setup_name_snapshot",
    "institution_snapshot",
    "apparatus_description_snapshot",
    "methods_text_snapshot",
    "sample_placement_description_snapshot",
    "reaction_flow_description_snapshot",
    "reference_paper_url_snapshot",
    "unpublished_reason_snapshot",
)


class SetupMethodsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)
        self.files = FileAssetRepository(db)
        self.setup_methods = SetupMethodsRepository(db)
        self.audit = AuditService(db)
        self.hashes = SetupMethodsHashService()
        self.storage = FileStorageService()
        self.templates = SetupMethodTemplateService()
        self.setup_library = SetupLibraryService(db)

    def get_setup_methods(self, experiment_id: UUID, current_user: User) -> SetupMethodsRead:
        experiment = self._get_visible_experiment(experiment_id, current_user)
        snapshot = self.setup_methods.get_by_experiment(experiment.id)
        if snapshot is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Setup methods not found",
            )
        return self._to_read(snapshot)

    def upsert_setup_methods(
        self,
        experiment_id: UUID,
        payload: SetupMethodsUpsert,
        current_user: User,
    ) -> SetupMethodsMutationResponse:
        experiment = self._get_owned_draft_experiment(experiment_id, current_user)
        snapshot = self._upsert_snapshot_from_payload(experiment, payload, current_user)
        self.db.commit()
        return SetupMethodsMutationResponse(data=self._to_read(snapshot), warnings=[])

    def create_from_template(
        self,
        experiment_id: UUID,
        payload: SetupMethodsFromTemplateRequest,
        current_user: User,
    ) -> SetupMethodsMutationResponse:
        experiment = self._get_owned_draft_experiment(experiment_id, current_user)
        template = self.templates.get_template(payload.template_key, payload.template_version)
        if template is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Setup method template not found",
            )

        diagram_file_asset_id, warning = self._materialize_template_diagram(
            experiment,
            template,
            current_user,
        )
        warnings = [warning] if warning is not None else []
        existing = self.setup_methods.get_by_experiment(experiment.id)
        before = self._serialize_snapshot(existing)
        snapshot = existing or ExperimentSetupSnapshot(experiment_run_id=experiment.id)
        snapshot.source_template_key = template.template_key
        snapshot.source_template_version = template.template_version
        snapshot.setup_key_snapshot = template.template_key
        snapshot.setup_name_snapshot = template.name
        snapshot.setup_version_snapshot = template.template_version
        snapshot.institution_snapshot = template.institution
        snapshot.apparatus_description_snapshot = template.apparatus_description
        snapshot.methods_text_snapshot = template.methods_text
        snapshot.sample_placement_description_snapshot = template.sample_placement_description
        snapshot.reaction_flow_description_snapshot = template.reaction_flow_description
        snapshot.reference_paper_url_snapshot = template.reference_paper_url
        snapshot.unpublished_reason_snapshot = template.unpublished_reason
        snapshot.diagram_file_asset_id = diagram_file_asset_id
        snapshot.is_same_as_template = True
        snapshot.deviation_note = None
        snapshot.confirmed_by_id = None
        snapshot.confirmed_at = None
        snapshot.metadata_json = {"semantic_context": template.semantic_context}
        self._recalculate_snapshot_hash(snapshot)
        saved = self.setup_methods.save(snapshot)
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_setup_snapshot",
            entity_id=saved.id,
            action="create_from_template",
            before_json=before,
            after_json=self._serialize_snapshot(saved),
        )
        self.db.commit()
        return SetupMethodsMutationResponse(data=self._to_read(saved), warnings=warnings)

    def create_from_library(
        self,
        experiment_id: UUID,
        payload: SetupMethodsFromLibraryRequest,
        current_user: User,
    ) -> SetupMethodsMutationResponse:
        experiment = self._get_owned_draft_experiment(experiment_id, current_user)
        entry = self.setup_library.get_visible_entry(payload.setup_library_id, current_user)

        warnings: list[ExperimentValidationIssue] = []
        diagram_file = self._copy_library_diagram(entry, experiment, current_user)
        if diagram_file is None:
            warnings.append(
                self._issue(
                    "setup_methods",
                    "diagram_file_asset_id",
                    "Referenced setup has no diagram; upload one to the setup before submitting",
                )
            )

        existing = self.setup_methods.get_by_experiment(experiment.id)
        previous_diagram_id = existing.diagram_file_asset_id if existing is not None else None
        before = self._serialize_snapshot(existing)
        snapshot = existing or ExperimentSetupSnapshot(experiment_run_id=experiment.id)
        snapshot.source_template_key = None
        snapshot.source_template_version = None
        snapshot.source_setup_library_id = entry.id
        snapshot.setup_name_snapshot = entry.name
        snapshot.institution_snapshot = entry.institution
        snapshot.apparatus_description_snapshot = entry.apparatus_description
        snapshot.methods_text_snapshot = entry.methods_text
        snapshot.sample_placement_description_snapshot = entry.sample_placement_description
        snapshot.reaction_flow_description_snapshot = entry.reaction_flow_description
        snapshot.reference_paper_url_snapshot = entry.reference_paper_url
        snapshot.unpublished_reason_snapshot = entry.unpublished_reason
        snapshot.diagram_file_asset_id = diagram_file.id if diagram_file is not None else None
        snapshot.is_same_as_template = True
        snapshot.deviation_note = None
        snapshot.confirmed_by_id = None
        snapshot.confirmed_at = None
        snapshot.setup_version_snapshot = 1
        snapshot.metadata_json = {"semantic_context": entry.semantic_context or {}}
        self._recalculate_snapshot_hash(snapshot, diagram_file=diagram_file)
        new_diagram_id = diagram_file.id if diagram_file is not None else None
        stale_blob_path = None
        if previous_diagram_id is not None and previous_diagram_id != new_diagram_id:
            stale_blob_path = self._soft_delete_diagram_file(previous_diagram_id, current_user)
        saved = self.setup_methods.save(snapshot)
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_setup_snapshot",
            entity_id=saved.id,
            action="create_from_library",
            before_json=before,
            after_json=self._serialize_snapshot(saved),
        )
        self.db.commit()
        if stale_blob_path is not None:
            try:
                self.storage.delete(stale_blob_path)
            except (OSError, ValueError):
                pass
        return SetupMethodsMutationResponse(data=self._to_read(saved), warnings=warnings)

    def confirm_setup_methods(
        self,
        experiment_id: UUID,
        current_user: User,
    ) -> SetupMethodsMutationResponse:
        experiment = self._get_owned_draft_experiment(experiment_id, current_user)
        snapshot = self.setup_methods.get_by_experiment(experiment.id)
        if snapshot is not None:
            self._recalculate_snapshot_hash(snapshot)
        errors: list[ExperimentValidationIssue] = []
        validate_setup_content(snapshot, self._issue, errors)
        if (
            snapshot is not None
            and snapshot.diagram_file_asset_id is not None
            and not self._is_valid_setup_diagram_file(
                experiment,
                snapshot.diagram_file_asset_id,
            )
        ):
            errors.append(
                self._issue(
                    "setup_methods",
                    "diagram_file_asset_id",
                    "Setup diagram must be an active setup diagram file",
                )
            )
        if errors:
            raise ExperimentValidationFailed(
                ExperimentValidationResponse(ok=False, errors=errors, warnings=[])
            )

        assert snapshot is not None
        before = self._serialize_snapshot(snapshot)
        snapshot.confirmed_by_id = current_user.id
        snapshot.confirmed_at = datetime.now(UTC)
        saved = self.setup_methods.save(snapshot)
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_setup_snapshot",
            entity_id=saved.id,
            action="confirm",
            before_json=before,
            after_json=self._serialize_snapshot(saved),
        )
        self.db.commit()
        return SetupMethodsMutationResponse(data=self._to_read(saved), warnings=[])

    def clone_snapshot(
        self,
        *,
        source_experiment: ExperimentRun,
        target_experiment: ExperimentRun,
        current_user: User,
    ) -> ExperimentSetupSnapshot | None:
        source_snapshot = self.setup_methods.get_by_experiment(source_experiment.id)
        if source_snapshot is None:
            return None

        diagram_file = self._copy_setup_diagram_file(
            source_snapshot=source_snapshot,
            target_experiment=target_experiment,
            current_user=current_user,
        )
        cloned = ExperimentSetupSnapshot(
            experiment_run_id=target_experiment.id,
            source_template_key=source_snapshot.source_template_key,
            source_template_version=source_snapshot.source_template_version,
            source_setup_library_id=source_snapshot.source_setup_library_id,
            setup_key_snapshot=source_snapshot.setup_key_snapshot,
            setup_name_snapshot=source_snapshot.setup_name_snapshot,
            setup_version_snapshot=source_snapshot.setup_version_snapshot,
            institution_snapshot=source_snapshot.institution_snapshot,
            apparatus_description_snapshot=source_snapshot.apparatus_description_snapshot,
            methods_text_snapshot=source_snapshot.methods_text_snapshot,
            sample_placement_description_snapshot=(
                source_snapshot.sample_placement_description_snapshot
            ),
            reaction_flow_description_snapshot=source_snapshot.reaction_flow_description_snapshot,
            reference_paper_url_snapshot=source_snapshot.reference_paper_url_snapshot,
            unpublished_reason_snapshot=source_snapshot.unpublished_reason_snapshot,
            diagram_file_asset_id=diagram_file.id if diagram_file is not None else None,
            is_same_as_template=source_snapshot.is_same_as_template,
            deviation_note=source_snapshot.deviation_note,
            confirmed_by_id=None,
            confirmed_at=None,
            snapshot_hash=source_snapshot.snapshot_hash,
            metadata_json=deepcopy(source_snapshot.metadata_json or {}),
        )
        self._recalculate_snapshot_hash(cloned, diagram_file=diagram_file)
        saved = self.setup_methods.save(cloned)
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_setup_snapshot",
            entity_id=saved.id,
            action="clone",
            before_json=self._serialize_snapshot(source_snapshot),
            after_json=self._serialize_snapshot(saved),
        )
        return saved

    def _upsert_snapshot_from_payload(
        self,
        experiment: ExperimentRun,
        payload: SetupMethodsUpsert,
        current_user: User,
    ) -> ExperimentSetupSnapshot:
        diagram_file = self._validate_setup_diagram_file(experiment, payload.diagram_file_asset_id)
        existing = self.setup_methods.get_by_experiment(experiment.id)
        before = self._serialize_snapshot(existing)
        previous_snapshot_hash = existing.snapshot_hash if existing is not None else None
        previous_confirmed_by_id = existing.confirmed_by_id if existing is not None else None
        previous_confirmed_at = existing.confirmed_at if existing is not None else None
        snapshot = existing or ExperimentSetupSnapshot(experiment_run_id=experiment.id)
        snapshot.setup_name_snapshot = payload.setup_name_snapshot
        snapshot.institution_snapshot = payload.institution_snapshot
        snapshot.apparatus_description_snapshot = payload.apparatus_description_snapshot
        snapshot.methods_text_snapshot = payload.methods_text_snapshot
        snapshot.sample_placement_description_snapshot = (
            payload.sample_placement_description_snapshot
        )
        snapshot.reaction_flow_description_snapshot = payload.reaction_flow_description_snapshot
        snapshot.reference_paper_url_snapshot = payload.reference_paper_url_snapshot
        snapshot.unpublished_reason_snapshot = payload.unpublished_reason_snapshot
        snapshot.diagram_file_asset_id = diagram_file.id if diagram_file is not None else None
        snapshot.source_setup_library_id = payload.source_setup_library_id
        snapshot.is_same_as_template = self._resolve_template_match(snapshot, payload)
        snapshot.deviation_note = self._normalized_optional_text(payload.deviation_note)
        snapshot.metadata_json = {"semantic_context": payload.semantic_context}
        if snapshot.source_template_key is None:
            snapshot.setup_version_snapshot = 1
        self._recalculate_snapshot_hash(snapshot, diagram_file=diagram_file)
        if previous_snapshot_hash is not None and snapshot.snapshot_hash == previous_snapshot_hash:
            snapshot.confirmed_by_id = previous_confirmed_by_id
            snapshot.confirmed_at = previous_confirmed_at
        else:
            snapshot.confirmed_by_id = None
            snapshot.confirmed_at = None
        saved = self.setup_methods.save(snapshot)
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_setup_snapshot",
            entity_id=saved.id,
            action="upsert",
            before_json=before,
            after_json=self._serialize_snapshot(saved),
        )
        return saved

    def _copy_library_diagram(
        self,
        entry: SetupLibraryEntry,
        target_experiment: ExperimentRun,
        current_user: User,
    ) -> FileAsset | None:
        if entry.diagram_storage_path is None:
            return None

        target_file_id = uuid4()
        try:
            relative_path, sha256 = self.storage.copy_between_experiments(
                source_storage_path=entry.diagram_storage_path,
                target_experiment_run_code=target_experiment.run_code,
                target_file_id=target_file_id,
                original_name=entry.diagram_original_name or "setup-diagram",
            )
        except (OSError, ValueError) as exc:
            # The library declares a diagram but its blob is missing/unreadable.
            # Surface this instead of masking it as a "setup has no diagram" warning.
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Failed to copy setup diagram from the referenced setup",
            ) from exc

        copied = FileAsset(
            id=target_file_id,
            experiment_run_id=target_experiment.id,
            sample_id=None,
            uploaded_by_id=current_user.id,
            original_name=entry.diagram_original_name or "setup-diagram",
            storage_path=relative_path,
            content_type=entry.diagram_content_type,
            size_bytes=entry.diagram_size_bytes or 0,
            sha256=sha256,
            method="setup_diagram",
            file_category="raw",
            asset_role="setup_diagram",
            note=None,
            file_kind="setup_diagram",
            metadata_json={"source_setup_library_id": str(entry.id)},
        )
        saved = self.files.create(copied)
        self.audit.record_event(
            actor=current_user,
            entity_type="file_asset",
            entity_id=saved.id,
            action="create",
            before_json=None,
            after_json=self._serialize_file_asset(saved),
        )
        return saved

    def _soft_delete_diagram_file(self, file_asset_id: UUID, current_user: User) -> str | None:
        """Soft-delete a setup diagram FileAsset that the snapshot no longer references.

        Returns the blob path to remove after commit, or None if nothing to delete.
        """
        file_asset = self.files.get_by_id(file_asset_id)
        if file_asset is None or file_asset.deleted_at is not None:
            return None
        before = self._serialize_file_asset(file_asset)
        file_asset.deleted_at = datetime.now(UTC)
        file_asset.deleted_by_id = current_user.id
        saved = self.files.save(file_asset)
        self.audit.record_event(
            actor=current_user,
            entity_type="file_asset",
            entity_id=saved.id,
            action="delete",
            before_json=before,
            after_json=self._serialize_file_asset(saved),
        )
        return saved.storage_path

    def _resolve_template_match(
        self,
        snapshot: ExperimentSetupSnapshot,
        payload: SetupMethodsUpsert,
    ) -> bool:
        if snapshot.source_setup_library_id is not None:
            return payload.is_same_as_template
        if snapshot.source_template_key is None:
            return False
        if not payload.is_same_as_template:
            return False
        template = self.templates.get_template(
            snapshot.source_template_key,
            snapshot.source_template_version,
        )
        if template is None:
            return False
        return self._payload_matches_template(payload, template)

    def _payload_matches_template(
        self,
        payload: SetupMethodsUpsert,
        template: SetupMethodTemplateRead,
    ) -> bool:
        expected = {
            "setup_name_snapshot": template.name,
            "institution_snapshot": template.institution,
            "apparatus_description_snapshot": template.apparatus_description,
            "methods_text_snapshot": template.methods_text,
            "sample_placement_description_snapshot": template.sample_placement_description,
            "reaction_flow_description_snapshot": template.reaction_flow_description,
            "reference_paper_url_snapshot": template.reference_paper_url,
            "unpublished_reason_snapshot": template.unpublished_reason,
        }
        if any(getattr(payload, field) != expected[field] for field in TEMPLATE_CORE_FIELDS):
            return False
        return payload.semantic_context == template.semantic_context

    def _validate_setup_diagram_file(
        self,
        experiment: ExperimentRun,
        diagram_file_asset_id: UUID | None,
    ) -> FileAsset | None:
        if diagram_file_asset_id is None:
            return None
        file_asset = self.files.get_by_id(diagram_file_asset_id)
        if (
            file_asset is None
            or file_asset.deleted_at is not None
            or file_asset.experiment_run_id != experiment.id
            or file_asset.asset_role != "setup_diagram"
            or file_asset.sample_id is not None
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Setup diagram must belong to the same experiment",
            )
        return file_asset

    def _is_valid_setup_diagram_file(
        self,
        experiment: ExperimentRun,
        diagram_file_asset_id: UUID | None,
    ) -> bool:
        if diagram_file_asset_id is None:
            return False
        file_asset = self.files.get_by_id(diagram_file_asset_id)
        return (
            file_asset is not None
            and file_asset.deleted_at is None
            and file_asset.experiment_run_id == experiment.id
            and file_asset.asset_role == "setup_diagram"
            and file_asset.sample_id is None
        )

    def _materialize_template_diagram(
        self,
        experiment: ExperimentRun,
        template: SetupMethodTemplateRead,
        current_user: User,
    ) -> tuple[UUID | None, ExperimentValidationIssue | None]:
        del experiment, current_user
        if not template.has_packaged_diagram:
            return None, None
        return None, self._issue(
            "setup_methods",
            "diagram_file_asset_id",
            "Setup diagram could not be materialized from template",
        )

    def _copy_setup_diagram_file(
        self,
        *,
        source_snapshot: ExperimentSetupSnapshot,
        target_experiment: ExperimentRun,
        current_user: User,
    ) -> FileAsset | None:
        if source_snapshot.diagram_file_asset_id is None:
            return None
        source_file = self.files.get_by_id(source_snapshot.diagram_file_asset_id)
        if source_file is None or source_file.deleted_at is not None:
            return None

        target_file_id = uuid4()
        try:
            relative_path, sha256 = self.storage.copy_between_experiments(
                source_storage_path=source_file.storage_path,
                target_experiment_run_code=target_experiment.run_code,
                target_file_id=target_file_id,
                original_name=source_file.original_name,
            )
        except (OSError, ValueError):
            return None

        copied = FileAsset(
            id=target_file_id,
            experiment_run_id=target_experiment.id,
            sample_id=None,
            uploaded_by_id=current_user.id,
            original_name=source_file.original_name,
            storage_path=relative_path,
            content_type=source_file.content_type,
            size_bytes=source_file.size_bytes,
            sha256=sha256,
            method="setup_diagram",
            file_category=source_file.file_category,
            asset_role="setup_diagram",
            note=source_file.note,
            file_kind="setup_diagram",
            metadata_json=deepcopy(source_file.metadata_json or {}),
        )
        saved = self.files.create(copied)
        self.audit.record_event(
            actor=current_user,
            entity_type="file_asset",
            entity_id=saved.id,
            action="create",
            before_json=None,
            after_json=self._serialize_file_asset(saved),
        )
        return saved

    def _recalculate_snapshot_hash(
        self,
        snapshot: ExperimentSetupSnapshot,
        *,
        diagram_file: FileAsset | None = None,
    ) -> None:
        if diagram_file is None and snapshot.diagram_file_asset_id is not None:
            diagram_file = self.files.get_by_id(snapshot.diagram_file_asset_id)
        snapshot_hash = self.hashes.calculate_hash(
            {
                "setup_name_snapshot": snapshot.setup_name_snapshot,
                "setup_version_snapshot": snapshot.setup_version_snapshot,
                "institution_snapshot": snapshot.institution_snapshot,
                "apparatus_description_snapshot": snapshot.apparatus_description_snapshot,
                "methods_text_snapshot": snapshot.methods_text_snapshot,
                "sample_placement_description_snapshot": (
                    snapshot.sample_placement_description_snapshot
                ),
                "reaction_flow_description_snapshot": snapshot.reaction_flow_description_snapshot,
                "reference_paper_url_snapshot": snapshot.reference_paper_url_snapshot,
                "unpublished_reason_snapshot": snapshot.unpublished_reason_snapshot,
                "diagram_sha256": diagram_file.sha256 if diagram_file is not None else None,
                "is_same_as_template": snapshot.is_same_as_template,
                "deviation_note": snapshot.deviation_note,
                "metadata_json": snapshot.metadata_json,
            }
        )
        snapshot.snapshot_hash = snapshot_hash
        if snapshot.source_template_key is None:
            snapshot.setup_key_snapshot = self.hashes.manual_key(snapshot_hash)
        else:
            snapshot.setup_key_snapshot = snapshot.source_template_key
            if snapshot.source_template_version is not None:
                snapshot.setup_version_snapshot = snapshot.source_template_version

    def _to_read(self, snapshot: ExperimentSetupSnapshot) -> SetupMethodsRead:
        metadata = snapshot.metadata_json or {}
        semantic_context = metadata.get("semantic_context") if isinstance(metadata, dict) else None
        return SetupMethodsRead.model_validate(
            {
                "id": snapshot.id,
                "experiment_run_id": snapshot.experiment_run_id,
                "source_template_key": snapshot.source_template_key,
                "source_template_version": snapshot.source_template_version,
                "source_setup_library_id": snapshot.source_setup_library_id,
                "setup_key_snapshot": snapshot.setup_key_snapshot,
                "setup_name_snapshot": snapshot.setup_name_snapshot,
                "setup_version_snapshot": snapshot.setup_version_snapshot,
                "institution_snapshot": snapshot.institution_snapshot,
                "apparatus_description_snapshot": snapshot.apparatus_description_snapshot,
                "methods_text_snapshot": snapshot.methods_text_snapshot,
                "sample_placement_description_snapshot": (
                    snapshot.sample_placement_description_snapshot
                ),
                "reaction_flow_description_snapshot": snapshot.reaction_flow_description_snapshot,
                "reference_paper_url_snapshot": snapshot.reference_paper_url_snapshot,
                "unpublished_reason_snapshot": snapshot.unpublished_reason_snapshot,
                "diagram_file_asset_id": snapshot.diagram_file_asset_id,
                "is_same_as_template": snapshot.is_same_as_template,
                "deviation_note": snapshot.deviation_note,
                "confirmed_by_id": snapshot.confirmed_by_id,
                "confirmed_at": snapshot.confirmed_at,
                "snapshot_hash": snapshot.snapshot_hash,
                "semantic_context": semantic_context if isinstance(semantic_context, dict) else {},
                "created_at": snapshot.created_at,
                "updated_at": snapshot.updated_at,
            }
        )

    def _serialize_snapshot(
        self,
        snapshot: ExperimentSetupSnapshot | None,
    ) -> dict[str, Any] | None:
        if snapshot is None:
            return None
        return self._to_read(snapshot).model_dump(mode="json")

    def _serialize_file_asset(self, file_asset: FileAsset) -> dict[str, Any]:
        return {
            "id": str(file_asset.id),
            "experiment_run_id": str(file_asset.experiment_run_id),
            "sample_id": str(file_asset.sample_id) if file_asset.sample_id else None,
            "uploaded_by_id": str(file_asset.uploaded_by_id),
            "original_name": file_asset.original_name,
            "storage_path": file_asset.storage_path,
            "content_type": file_asset.content_type,
            "size_bytes": file_asset.size_bytes,
            "sha256": file_asset.sha256,
            "method": file_asset.method,
            "file_category": file_asset.file_category,
            "asset_role": file_asset.asset_role,
            "note": file_asset.note,
            "metadata_json": file_asset.metadata_json,
        }

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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    def _get_owned_draft_experiment(
        self,
        experiment_id: UUID,
        current_user: User,
    ) -> ExperimentRun:
        if current_user.role == UserRole.VIEWER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
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
        if experiment.status != ExperimentStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only draft experiments can be updated",
            )
        return experiment

    def _issue(self, module_key: str, field_path: str, message: str) -> ExperimentValidationIssue:
        return ExperimentValidationIssue(
            module_key=module_key,
            field_path=field_path,
            message=message,
        )

    def _normalized_optional_text(self, value: str | None) -> str | None:
        normalized = (value or "").strip()
        return normalized or None
