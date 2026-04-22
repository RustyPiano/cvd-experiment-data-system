from datetime import UTC, date, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus, QualityLabel
from app.models.user import User, UserRole
from app.repositories.experiment_repository import ExperimentRepository
from app.schemas.audit import AuditEventListResponse
from app.schemas.experiment import (
    ExperimentCreate,
    ExperimentInvalidateRequest,
    ExperimentListResponse,
    ExperimentRead,
    ExperimentUpdate,
)
from app.services.audit_service import AuditService


class ExperimentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)
        self.audit = AuditService(db)

    def list_experiments(
        self,
        *,
        current_user: User,
        mine: bool = False,
        status_filter: ExperimentStatus | None = None,
    ) -> ExperimentListResponse:
        items = self.experiments.list_visible(
            current_user=current_user,
            mine=mine,
            status=status_filter,
        )
        return ExperimentListResponse(
            items=[ExperimentRead.model_validate(item) for item in items],
            total=len(items),
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

    def invalidate_experiment(
        self,
        experiment_id: UUID,
        payload: ExperimentInvalidateRequest,
        current_user: User,
    ) -> ExperimentRead:
        experiment = self._get_owned_experiment(experiment_id, current_user)
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
                if attempts >= 3:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Failed to allocate run code",
                    ) from exc

    def _validate_submit(self, experiment: ExperimentRun) -> None:
        if (
            experiment.experiment_date is None
            or experiment.owner_id is None
            or not experiment.experiment_type
            or not experiment.material_system
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Submit validation failed",
            )

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
