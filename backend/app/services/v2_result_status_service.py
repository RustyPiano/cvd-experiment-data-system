from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.sample import Sample
from app.models.v2_results import CharacterizationRecord, MeasuredProduct


def refresh_result_missing_todo(db: Session, run: ExperimentRun) -> bool:
    missing = is_result_missing_todo(db, run)
    run.result_missing_todo = missing
    db.add(run)
    db.flush()
    return missing


def is_result_missing_todo(db: Session, run: ExperimentRun) -> bool:
    if run.status != ExperimentStatus.LOCKED:
        return False

    has_characterization = db.scalar(
        select(CharacterizationRecord.id)
        .where(CharacterizationRecord.experiment_run_id == run.id)
        .limit(1)
    )
    if has_characterization is not None:
        return False

    products = db.scalars(
        select(MeasuredProduct)
        .join(Sample, Sample.id == MeasuredProduct.sample_id)
        .where(Sample.experiment_run_id == run.id)
    ).all()
    return not any(product.observed_phenomena for product in products)
