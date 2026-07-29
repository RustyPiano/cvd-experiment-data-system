from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun
from app.models.file_asset import FileAsset
from app.models.sample import Sample, SampleRole
from app.models.scientific import SampleRevisionAssociation, SampleRevisionState
from app.models.user import User
from app.models.v2_results import CharacterizationRecord, MeasuredProduct
from app.repositories.experiment_repository import ExperimentRepository
from app.repositories.sample_repository import SampleRepository
from app.schemas.sample import ControlSampleCreate, SampleListResponse, SampleRead, SampleUpdate
from app.services.audit_service import AuditService
from app.services.experiment_guards import (
    ensure_results_editable,
    get_owned_experiment,
    get_visible_experiment,
)
from app.services.v2_entity_snapshot_service import (
    MATERIAL_LOT_PROJECTED_FIELDS,
    material_lot_item_projection,
)


class SampleService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)
        self.samples = SampleRepository(db)
        self.audit = AuditService(db)

    def list_samples(
        self,
        *,
        current_user: User,
        experiment_id: UUID | None = None,
        role: SampleRole | None = None,
        sample_code: str | None = None,
    ) -> SampleListResponse:
        items = self.samples.list_visible(
            current_user=current_user,
            experiment_id=experiment_id,
            role=role,
            sample_code=sample_code,
        )
        return SampleListResponse(
            items=[SampleRead.model_validate(item) for item in items],
            total=len(items),
        )

    def get_sample(self, sample_id: UUID, current_user: User) -> SampleRead:
        return SampleRead.model_validate(self._get_visible_sample(sample_id, current_user))

    def create_sample(
        self,
        experiment_id: UUID,
        payload: ControlSampleCreate,
        current_user: User,
    ) -> SampleRead:
        experiment = get_owned_experiment(self.experiments, experiment_id, current_user)
        ensure_results_editable(experiment)

        sample = Sample(
            sample_code=self.next_sample_code(experiment),
            experiment_run_id=experiment.id,
            role=SampleRole.CONTROL.value,
            control_subtype=payload.control_subtype,
            metadata_json=payload.metadata_json,
        )
        try:
            created = self.samples.create(sample)
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Sample code already exists",
            ) from exc
        self.audit.record_event(
            actor=current_user,
            entity_type="sample",
            entity_id=created.id,
            action="create",
            before_json=None,
            after_json=self._serialize_sample(created),
        )
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=experiment.id,
            action="create_sample",
            before_json=None,
            after_json={"sample_code": created.sample_code, "role": created.role},
        )
        self.db.commit()
        return SampleRead.model_validate(created)

    def update_sample(
        self,
        sample_id: UUID,
        payload: SampleUpdate,
        current_user: User,
    ) -> SampleRead:
        sample = self._get_editable_sample(sample_id, current_user)
        before = self._serialize_sample(sample)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(sample, field, value)
        saved = self.samples.save(sample)
        self.audit.record_event(
            actor=current_user,
            entity_type="sample",
            entity_id=saved.id,
            action="update",
            before_json=before,
            after_json=self._serialize_sample(saved),
        )
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=sample.experiment_run_id,
            action="update_sample",
            before_json={"sample_code": before["sample_code"]},
            after_json={"sample_code": saved.sample_code},
        )
        self.db.commit()
        return SampleRead.model_validate(saved)

    def sync_growth_samples(
        self,
        experiment: ExperimentRun,
        substrate_items: list[dict[str, Any]],
        current_user: User,
        run_revision_id: UUID | None = None,
    ) -> None:
        """Synchronize lock-generated samples without committing the lock transaction."""
        existing = self.samples.list_by_experiment(experiment.id, include_deleted=True)
        by_source = {
            sample.source_substrate_id: sample
            for sample in existing
            if sample.source_substrate_id is not None
        }
        active_source_ids = {UUID(str(item["source_id"])) for item in substrate_items}

        stale = [
            sample
            for sample in existing
            if sample.role == SampleRole.GROWTH.value
            and sample.deleted_at is None
            and sample.source_substrate_id not in active_source_ids
        ]
        for item in substrate_items:
            source_id = UUID(str(item["source_id"]))
            snapshot = self._source_substrate_snapshot(item)
            sample = by_source.get(source_id)
            if sample is None:
                sample = Sample(
                    sample_code=self.next_sample_code(experiment),
                    experiment_run_id=experiment.id,
                    run_revision_id=run_revision_id,
                    role=SampleRole.GROWTH.value,
                    actual_state="unknown",
                    source_substrate_id=source_id,
                    source_substrate_snapshot_json=snapshot,
                    metadata_json={},
                )
                self.samples.create(sample)
                self.audit.record_event(
                    actor=current_user,
                    entity_type="sample",
                    entity_id=sample.id,
                    action="create",
                    before_json=None,
                    after_json=self._serialize_sample(sample),
                )
                existing.append(sample)
                self._record_revision_association(sample, run_revision_id, snapshot)
                continue

            before = self._serialize_sample(sample)
            action = "restore" if sample.deleted_at is not None else "update"
            sample.role = SampleRole.GROWTH.value
            sample.run_revision_id = run_revision_id
            sample.actual_state = "unknown"
            sample.identity_state = "unknown"
            sample.actual_material_summary = None
            sample.source_substrate_snapshot_json = snapshot
            sample.deleted_at = None
            sample.deleted_by_id = None
            self.samples.save(sample)
            after = self._serialize_sample(sample)
            if before != after:
                self.audit.record_event(
                    actor=current_user,
                    entity_type="sample",
                    entity_id=sample.id,
                    action=action,
                    before_json=before,
                    after_json=after,
                )
            self._record_revision_association(sample, run_revision_id, snapshot)

        for sample in stale:
            if self._has_result_evidence(sample.id):
                continue
            before = self._serialize_sample(sample)
            sample.deleted_at = datetime.now(UTC)
            sample.deleted_by_id = current_user.id
            self.samples.save(sample)
            self.audit.record_event(
                actor=current_user,
                entity_type="sample",
                entity_id=sample.id,
                action="delete",
                before_json=before,
                after_json=self._serialize_sample(sample),
                reason="source_substrate_removed",
            )

    @staticmethod
    def _source_substrate_snapshot(item: dict[str, Any]) -> dict[str, Any]:
        projected = dict(item)
        reference = projected.get("lot_ref")
        frozen_snapshot = reference.get("snapshot") if isinstance(reference, dict) else None
        if isinstance(frozen_snapshot, dict):
            for key in MATERIAL_LOT_PROJECTED_FIELDS["substrates"]:
                projected.pop(key, None)
            projected.update(material_lot_item_projection("substrates", frozen_snapshot))
        return {key: value for key, value in projected.items() if key != "source_id"}

    def next_sample_code(self, experiment: ExperimentRun) -> str:
        prefix = f"{experiment.run_code}-S"
        used = {
            sample.sample_code
            for sample in self.samples.list_by_experiment(experiment.id, include_deleted=True)
        }
        sequence = 1
        while f"{prefix}{sequence:02d}" in used:
            sequence += 1
        return f"{prefix}{sequence:02d}"

    def _has_result_evidence(self, sample_id: UUID) -> bool:
        child = self.db.scalar(
            select(Sample.id)
            .where(Sample.parent_sample_id == sample_id, Sample.deleted_at.is_(None))
            .limit(1)
        )
        if child is not None:
            return True
        record = self.db.scalar(
            select(CharacterizationRecord.id)
            .where(CharacterizationRecord.sample_id == sample_id)
            .limit(1)
        )
        if record is not None:
            return True
        product = self.db.scalar(
            select(MeasuredProduct.id).where(MeasuredProduct.sample_id == sample_id).limit(1)
        )
        if product is not None:
            return True
        file_asset = self.db.scalar(
            select(FileAsset.id)
            .where(FileAsset.sample_id == sample_id, FileAsset.deleted_at.is_(None))
            .limit(1)
        )
        return file_asset is not None

    def _get_visible_sample(self, sample_id: UUID, current_user: User) -> Sample:
        sample = self.samples.get_by_id(sample_id)
        if sample is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
        get_visible_experiment(self.experiments, sample.experiment_run_id, current_user)
        return sample

    def _get_editable_sample(self, sample_id: UUID, current_user: User) -> Sample:
        sample = self._get_visible_sample(sample_id, current_user)
        experiment = get_owned_experiment(self.experiments, sample.experiment_run_id, current_user)
        ensure_results_editable(experiment)
        return sample

    def _serialize_sample(self, sample: Sample | None) -> dict | None:
        if sample is None:
            return None
        return {
            "id": str(sample.id),
            "sample_code": sample.sample_code,
            "experiment_run_id": str(sample.experiment_run_id),
            "parent_sample_id": str(sample.parent_sample_id) if sample.parent_sample_id else None,
            "role": sample.role,
            "source_substrate_id": (
                str(sample.source_substrate_id) if sample.source_substrate_id else None
            ),
            "source_substrate_snapshot_json": sample.source_substrate_snapshot_json,
            "metadata_json": sample.metadata_json,
            "deleted_at": sample.deleted_at.isoformat() if sample.deleted_at else None,
            "deleted_by_id": str(sample.deleted_by_id) if sample.deleted_by_id else None,
            "is_deleted": sample.deleted_at is not None,
        }

    def _record_revision_association(
        self,
        sample: Sample,
        run_revision_id: UUID | None,
        source_snapshot: dict[str, Any],
    ) -> None:
        if run_revision_id is None:
            return
        self.db.add(
            SampleRevisionAssociation(
                sample_id=sample.id,
                run_revision_id=run_revision_id,
                sample_snapshot_json={
                    "sample_code": sample.sample_code,
                    "role": sample.role,
                    "source_substrate_id": str(sample.source_substrate_id),
                    "source_substrate_snapshot": source_snapshot,
                },
            )
        )
        self.db.add(
            SampleRevisionState(
                sample_id=sample.id,
                run_revision_id=run_revision_id,
                growth_state="unknown",
                identity_state="unknown",
                evidence_assertion_ids=[],
            )
        )
