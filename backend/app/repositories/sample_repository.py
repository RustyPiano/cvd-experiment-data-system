from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

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

    def get_by_experiment_and_role(
        self,
        experiment_id: UUID,
        role: SampleRole,
        *,
        include_deleted: bool = False,
    ) -> Sample | None:
        statement = select(Sample).where(
            Sample.experiment_run_id == experiment_id,
            Sample.role == role.value,
        )
        if not include_deleted:
            statement = statement.where(Sample.deleted_at.is_(None))
        return self.db.scalar(statement)

    def exists_children(self, sample_id: UUID) -> bool:
        statement = select(Sample.id).where(Sample.parent_sample_id == sample_id).limit(1)
        return self.db.scalar(statement) is not None

    def count_by_experiment_and_role(
        self,
        experiment_id: UUID,
        role: SampleRole,
        *,
        include_deleted: bool = False,
    ) -> int:
        statement = (
            select(func.count())
            .select_from(Sample)
            .where(Sample.experiment_run_id == experiment_id, Sample.role == role.value)
        )
        if not include_deleted:
            statement = statement.where(Sample.deleted_at.is_(None))
        return int(self.db.scalar(statement) or 0)

    def list_by_experiment(
        self,
        experiment_id: UUID,
        *,
        include_deleted: bool = False,
    ) -> list[Sample]:
        statement = (
            select(Sample)
            .where(Sample.experiment_run_id == experiment_id)
            .order_by(Sample.sample_code.asc())
        )
        if not include_deleted:
            statement = statement.where(Sample.deleted_at.is_(None))
        return list(self.db.scalars(statement).all())

    def list_by_experiment_and_roles(
        self,
        experiment_id: UUID,
        roles: set[SampleRole],
        *,
        include_deleted: bool = False,
    ) -> list[Sample]:
        statement = (
            select(Sample)
            .where(
                Sample.experiment_run_id == experiment_id,
                Sample.role.in_([role.value for role in roles]),
            )
            .order_by(Sample.sample_code.asc())
        )
        if not include_deleted:
            statement = statement.where(Sample.deleted_at.is_(None))
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
        statement = select(Sample).join(ExperimentRun, Sample.experiment_run_id == ExperimentRun.id)
        if not include_deleted:
            statement = statement.where(Sample.deleted_at.is_(None))

        if current_user.role == UserRole.ADMIN:
            pass
        elif current_user.role == UserRole.MEMBER:
            statement = statement.where(
                or_(
                    ExperimentRun.owner_id == current_user.id,
                    ExperimentRun.status.in_([ExperimentStatus.SUBMITTED, ExperimentStatus.LOCKED]),
                )
            )
        else:
            statement = statement.where(
                ExperimentRun.status.in_([ExperimentStatus.SUBMITTED, ExperimentStatus.LOCKED])
            )

        if experiment_id is not None:
            statement = statement.where(Sample.experiment_run_id == experiment_id)
        if role is not None:
            statement = statement.where(Sample.role == role.value)
        if sample_code:
            statement = statement.where(Sample.sample_code == sample_code)

        statement = statement.order_by(Sample.sample_code.asc())
        return list(self.db.scalars(statement).all())
