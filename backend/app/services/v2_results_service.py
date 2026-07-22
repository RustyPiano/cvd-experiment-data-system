from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun
from app.models.file_asset import FileAsset
from app.models.sample import Sample
from app.models.user import User
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
    V2ResultListResponse,
    V2ResultRead,
    V2ResultWrite,
)
from app.services.audit_service import AuditService
from app.services.experiment_guards import (
    ensure_results_editable,
    get_visible_experiment,
)
from app.services.v2_entity_service import V2EntityService
from app.services.v2_entity_snapshot_service import instrument_version_snapshot
from app.services.v2_field_source import (
    SCHEMA_VERSION,
    canonical_option_value,
    field_option_values,
)
from app.services.v2_result_status_service import refresh_result_missing_todo


class V2ResultsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)
        self.entities = V2EntityService(db)
        self.results = V2ResultRepository(db)
        self.files = FileAssetRepository(db)
        self.audit = AuditService(db)

    def list_results(self, sample_id: UUID, current_user: User) -> V2ResultListResponse:
        sample = self._visible_sample(sample_id, current_user)
        items = self.results.list_measured_products(sample.id)
        return V2ResultListResponse(
            items=[self._result_read(item) for item in items],
            total=len(items),
        )

    def create_result(
        self,
        sample_id: UUID,
        payload: V2ResultWrite,
        current_user: User,
    ) -> V2ResultRead:
        sample = self._visible_sample(sample_id, current_user)
        run = self._locked_run(sample.experiment_run_id)
        ensure_results_editable(run)
        self._validate_observed_phenomena(payload.observed_phenomena)

        record = None
        if payload.kind == "characterization":
            record = CharacterizationRecord(
                experiment_run_id=run.id,
                sample_id=sample.id,
            )
            self._apply_characterization_payload(record, payload)
            record = self.results.save_characterization_record(record)

        product = MeasuredProduct(
            sample_id=sample.id,
            characterization_record_id=record.id if record else None,
            **self._measured_values(payload),
        )
        saved = self.results.save_measured_product(product)
        if record:
            self.audit.record_event(
                actor=current_user,
                entity_type="characterization_record",
                entity_id=record.id,
                action="create",
                before_json=None,
                after_json=self._characterization_snapshot(record),
            )
        self.audit.record_event(
            actor=current_user,
            entity_type="measured_product",
            entity_id=saved.id,
            action="create",
            before_json=None,
            after_json=self._measured_product_snapshot(saved),
        )
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=run.id,
            action="create_result",
            before_json=None,
            after_json={
                "result_id": str(saved.id),
                "sample_code": sample.sample_code,
                "kind": payload.kind,
            },
        )
        self._clear_not_characterized(run, current_user)
        refresh_result_missing_todo(self.db, run)
        self.db.commit()
        return self._result_read(saved)

    def update_result(
        self,
        result_id: UUID,
        payload: V2ResultWrite,
        current_user: User,
    ) -> V2ResultRead:
        product = self._visible_measured_product(result_id, current_user)
        sample = self.db.get(Sample, product.sample_id)
        run = self._locked_run(sample.experiment_run_id)
        ensure_results_editable(run)
        self._validate_observed_phenomena(payload.observed_phenomena)
        record = (
            self.results.get_characterization_record(product.characterization_record_id)
            if product.characterization_record_id
            else None
        )
        current_kind = "characterization" if record else "direct_observation"
        if payload.kind != current_kind:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Result kind cannot be changed after creation",
            )

        product_before = self._measured_product_snapshot(product)
        if record:
            record_before = self._characterization_snapshot(record)
            previous_method = record.method_instrument
            self._apply_characterization_payload(record, payload)
            saved_record = self.results.save_characterization_record(record)
            if saved_record.method_instrument != previous_method:
                self.db.execute(
                    update(FileAsset)
                    .where(FileAsset.characterization_record_id == saved_record.id)
                    .values(
                        method=saved_record.method_instrument,
                        file_kind=saved_record.method_instrument,
                    )
                )
            self.audit.record_event(
                actor=current_user,
                entity_type="characterization_record",
                entity_id=saved_record.id,
                action="update",
                before_json=record_before,
                after_json=self._characterization_snapshot(saved_record),
            )

        for key, value in self._measured_values(payload).items():
            setattr(product, key, value)
        saved = self.results.save_measured_product(product)
        self.audit.record_event(
            actor=current_user,
            entity_type="measured_product",
            entity_id=saved.id,
            action="update",
            before_json=product_before,
            after_json=self._measured_product_snapshot(saved),
        )
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=run.id,
            action="update_result",
            before_json=None,
            after_json={
                "result_id": str(saved.id),
                "sample_code": sample.sample_code,
                "kind": payload.kind,
            },
        )
        refresh_result_missing_todo(self.db, run)
        self.db.commit()
        return self._result_read(saved)

    def delete_result(self, result_id: UUID, current_user: User) -> None:
        product = self._visible_measured_product(result_id, current_user)
        sample = self.db.get(Sample, product.sample_id)
        run = self._locked_run(sample.experiment_run_id)
        ensure_results_editable(run)
        record = (
            self.results.get_characterization_record(product.characterization_record_id)
            if product.characterization_record_id
            else None
        )
        if record and self.db.scalar(
            select(MeasuredProduct.id)
            .where(
                MeasuredProduct.characterization_record_id == record.id,
                MeasuredProduct.id != product.id,
            )
            .limit(1)
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Delete linked measured products before deleting the characterization record"
                ),
            )
        if record and self.files.has_active_for_characterization_record(record.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Delete active attachments before deleting the result",
            )

        product_before = self._measured_product_snapshot(product)
        self.results.delete(product)
        self.audit.record_event(
            actor=current_user,
            entity_type="measured_product",
            entity_id=product.id,
            action="delete",
            before_json=product_before,
            after_json=None,
        )
        if record:
            record_before = self._characterization_snapshot(record)
            self.results.delete(record)
            self.audit.record_event(
                actor=current_user,
                entity_type="characterization_record",
                entity_id=record.id,
                action="delete",
                before_json=record_before,
                after_json=None,
            )
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=run.id,
            action="delete_result",
            before_json={
                "result_id": str(product.id),
                "sample_code": sample.sample_code,
                "kind": "characterization" if record else "direct_observation",
            },
            after_json=None,
        )
        refresh_result_missing_todo(self.db, run)
        self.db.commit()

    def list_characterization_records(
        self, run_id: UUID, current_user: User
    ) -> CharacterizationRecordListResponse:
        run = get_visible_experiment(
            self.experiments, run_id, current_user, schema_version=SCHEMA_VERSION
        )
        items = self.results.list_characterization_records(run.id)
        return CharacterizationRecordListResponse(
            items=[self._characterization_read(item) for item in items],
            total=len(items),
        )

    def create_characterization_record(
        self,
        run_id: UUID,
        payload: CharacterizationRecordCreate,
        current_user: User,
    ) -> CharacterizationRecordRead:
        run = get_visible_experiment(
            self.experiments, run_id, current_user, schema_version=SCHEMA_VERSION
        )
        run = self._locked_run(run.id)
        ensure_results_editable(run)
        self._sample_for_run(payload.sample_id, run.id)
        method = self._validate_method(payload.method_instrument)
        if (payload.instrument_id is None) != (payload.instrument_version is None):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="instrument_id and instrument_version must be provided together",
            )
        instrument_snapshot = None
        if payload.instrument_id is not None:
            try:
                version = self.entities.get_version(
                    "instrument", payload.instrument_id, payload.instrument_version
                )
            except HTTPException as exc:
                if exc.status_code != status.HTTP_404_NOT_FOUND:
                    raise
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Referenced instrument version does not exist",
                ) from exc
            instrument_snapshot = instrument_version_snapshot(version)
        record = CharacterizationRecord(
            experiment_run_id=run.id,
            sample_id=payload.sample_id,
            instrument_id=payload.instrument_id,
            instrument_version=payload.instrument_version,
            instrument_snapshot_json=instrument_snapshot,
            method_instrument=method,
            test_conditions=payload.test_conditions,
            raw_data=payload.raw_data,
            attrs=payload.attrs,
        )
        saved = self.results.save_characterization_record(record)
        self.audit.record_event(
            actor=current_user,
            entity_type="characterization_record",
            entity_id=saved.id,
            action="create",
            before_json=None,
            after_json=self._characterization_snapshot(saved),
        )
        sample = self.db.get(Sample, saved.sample_id)
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=run.id,
            action="create_result",
            before_json=None,
            after_json={
                "sample_code": sample.sample_code,
                "kind": "characterization",
                "method": saved.method_instrument,
            },
        )
        self._clear_not_characterized(run, current_user)
        refresh_result_missing_todo(self.db, run)
        self.db.commit()
        return self._characterization_read(saved)

    def update_characterization_record(
        self,
        record_id: UUID,
        payload: CharacterizationRecordUpdate,
        current_user: User,
    ) -> CharacterizationRecordRead:
        record = self._visible_characterization_record(record_id, current_user)
        run = self._locked_run(record.experiment_run_id)
        ensure_results_editable(run)
        before = self._characterization_snapshot(record)
        changes = payload.model_dump(exclude_unset=True)
        if "method_instrument" in changes:
            changes["method_instrument"] = self._validate_method(changes["method_instrument"])
            self.db.execute(
                update(FileAsset)
                .where(FileAsset.characterization_record_id == record.id)
                .values(
                    method=changes["method_instrument"],
                    file_kind=changes["method_instrument"],
                )
            )
        for key, value in changes.items():
            setattr(record, key, value)
        saved = self.results.save_characterization_record(record)
        self.audit.record_event(
            actor=current_user,
            entity_type="characterization_record",
            entity_id=saved.id,
            action="update",
            before_json=before,
            after_json=self._characterization_snapshot(saved),
        )
        sample = self.db.get(Sample, saved.sample_id)
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=run.id,
            action="update_result",
            before_json=None,
            after_json={
                "sample_code": sample.sample_code,
                "kind": "characterization",
                "method": saved.method_instrument,
            },
        )
        refresh_result_missing_todo(self.db, run)
        self.db.commit()
        return self._characterization_read(saved)

    def delete_characterization_record(self, record_id: UUID, current_user: User) -> None:
        record = self._visible_characterization_record(record_id, current_user)
        run = self._locked_run(record.experiment_run_id)
        ensure_results_editable(run)
        # Keep characterization evidence explicit: attachments must be soft-deleted first.
        if self.files.has_active_for_characterization_record(record.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Delete or otherwise handle active attachments before deleting the "
                    "characterization record"
                ),
            )
        if self.db.scalar(
            select(MeasuredProduct.id)
            .where(MeasuredProduct.characterization_record_id == record.id)
            .limit(1)
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Delete linked measured products before deleting the characterization record"
                ),
            )
        before = self._characterization_snapshot(record)
        self.results.delete(record)
        self.audit.record_event(
            actor=current_user,
            entity_type="characterization_record",
            entity_id=record.id,
            action="delete",
            before_json=before,
            after_json=None,
        )
        sample = self.db.get(Sample, record.sample_id)
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=run.id,
            action="delete_result",
            before_json={
                "sample_code": sample.sample_code,
                "kind": "characterization",
                "method": before["method_instrument"],
            },
            after_json=None,
        )
        refresh_result_missing_todo(self.db, run)
        self.db.commit()

    def list_measured_products(
        self, sample_id: UUID, current_user: User
    ) -> MeasuredProductListResponse:
        sample = self._visible_sample(sample_id, current_user)
        items = self.results.list_measured_products(sample.id)
        return MeasuredProductListResponse(
            items=[self._measured_product_read(item) for item in items],
            total=len(items),
        )

    def create_measured_product(
        self,
        sample_id: UUID,
        payload: MeasuredProductCreate,
        current_user: User,
    ) -> MeasuredProductRead:
        sample = self._visible_sample(sample_id, current_user)
        run = self._locked_run(sample.experiment_run_id)
        ensure_results_editable(run)
        self._validate_observed_phenomena(payload.observed_phenomena)
        if payload.characterization_record_id:
            self._ensure_record_belongs_to_sample(payload.characterization_record_id, sample.id)
        product = MeasuredProduct(sample_id=sample.id, **payload.model_dump())
        saved = self.results.save_measured_product(product)
        self.audit.record_event(
            actor=current_user,
            entity_type="measured_product",
            entity_id=saved.id,
            action="create",
            before_json=None,
            after_json=self._measured_product_snapshot(saved),
        )
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=run.id,
            action="create_result",
            before_json=None,
            after_json={
                "sample_code": sample.sample_code,
                "kind": (
                    "characterization" if saved.characterization_record_id else "direct_observation"
                ),
            },
        )
        self._clear_not_characterized(run, current_user)
        refresh_result_missing_todo(self.db, run)
        self.db.commit()
        return self._measured_product_read(saved)

    def update_measured_product(
        self,
        product_id: UUID,
        payload: MeasuredProductUpdate,
        current_user: User,
    ) -> MeasuredProductRead:
        product = self._visible_measured_product(product_id, current_user)
        sample = self.db.get(Sample, product.sample_id)
        run = self._locked_run(sample.experiment_run_id)
        ensure_results_editable(run)
        before = self._measured_product_snapshot(product)
        changes = payload.model_dump(exclude_unset=True)
        if "observed_phenomena" in changes:
            self._validate_observed_phenomena(changes["observed_phenomena"])
        characterization_record_id = changes.get("characterization_record_id")
        if characterization_record_id:
            self._ensure_record_belongs_to_sample(characterization_record_id, sample.id)
        for key, value in changes.items():
            setattr(product, key, value)
        saved = self.results.save_measured_product(product)
        self.audit.record_event(
            actor=current_user,
            entity_type="measured_product",
            entity_id=saved.id,
            action="update",
            before_json=before,
            after_json=self._measured_product_snapshot(saved),
        )
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=run.id,
            action="update_result",
            before_json=None,
            after_json={
                "sample_code": sample.sample_code,
                "kind": (
                    "characterization" if saved.characterization_record_id else "direct_observation"
                ),
            },
        )
        refresh_result_missing_todo(self.db, run)
        self.db.commit()
        return self._measured_product_read(saved)

    def _ensure_record_belongs_to_sample(self, record_id: UUID, sample_id: UUID) -> None:
        record = self.results.get_characterization_record(record_id)
        if record is None or record.sample_id != sample_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="characterization_record_id must belong to the sample",
            )

    def _apply_characterization_payload(
        self,
        record: CharacterizationRecord,
        payload: V2ResultWrite,
    ) -> None:
        record.method_instrument = self._validate_method(payload.method_instrument)
        record.test_conditions = payload.test_conditions
        record.instrument_id = payload.instrument_id
        record.instrument_version = payload.instrument_version
        record.instrument_snapshot_json = self._instrument_snapshot(
            payload.instrument_id,
            payload.instrument_version,
        )

    def _instrument_snapshot(
        self,
        instrument_id: UUID | None,
        instrument_version: int | None,
    ) -> dict | None:
        if instrument_id is None:
            return None
        try:
            version = self.entities.get_version("instrument", instrument_id, instrument_version)
        except HTTPException as exc:
            if exc.status_code != status.HTTP_404_NOT_FOUND:
                raise
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Referenced instrument version does not exist",
            ) from exc
        return instrument_version_snapshot(version)

    @staticmethod
    def _measured_values(payload: V2ResultWrite) -> dict:
        return {
            "observed_phenomena": payload.observed_phenomena,
            "detected_phase_stacking": payload.detected_phase_stacking,
            "measured_layers_coverage": payload.measured_layers_coverage,
            "domain_nucleation_continuity": payload.domain_nucleation_continuity,
            "key_spectral_metrics": payload.key_spectral_metrics,
        }

    def _result_read(self, product: MeasuredProduct) -> V2ResultRead:
        record = (
            self.results.get_characterization_record(product.characterization_record_id)
            if product.characterization_record_id
            else None
        )
        return V2ResultRead(
            id=product.id,
            sample_id=product.sample_id,
            kind="characterization" if record else "direct_observation",
            characterization_record_id=record.id if record else None,
            instrument_id=record.instrument_id if record else None,
            instrument_version=record.instrument_version if record else None,
            instrument_snapshot_json=record.instrument_snapshot_json if record else None,
            method_instrument=(
                canonical_option_value(record.method_instrument) if record else None
            ),
            test_conditions=record.test_conditions if record else None,
            observed_phenomena=(
                [canonical_option_value(value) for value in product.observed_phenomena]
                if product.observed_phenomena
                else product.observed_phenomena
            ),
            detected_phase_stacking=product.detected_phase_stacking,
            measured_layers_coverage=product.measured_layers_coverage,
            domain_nucleation_continuity=product.domain_nucleation_continuity,
            key_spectral_metrics=product.key_spectral_metrics,
            created_at=product.created_at,
            updated_at=product.updated_at,
        )

    @staticmethod
    def _characterization_read(record: CharacterizationRecord) -> CharacterizationRecordRead:
        result = CharacterizationRecordRead.model_validate(record)
        return result.model_copy(
            update={"method_instrument": canonical_option_value(result.method_instrument)}
        )

    @staticmethod
    def _measured_product_read(product: MeasuredProduct) -> MeasuredProductRead:
        result = MeasuredProductRead.model_validate(product)
        return result.model_copy(
            update={
                "observed_phenomena": (
                    [canonical_option_value(value) for value in result.observed_phenomena]
                    if result.observed_phenomena
                    else result.observed_phenomena
                )
            }
        )

    @staticmethod
    def _validate_method(method: str | None) -> str:
        normalized = canonical_option_value((method or "").strip())
        if not normalized or normalized not in field_option_values("method_instrument"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid method_instrument",
            )
        return normalized

    @staticmethod
    def _validate_observed_phenomena(values: list[str] | None) -> None:
        if values is None:
            return
        normalized = [canonical_option_value(value) for value in values]
        allowed = set(field_option_values("observed_phenomena"))
        if any(value not in allowed for value in normalized):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid observed_phenomena",
            )
        values[:] = normalized

    def delete_measured_product(self, product_id: UUID, current_user: User) -> None:
        product = self._visible_measured_product(product_id, current_user)
        sample = self.db.get(Sample, product.sample_id)
        run = self._locked_run(sample.experiment_run_id)
        ensure_results_editable(run)
        before = self._measured_product_snapshot(product)
        self.results.delete(product)
        self.audit.record_event(
            actor=current_user,
            entity_type="measured_product",
            entity_id=product.id,
            action="delete",
            before_json=before,
            after_json=None,
        )
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=run.id,
            action="delete_result",
            before_json={
                "sample_code": sample.sample_code,
                "kind": (
                    "characterization"
                    if product.characterization_record_id
                    else "direct_observation"
                ),
            },
            after_json=None,
        )
        refresh_result_missing_todo(self.db, run)
        self.db.commit()

    @staticmethod
    def _characterization_snapshot(record: CharacterizationRecord) -> dict:
        return V2ResultsService._characterization_read(record).model_dump(mode="json")

    @staticmethod
    def _measured_product_snapshot(product: MeasuredProduct) -> dict:
        return V2ResultsService._measured_product_read(product).model_dump(mode="json")

    def _visible_sample(self, sample_id: UUID, current_user: User) -> Sample:
        sample = self.db.get(Sample, sample_id)
        if sample is None or sample.deleted_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
        get_visible_experiment(
            self.experiments,
            sample.experiment_run_id,
            current_user,
            schema_version=SCHEMA_VERSION,
        )
        return sample

    def _locked_run(self, run_id: UUID) -> ExperimentRun:
        run = self.experiments.get_by_id_for_update(run_id)
        if run is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Experiment not found",
            )
        return run

    def _sample_for_run(self, sample_id: UUID, run_id: UUID) -> Sample:
        sample = self.db.get(Sample, sample_id)
        if sample is None or sample.deleted_at is not None or sample.experiment_run_id != run_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
        return sample

    def _visible_characterization_record(
        self, record_id: UUID, current_user: User
    ) -> CharacterizationRecord:
        record = self.results.get_characterization_record(record_id)
        if record is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
        get_visible_experiment(
            self.experiments,
            record.experiment_run_id,
            current_user,
            schema_version=SCHEMA_VERSION,
        )
        return record

    def _visible_measured_product(self, product_id: UUID, current_user: User) -> MeasuredProduct:
        product = self.results.get_measured_product(product_id)
        if product is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
        self._visible_sample(product.sample_id, current_user)
        return product

    def _clear_not_characterized(self, run, current_user: User) -> None:
        if run.not_characterized_at is None:
            return
        before = {
            "not_characterized_by_id": str(run.not_characterized_by_id),
            "not_characterized_at": run.not_characterized_at.isoformat(),
        }
        run.not_characterized_by_id = None
        run.not_characterized_at = None
        self.audit.record_event(
            actor=current_user,
            entity_type="experiment_run",
            entity_id=run.id,
            action="clear_not_characterized",
            before_json=before,
            after_json={
                "not_characterized_by_id": None,
                "not_characterized_at": None,
            },
        )
