from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models.experiment_version import ExperimentVersion


class ExperimentVersionRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, entry: ExperimentVersion) -> ExperimentVersion:
        self.db.add(entry)
        self.db.flush()
        self.db.refresh(entry)
        return entry

    def list_by_run(self, experiment_run_id: UUID) -> list[ExperimentVersion]:
        statement = (
            select(ExperimentVersion)
            .where(ExperimentVersion.experiment_run_id == experiment_run_id)
            .options(joinedload(ExperimentVersion.created_by))
            .order_by(ExperimentVersion.version_number.desc())
        )
        return list(self.db.scalars(statement).all())

    def get_by_run_and_number(
        self,
        experiment_run_id: UUID,
        version_number: int,
    ) -> ExperimentVersion | None:
        statement = select(ExperimentVersion).where(
            ExperimentVersion.experiment_run_id == experiment_run_id,
            ExperimentVersion.version_number == version_number,
        )
        return self.db.scalar(statement)

    def max_version_number(self, experiment_run_id: UUID) -> int:
        statement = select(func.max(ExperimentVersion.version_number)).where(
            ExperimentVersion.experiment_run_id == experiment_run_id,
        )
        return self.db.scalar(statement) or 0
