from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.file_asset import FileAsset
from app.models.sample import Sample
from app.models.v2_results import MeasuredProduct
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

    active_result_file = db.scalar(
        select(FileAsset.id)
        .where(
            FileAsset.experiment_run_id == run.id,
            FileAsset.asset_role == "characterization_file",
            FileAsset.deleted_at.is_(None),
        )
        .limit(1)
    )
    if active_result_file is not None:
        return False

    products = db.scalars(
        select(MeasuredProduct)
        .join(Sample, Sample.id == MeasuredProduct.sample_id)
        .where(Sample.experiment_run_id == run.id)
    )
    for product in products:
        if has_measured_product_evidence(
            {
                field_name: getattr(product, field_name, None)
                for field_name in MEASURED_PRODUCT_EVIDENCE_FIELDS
            }
            | {"attrs": product.attrs}
        ):
            return False
        file_ids: list[UUID] = []
        for raw_id in (product.attrs or {}).get("evidence_file_ids", []):
            try:
                file_ids.append(UUID(str(raw_id)))
            except (TypeError, ValueError, AttributeError):
                continue
        if file_ids and db.scalar(
            select(FileAsset.id)
            .where(
                FileAsset.id.in_(file_ids),
                FileAsset.experiment_run_id == run.id,
                FileAsset.asset_role == "direct_observation_file",
                FileAsset.deleted_at.is_(None),
            )
            .limit(1)
        ):
            return False
    return True
