from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.sample import Sample
from app.models.v2_results import CharacterizationRecord, MeasuredProduct
from app.services.v2_result_evidence import (
    MEASURED_PRODUCT_EVIDENCE_FIELDS,
    has_measured_product_evidence,
)


def refresh_result_missing_todo(db: Session, run: ExperimentRun) -> bool:
    missing = is_result_missing_todo(db, run)
    run.result_missing_todo = missing
    db.add(run)
    db.flush()
    return missing


def is_result_missing_todo(db: Session, run: ExperimentRun) -> bool:
    if run.status != ExperimentStatus.LOCKED:
        return False
    if run.not_characterized_at is not None:
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
    )
    return not any(
        has_measured_product_evidence(
            {
                field_name: getattr(product, field_name, None)
                for field_name in MEASURED_PRODUCT_EVIDENCE_FIELDS
            }
        )
        for product in products
    )
