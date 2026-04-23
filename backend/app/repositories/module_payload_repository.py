from collections.abc import Iterable
from copy import deepcopy
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.module_payload import ExperimentModulePayload, normalize_module_payload


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

    def clone_for_run(
        self,
        *,
        source_run_id: UUID,
        target_run_id: UUID,
        exclude_module_keys: Iterable[str] = (),
    ) -> list[ExperimentModulePayload]:
        source_payloads = self.list_by_run(source_run_id)
        excluded = set(exclude_module_keys)
        clones: list[ExperimentModulePayload] = []
        for payload in source_payloads:
            if payload.module_key in excluded:
                continue
            cloned_payload = ExperimentModulePayload(
                experiment_run_id=target_run_id,
                module_key=payload.module_key,
                schema_version=payload.schema_version,
                payload_json=normalize_module_payload(
                    payload.module_key,
                    deepcopy(payload.payload_json),
                ),
                note=payload.note,
            )
            self.db.add(cloned_payload)
            clones.append(cloned_payload)
        self.db.flush()
        for cloned_payload in clones:
            self.db.refresh(cloned_payload)
        return clones
