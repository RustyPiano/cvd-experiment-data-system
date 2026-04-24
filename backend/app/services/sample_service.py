from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.module_payload import ExperimentModuleKey, normalize_module_payload
from app.models.sample import Sample, SampleRole
from app.models.user import User, UserRole
from app.repositories.experiment_repository import ExperimentRepository
from app.repositories.file_asset_repository import FileAssetRepository
from app.repositories.sample_repository import SampleRepository
from app.schemas.sample import SampleCreate, SampleListResponse, SampleRead, SampleUpdate
from app.services.audit_service import AuditService


class SampleService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)
        self.files = FileAssetRepository(db)
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
        sample = self._get_visible_sample(sample_id, current_user)
        return SampleRead.model_validate(sample)

    def create_sample(
        self,
        experiment_id: UUID,
        payload: SampleCreate,
        current_user: User,
    ) -> SampleRead:
        experiment = self._get_owned_draft_experiment(experiment_id, current_user)
        restored = self._restore_soft_deleted_role_sample(experiment=experiment, payload=payload)
        if restored is None:
            created = self._create_sample_with_retry(experiment=experiment, payload=payload)
            action = "create"
            before = None
        else:
            created, before = restored
            action = "restore"
        self.audit.record_event(
            actor=current_user,
            entity_type="sample",
            entity_id=created.id,
            action=action,
            before_json=before,
            after_json=self._serialize_sample(created),
        )
        self.db.commit()
        return SampleRead.model_validate(created)

    def update_sample(
        self,
        sample_id: UUID,
        payload: SampleUpdate,
        current_user: User,
    ) -> SampleRead:
        sample = self._get_owned_draft_sample(sample_id, current_user)
        before = self._serialize_sample(sample)
        updates = payload.model_dump(exclude_unset=True)
        for field, value in updates.items():
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
        self.db.commit()
        return SampleRead.model_validate(saved)

    def sync_substrate_samples(
        self,
        *,
        experiment: ExperimentRun,
        current_user: User,
        substrates_payload: dict,
    ) -> list[Sample]:
        normalized_payload = normalize_module_payload(
            ExperimentModuleKey.SUBSTRATES.value,
            substrates_payload,
        )
        items = normalized_payload.get("items")
        if not isinstance(items, list):
            return []

        synced_samples: list[Sample] = []
        desired_roles: set[SampleRole] = set()
        role_map = {
            "top": SampleRole.TOP,
            "bottom": SampleRole.BOTTOM,
        }
        existing_by_role = {
            SampleRole(sample.role): sample
            for sample in self.samples.list_by_experiment_and_roles(
                experiment.id,
                {SampleRole.TOP, SampleRole.BOTTOM},
                include_deleted=True,
            )
        }
        for item in items:
            if not isinstance(item, dict):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Each substrate item must be an object",
                )
            role_value = item.get("role")
            if role_value not in role_map:
                continue

            role = role_map[role_value]
            if role in desired_roles:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Duplicate substrate role in payload",
                )
            desired_roles.add(role)
            existing = existing_by_role.get(role)
            before = self._serialize_sample(existing)
            metadata = dict(existing.metadata_json) if existing is not None else {}
            metadata.update(
                {
                    "source_module": "substrates",
                    "source_role": role_value,
                    "treatment_params": item.get("treatment_params"),
                }
            )
            target = existing or Sample(
                sample_code=self._build_sample_code(experiment.run_code, role, 1),
                experiment_run_id=experiment.id,
                role=role.value,
            )
            target.substrate_type = item.get("type")
            target.brand = item.get("brand")
            target.size_mm = item.get("size_mm")
            target.treatment = item.get("treatment_method")
            target.position_mm = self._normalize_position(item.get("position_mm"))
            target.metadata_json = metadata
            target.deleted_at = None
            target.deleted_by_id = None

            saved = self.samples.save(target) if existing else self.samples.create(target)
            synced_samples.append(saved)
            self.audit.record_event(
                actor=current_user,
                entity_type="sample",
                entity_id=saved.id,
                action="update" if existing else "create",
                before_json=before,
                after_json=self._serialize_sample(saved),
                reason="substrates_sync",
            )

        for role, sample in existing_by_role.items():
            if role in desired_roles:
                continue
            if sample.deleted_at is not None:
                continue
            if self.files.exists_for_sample(sample.id) or self.samples.exists_children(sample.id):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Cannot remove substrate sample while dependent records exist",
                )
            before = self._serialize_sample(sample)
            sample.deleted_at = datetime.now(UTC)
            sample.deleted_by_id = current_user.id
            saved = self.samples.save(sample)
            self.audit.record_event(
                actor=current_user,
                entity_type="sample",
                entity_id=saved.id,
                action="soft_delete",
                before_json=before,
                after_json=self._serialize_sample(saved),
                reason="substrates_sync_removed",
            )

        return synced_samples

    def clone_samples(
        self,
        *,
        source_experiment: ExperimentRun,
        target_experiment: ExperimentRun,
        current_user: User,
    ) -> list[Sample]:
        cloned_samples: list[Sample] = []
        role_counts: dict[SampleRole, int] = {}
        cloneable_roles = {SampleRole.TOP, SampleRole.BOTTOM}
        for sample in self.samples.list_by_experiment(source_experiment.id):
            role = SampleRole(sample.role)
            if role not in cloneable_roles:
                continue
            role_counts[role] = role_counts.get(role, 0) + 1
            clone = Sample(
                sample_code=self._build_sample_code(
                    target_experiment.run_code,
                    role,
                    role_counts[role],
                ),
                experiment_run_id=target_experiment.id,
                parent_sample_id=None,
                role=sample.role,
                substrate_type=sample.substrate_type,
                brand=sample.brand,
                size_mm=sample.size_mm,
                treatment=sample.treatment,
                position_mm=sample.position_mm,
                storage_location=None,
                metadata_json=dict(sample.metadata_json),
            )
            saved = self.samples.create(clone)
            cloned_samples.append(saved)
            self.audit.record_event(
                actor=current_user,
                entity_type="sample",
                entity_id=saved.id,
                action="create",
                before_json=None,
                after_json=self._serialize_sample(saved),
                reason=f"cloned_from:{sample.id}",
            )

        return cloned_samples

    def _create_sample_with_retry(
        self,
        *,
        experiment: ExperimentRun,
        payload: SampleCreate,
    ) -> Sample:
        if payload.parent_sample_id is not None:
            parent = self.samples.get_by_id(payload.parent_sample_id)
            if parent is None or parent.experiment_run_id != experiment.id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Parent sample must belong to the same experiment",
                )

        attempts = 0
        while True:
            attempts += 1
            sample_count = self.samples.count_by_experiment_and_role(experiment.id, payload.role)
            sequence = sample_count + 1
            if payload.role in {SampleRole.TOP, SampleRole.BOTTOM} and sample_count > 0:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Sample role already exists for experiment",
                )

            sample = Sample(
                sample_code=self._build_sample_code(experiment.run_code, payload.role, sequence),
                experiment_run_id=experiment.id,
                parent_sample_id=payload.parent_sample_id,
                role=payload.role.value,
                substrate_type=payload.substrate_type,
                brand=payload.brand,
                size_mm=payload.size_mm,
                treatment=payload.treatment,
                position_mm=payload.position_mm,
                storage_location=payload.storage_location,
                metadata_json=payload.metadata_json,
            )
            try:
                return self.samples.create(sample)
            except IntegrityError as exc:
                self.db.rollback()
                if "sample_code" not in str(exc).lower():
                    raise
                if attempts >= 3:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Failed to allocate sample code",
                    ) from exc

    def _restore_soft_deleted_role_sample(
        self,
        *,
        experiment: ExperimentRun,
        payload: SampleCreate,
    ) -> tuple[Sample, dict | None] | None:
        if payload.role not in {SampleRole.TOP, SampleRole.BOTTOM}:
            return None

        sample = self.samples.get_by_experiment_and_role(
            experiment.id,
            payload.role,
            include_deleted=True,
        )
        if sample is None or sample.deleted_at is None:
            return None

        if payload.parent_sample_id is not None:
            parent = self.samples.get_by_id(payload.parent_sample_id)
            if parent is None or parent.experiment_run_id != experiment.id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Parent sample must belong to the same experiment",
                )

        before = self._serialize_sample(sample)
        sample.parent_sample_id = payload.parent_sample_id
        sample.substrate_type = payload.substrate_type
        sample.brand = payload.brand
        sample.size_mm = payload.size_mm
        sample.treatment = payload.treatment
        sample.position_mm = payload.position_mm
        sample.storage_location = payload.storage_location
        sample.metadata_json = payload.metadata_json
        sample.deleted_at = None
        sample.deleted_by_id = None
        return self.samples.save(sample), before

    def _build_sample_code(self, run_code: str, role: SampleRole, sequence: int) -> str:
        _, year, serial = run_code.split("-", maxsplit=2)
        prefix = f"S-{year}-{serial}"
        if role in {SampleRole.TOP, SampleRole.BOTTOM}:
            return f"{prefix}-{role.value.upper()}"
        suffix = self._build_alpha_suffix(sequence)
        return f"{prefix}-{role.value.upper()}-{suffix}"

    def _build_alpha_suffix(self, sequence: int) -> str:
        if sequence < 1:
            raise ValueError("sequence must be positive")

        letters: list[str] = []
        current = sequence
        while current > 0:
            current, remainder = divmod(current - 1, 26)
            letters.append(chr(ord("A") + remainder))
        return "".join(reversed(letters))

    def _get_visible_sample(self, sample_id: UUID, current_user: User) -> Sample:
        sample = self.samples.get_by_id(sample_id)
        if sample is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
        self._assert_experiment_visible(sample.experiment_run_id, current_user)
        return sample

    def _get_owned_draft_sample(self, sample_id: UUID, current_user: User) -> Sample:
        sample = self.samples.get_by_id(sample_id)
        if sample is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
        self._get_owned_draft_experiment(sample.experiment_run_id, current_user)
        return sample

    def _get_owned_draft_experiment(self, experiment_id: UUID, current_user: User) -> ExperimentRun:
        experiment = self.experiments.get_by_id(experiment_id)
        if experiment is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Experiment not found",
            )
        if current_user.role == UserRole.VIEWER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
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

    def _assert_experiment_visible(self, experiment_id: UUID, current_user: User) -> None:
        experiment = self.experiments.get_by_id(experiment_id)
        if experiment is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Experiment not found",
            )
        if current_user.role == UserRole.ADMIN:
            return
        if current_user.role == UserRole.MEMBER:
            if experiment.owner_id == current_user.id:
                return
            if experiment.status in {ExperimentStatus.SUBMITTED, ExperimentStatus.LOCKED}:
                return
        elif experiment.status in {ExperimentStatus.SUBMITTED, ExperimentStatus.LOCKED}:
            return
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")

    def _serialize_sample(self, sample: Sample | None) -> dict | None:
        if sample is None:
            return None
        return {
            "id": str(sample.id),
            "sample_code": sample.sample_code,
            "experiment_run_id": str(sample.experiment_run_id),
            "parent_sample_id": str(sample.parent_sample_id) if sample.parent_sample_id else None,
            "role": sample.role,
            "substrate_type": sample.substrate_type,
            "brand": sample.brand,
            "size_mm": sample.size_mm,
            "treatment": sample.treatment,
            "position_mm": float(sample.position_mm) if sample.position_mm is not None else None,
            "storage_location": sample.storage_location,
            "metadata_json": sample.metadata_json,
            "deleted_at": sample.deleted_at.isoformat() if sample.deleted_at else None,
            "deleted_by_id": str(sample.deleted_by_id) if sample.deleted_by_id else None,
            "is_deleted": sample.deleted_at is not None,
        }

    def _normalize_position(self, value: object) -> float | None:
        if value is None:
            return None
        if isinstance(value, int | float) and not isinstance(value, bool):
            return float(value)
        if isinstance(value, Decimal):
            return float(value)
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                return None
            try:
                return float(normalized)
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Substrate position_mm must be numeric",
                ) from exc
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Substrate position_mm must be numeric",
        )
