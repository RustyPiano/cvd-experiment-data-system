from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.sample import Sample
from app.models.user import User
from app.models.v2_results import CharacterizationRecord
from app.services.audit_service import AuditService
from app.services.v2_result_evidence import collect_measurement_evidence


def refresh_result_missing_todo(db: Session, run: ExperimentRun) -> bool:
    missing = is_result_missing_todo(db, run)
    run.result_missing_todo = missing
    db.add(run)
    db.flush()
    return missing


def clear_not_characterized(db: Session, run: ExperimentRun, actor: User) -> bool:
    if run.not_characterized_at is None:
        return False
    before = {
        "not_characterized_by_id": (
            str(run.not_characterized_by_id) if run.not_characterized_by_id else None
        ),
        "not_characterized_at": run.not_characterized_at.isoformat(),
    }
    run.not_characterized_by_id = None
    run.not_characterized_at = None
    AuditService(db).record_event(
        actor=actor,
        entity_type="experiment_run",
        entity_id=run.id,
        action="clear_not_characterized",
        before_json=before,
        after_json={
            "not_characterized_by_id": None,
            "not_characterized_at": None,
        },
    )
    return True


def is_result_missing_todo(db: Session, run: ExperimentRun) -> bool:
    if run.status not in {ExperimentStatus.LOCKED, ExperimentStatus.REVIEWED}:
        return False
    if run.not_characterized_at is not None:
        return False
    if run.current_revision_id is None:
        return True

    record_ids = list(
        db.scalars(
            select(CharacterizationRecord.id)
            .join(Sample, Sample.id == CharacterizationRecord.sample_id)
            .where(
                CharacterizationRecord.experiment_run_id == run.id,
                CharacterizationRecord.run_revision_id == run.current_revision_id,
                CharacterizationRecord.quality_flag == "valid",
                Sample.experiment_run_id == run.id,
                Sample.deleted_at.is_(None),
                or_(Sample.role != "growth", Sample.run_revision_id == run.current_revision_id),
            )
        )
    )
    evidence_record_ids, _raw_record_ids = collect_measurement_evidence(db, record_ids)
    return not evidence_record_ids
