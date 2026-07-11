from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.sample import Sample
from app.models.user import User, UserRole
from app.models.v2_results import CharacterizationRecord, MeasuredProduct
from app.repositories.experiment_repository import ExperimentRepository
from app.repositories.file_asset_repository import FileAssetRepository
from app.repositories.v2_repository import V2ResultRepository
from app.schemas.v2 import (
    CharacterizationRecordCreate,
    CharacterizationRecordListResponse,
    CharacterizationRecordRead,
    CharacterizationRecordUpdate,
    MeasuredProductCreate,
    MeasuredProductListResponse,
    MeasuredProductRead,
    MeasuredProductUpdate,
)
from app.services.v2_entity_service import V2EntityService
from app.services.v2_entity_snapshot_service import instrument_version_snapshot
from app.services.v2_field_source import SCHEMA_VERSION
from app.services.v2_result_status_service import refresh_result_missing_todo


class V2ResultsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)
        self.entities = V2EntityService(db)
        self.results = V2ResultRepository(db)
        self.files = FileAssetRepository(db)

    def list_characterization_records(
        self, run_id: UUID, current_user: User
    ) -> CharacterizationRecordListResponse:
        run = self._get_visible_run(run_id, current_user)
        items = self.results.list_characterization_records(run.id)
        return CharacterizationRecordListResponse(
            items=[CharacterizationRecordRead.model_validate(item) for item in items],
            total=len(items),
        )

    def create_characterization_record(
        self,
        run_id: UUID,
        payload: CharacterizationRecordCreate,
        current_user: User,
    ) -> CharacterizationRecordRead:
        run = self._get_owned_run(run_id, current_user)
        self._ensure_results_editable(run)
        self._sample_for_run(payload.sample_id, run.id)
        instrument_snapshot = None
        if payload.instrument_id and payload.instrument_version:
            version = self.entities.get_version(
                "instrument", payload.instrument_id, payload.instrument_version
            )
            instrument_snapshot = instrument_version_snapshot(version)
        record = CharacterizationRecord(
            experiment_run_id=run.id,
            sample_id=payload.sample_id,
            instrument_id=payload.instrument_id,
            instrument_version=payload.instrument_version,
            instrument_snapshot_json=instrument_snapshot,
            method_instrument=payload.method_instrument,
            test_conditions=payload.test_conditions,
            raw_data=payload.raw_data,
            attrs=payload.attrs,
        )
        saved = self.results.save_characterization_record(record)
        refresh_result_missing_todo(self.db, run)
        self.db.commit()
        return CharacterizationRecordRead.model_validate(saved)

    def update_characterization_record(
        self,
        record_id: UUID,
        payload: CharacterizationRecordUpdate,
        current_user: User,
    ) -> CharacterizationRecordRead:
        record = self._owned_characterization_record(record_id, current_user)
        run = self.experiments.get_by_id(record.experiment_run_id)
        self._ensure_results_editable(run)
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(record, key, value)
        saved = self.results.save_characterization_record(record)
        refresh_result_missing_todo(self.db, run)
        self.db.commit()
        return CharacterizationRecordRead.model_validate(saved)

    def delete_characterization_record(self, record_id: UUID, current_user: User) -> None:
        record = self._owned_characterization_record(record_id, current_user)
        run = self.experiments.get_by_id(record.experiment_run_id)
        self._ensure_results_editable(run)
        # Keep characterization evidence explicit: attachments must be soft-deleted first.
        if self.files.has_active_for_characterization_record(record.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Delete or otherwise handle active attachments before deleting the "
                    "characterization record"
                ),
            )
        self.results.delete(record)
        refresh_result_missing_todo(self.db, run)
        self.db.commit()

    def list_measured_products(
        self, sample_id: UUID, current_user: User
    ) -> MeasuredProductListResponse:
        sample = self._visible_sample(sample_id, current_user)
        items = self.results.list_measured_products(sample.id)
        return MeasuredProductListResponse(
            items=[MeasuredProductRead.model_validate(item) for item in items],
            total=len(items),
        )

    def create_measured_product(
        self,
        sample_id: UUID,
        payload: MeasuredProductCreate,
        current_user: User,
    ) -> MeasuredProductRead:
        sample = self._owned_sample(sample_id, current_user)
        run = self.experiments.get_by_id(sample.experiment_run_id)
        self._ensure_results_editable(run)
        if payload.characterization_record_id:
            record = self.results.get_characterization_record(payload.characterization_record_id)
            if record is None or record.sample_id != sample.id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="characterization_record_id must belong to the sample",
                )
        product = MeasuredProduct(sample_id=sample.id, **payload.model_dump())
        saved = self.results.save_measured_product(product)
        refresh_result_missing_todo(self.db, run)
        self.db.commit()
        return MeasuredProductRead.model_validate(saved)

    def update_measured_product(
        self,
        product_id: UUID,
        payload: MeasuredProductUpdate,
        current_user: User,
    ) -> MeasuredProductRead:
        product = self._owned_measured_product(product_id, current_user)
        sample = self.db.get(Sample, product.sample_id)
        run = self.experiments.get_by_id(sample.experiment_run_id)
        self._ensure_results_editable(run)
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(product, key, value)
        saved = self.results.save_measured_product(product)
        refresh_result_missing_todo(self.db, run)
        self.db.commit()
        return MeasuredProductRead.model_validate(saved)

    def delete_measured_product(self, product_id: UUID, current_user: User) -> None:
        product = self._owned_measured_product(product_id, current_user)
        sample = self.db.get(Sample, product.sample_id)
        run = self.experiments.get_by_id(sample.experiment_run_id)
        self._ensure_results_editable(run)
        self.results.delete(product)
        refresh_result_missing_todo(self.db, run)
        self.db.commit()

    def _get_visible_run(self, run_id: UUID, current_user: User) -> ExperimentRun:
        run = self.experiments.get_visible_by_id(
            run_id, current_user=current_user, schema_version=SCHEMA_VERSION
        )
        if run is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Experiment not found",
            )
        return run

    def _get_owned_run(self, run_id: UUID, current_user: User) -> ExperimentRun:
        run = self._get_visible_run(run_id, current_user)
        if current_user.role != UserRole.ADMIN and run.owner_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return run

    def _ensure_results_editable(self, run: ExperimentRun) -> None:
        if run.status == ExperimentStatus.INVALID:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Invalid experiments cannot be edited",
            )

    def _visible_sample(self, sample_id: UUID, current_user: User) -> Sample:
        sample = self.db.get(Sample, sample_id)
        if sample is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
        self._get_visible_run(sample.experiment_run_id, current_user)
        return sample

    def _owned_sample(self, sample_id: UUID, current_user: User) -> Sample:
        sample = self.db.get(Sample, sample_id)
        if sample is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
        self._get_owned_run(sample.experiment_run_id, current_user)
        return sample

    def _sample_for_run(self, sample_id: UUID, run_id: UUID) -> Sample:
        sample = self.db.get(Sample, sample_id)
        if sample is None or sample.experiment_run_id != run_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
        return sample

    def _owned_characterization_record(
        self, record_id: UUID, current_user: User
    ) -> CharacterizationRecord:
        record = self.results.get_characterization_record(record_id)
        if record is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
        self._get_owned_run(record.experiment_run_id, current_user)
        return record

    def _owned_measured_product(self, product_id: UUID, current_user: User) -> MeasuredProduct:
        product = self.results.get_measured_product(product_id)
        if product is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
        self._owned_sample(product.sample_id, current_user)
        return product
