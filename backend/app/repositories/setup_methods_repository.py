from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.setup_methods import ExperimentSetupSnapshot


class SetupMethodsRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_experiment(self, experiment_run_id: UUID) -> ExperimentSetupSnapshot | None:
        return self.db.scalar(
            select(ExperimentSetupSnapshot).where(
                ExperimentSetupSnapshot.experiment_run_id == experiment_run_id
            )
        )

    def save(self, snapshot: ExperimentSetupSnapshot) -> ExperimentSetupSnapshot:
        self.db.add(snapshot)
        self.db.flush()
        self.db.refresh(snapshot)
        return snapshot
