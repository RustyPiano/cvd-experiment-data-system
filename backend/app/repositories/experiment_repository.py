from datetime import date
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.user import User, UserRole


class ExperimentRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, experiment: ExperimentRun) -> ExperimentRun:
        self.db.add(experiment)
        self.db.commit()
        self.db.refresh(experiment)
        return experiment

    def save(self, experiment: ExperimentRun) -> ExperimentRun:
        self.db.add(experiment)
        self.db.commit()
        self.db.refresh(experiment)
        return experiment

    def get_by_id(self, experiment_id: UUID) -> ExperimentRun | None:
        statement = select(ExperimentRun).where(ExperimentRun.id == experiment_id)
        return self.db.scalar(statement)

    def next_run_code(self, experiment_date: date) -> str:
        year = experiment_date.year
        statement = (
            select(func.count())
            .select_from(ExperimentRun)
            .where(
                ExperimentRun.experiment_date >= date(year, 1, 1),
                ExperimentRun.experiment_date <= date(year, 12, 31),
            )
        )
        count = self.db.scalar(statement) or 0
        return f"CVD-{year}-{count + 1:04d}"

    def list_visible(
        self,
        *,
        current_user: User,
        mine: bool = False,
        status: ExperimentStatus | None = None,
    ) -> list[ExperimentRun]:
        statement = select(ExperimentRun)

        if current_user.role == UserRole.ADMIN:
            if mine:
                statement = statement.where(ExperimentRun.owner_id == current_user.id)
        elif current_user.role == UserRole.MEMBER:
            visible_statuses = [ExperimentStatus.SUBMITTED, ExperimentStatus.LOCKED]
            if mine:
                statement = statement.where(ExperimentRun.owner_id == current_user.id)
            else:
                statement = statement.where(
                    or_(
                        ExperimentRun.owner_id == current_user.id,
                        ExperimentRun.status.in_(visible_statuses),
                    )
                )
        else:
            statement = statement.where(
                ExperimentRun.status.in_([ExperimentStatus.SUBMITTED, ExperimentStatus.LOCKED])
            )

        if status is not None:
            statement = statement.where(ExperimentRun.status == status)

        statement = statement.order_by(
            ExperimentRun.experiment_date.desc(),
            ExperimentRun.created_at.desc(),
        )
        return list(self.db.scalars(statement).all())
