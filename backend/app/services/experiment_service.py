from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus, QualityLabel
from app.models.user import User, UserRole
from app.repositories.experiment_repository import ExperimentRepository
from app.schemas.experiment import (
    ExperimentCreate,
    ExperimentInvalidateRequest,
    ExperimentListResponse,
    ExperimentRead,
    ExperimentUpdate,
)


class ExperimentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)

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

        experiment = ExperimentRun(
            run_code=self.experiments.next_run_code(payload.experiment_date),
            owner_id=current_user.id,
            experiment_type=payload.experiment_type,
            material_system=payload.material_system,
            experiment_date=payload.experiment_date,
            objective=payload.objective,
            status=ExperimentStatus.DRAFT,
            quality_label=QualityLabel.UNKNOWN,
        )
        return ExperimentRead.model_validate(self.experiments.create(experiment))

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

        experiment.material_system = payload.material_system
        experiment.objective = payload.objective
        experiment.summary_result = payload.summary_result
        return ExperimentRead.model_validate(self.experiments.save(experiment))

    def submit_experiment(self, experiment_id: UUID, current_user: User) -> ExperimentRead:
        experiment = self._get_owned_experiment(experiment_id, current_user)
        if experiment.status != ExperimentStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only draft experiments can be submitted",
            )

        experiment.status = ExperimentStatus.SUBMITTED
        experiment.submitted_at = datetime.now(UTC)
        return ExperimentRead.model_validate(self.experiments.save(experiment))

    def lock_experiment(self, experiment_id: UUID, current_user: User) -> ExperimentRead:
        experiment = self._get_owned_experiment(experiment_id, current_user)
        if experiment.status != ExperimentStatus.SUBMITTED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only submitted experiments can be locked",
            )

        experiment.status = ExperimentStatus.LOCKED
        experiment.locked_at = datetime.now(UTC)
        return ExperimentRead.model_validate(self.experiments.save(experiment))

    def invalidate_experiment(
        self,
        experiment_id: UUID,
        payload: ExperimentInvalidateRequest,
        current_user: User,
    ) -> ExperimentRead:
        experiment = self._get_owned_experiment(experiment_id, current_user)
        experiment.status = ExperimentStatus.INVALID
        experiment.invalid_reason = payload.reason
        return ExperimentRead.model_validate(self.experiments.save(experiment))

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
