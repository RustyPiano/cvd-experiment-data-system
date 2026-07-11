from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.module_payload import ExperimentModulePayload


class ModulePayloadRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_run_and_key(
        self,
        experiment_run_id: UUID,
        module_key: str,
    ) -> ExperimentModulePayload | None:
        statement = select(ExperimentModulePayload).where(
            ExperimentModulePayload.experiment_run_id == experiment_run_id,
            ExperimentModulePayload.module_key == module_key,
        )
        return self.db.scalar(statement)

    def list_by_run(self, experiment_run_id: UUID) -> list[ExperimentModulePayload]:
        statement = (
            select(ExperimentModulePayload)
            .where(ExperimentModulePayload.experiment_run_id == experiment_run_id)
            .order_by(ExperimentModulePayload.module_key.asc())
        )
        return list(self.db.scalars(statement).all())

    def save(self, payload: ExperimentModulePayload) -> ExperimentModulePayload:
        self.db.add(payload)
        self.db.flush()
        self.db.refresh(payload)
        return payload

    def delete(self, payload: ExperimentModulePayload) -> None:
        self.db.delete(payload)
        self.db.flush()
