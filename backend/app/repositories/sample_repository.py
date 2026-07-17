from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.sample import Sample, SampleRole
from app.models.user import User, UserRole


class SampleRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, sample: Sample) -> Sample:
        self.db.add(sample)
        self.db.flush()
        self.db.refresh(sample)
        return sample

    def save(self, sample: Sample) -> Sample:
        self.db.add(sample)
        self.db.flush()
        self.db.refresh(sample)
        return sample

    def get_by_id(self, sample_id: UUID, *, include_deleted: bool = False) -> Sample | None:
        statement = select(Sample).where(Sample.id == sample_id)
        if not include_deleted:
            statement = statement.where(Sample.deleted_at.is_(None))
        return self.db.scalar(statement)

    def list_by_experiment(
        self,
        experiment_id: UUID,
        *,
        include_deleted: bool = False,
    ) -> list[Sample]:
        statement = select(Sample).where(Sample.experiment_run_id == experiment_id)
        if not include_deleted:
            statement = statement.where(Sample.deleted_at.is_(None))
        statement = statement.order_by(Sample.sample_code.asc())
        return list(self.db.scalars(statement).all())

    def list_visible(
        self,
        *,
        current_user: User,
        experiment_id: UUID | None = None,
        role: SampleRole | None = None,
        sample_code: str | None = None,
        include_deleted: bool = False,
    ) -> list[Sample]:
        statement = (
            select(Sample)
            .join(ExperimentRun, Sample.experiment_run_id == ExperimentRun.id)
            .options(selectinload(Sample.experiment_run))
        )
        if not include_deleted:
            statement = statement.where(Sample.deleted_at.is_(None))

        if current_user.role == UserRole.ADMIN:
            pass
        else:
            statement = statement.where(
                or_(
                    ExperimentRun.owner_id == current_user.id,
                    ExperimentRun.status == ExperimentStatus.LOCKED,
                )
            )

        if experiment_id is not None:
            statement = statement.where(Sample.experiment_run_id == experiment_id)
        if role is not None:
            statement = statement.where(Sample.role == role.value)
        if sample_code:
            statement = statement.where(Sample.sample_code == sample_code)

        statement = statement.order_by(Sample.sample_code.asc())
        return list(self.db.scalars(statement).all())
