from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.sample import Sample
from app.models.user import User
from app.models.v2_results import CharacterizationRecord, MeasuredProduct
from app.repositories.experiment_repository import ExperimentRepository
from app.repositories.file_asset_repository import FileAssetRepository
from app.repositories.v2_repository import V2ResultRepository
from app.schemas.v2 import (
    CharacterizationRecordListResponse,
    CharacterizationRecordRead,
    MeasuredProductListResponse,
    MeasuredProductRead,
    V2ResultListResponse,
    V2ResultRead,
)
from app.services.experiment_guards import get_visible_experiment
from app.services.v2_field_source import SCHEMA_VERSION, canonical_option_value


class V2ResultsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)
        self.results = V2ResultRepository(db)
        self.files = FileAssetRepository(db)

    def list_results(self, sample_id: UUID, current_user: User) -> V2ResultListResponse:
        sample = self._visible_sample(sample_id, current_user)
        items = self.results.list_measured_products(sample.id)
        return V2ResultListResponse(
            items=[self._result_read(item) for item in items],
            total=len(items),
        )

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

    def list_measured_products(
        self, sample_id: UUID, current_user: User
    ) -> MeasuredProductListResponse:
        sample = self._visible_sample(sample_id, current_user)
        items = self.results.list_measured_products(sample.id)
        return MeasuredProductListResponse(
            items=[self._measured_product_read(item) for item in items],
            total=len(items),
        )

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
            method_other=(record.attrs or {}).get("method_other") if record else None,
            test_conditions=record.test_conditions if record else None,
            file_asset_ids=self._active_direct_observation_file_ids(product),
            observed_phenomena=(
                [canonical_option_value(value) for value in product.observed_phenomena]
                if product.observed_phenomena
                else product.observed_phenomena
            ),
            observed_phenomena_other=(product.attrs or {}).get("observed_phenomena_other"),
            detected_phase_stacking=product.detected_phase_stacking,
            layer_count=product.layer_count,
            coverage_percent=product.coverage_percent,
            domain_size_um=product.domain_size_um,
            nucleation_density_cm2=product.nucleation_density_cm2,
            measured_layers_coverage=product.measured_layers_coverage,
            domain_nucleation_continuity=product.domain_nucleation_continuity,
            key_spectral_metrics=product.key_spectral_metrics,
            created_at=product.created_at,
            updated_at=product.updated_at,
        )

    def _active_direct_observation_file_ids(
        self,
        product: MeasuredProduct,
    ) -> list[UUID]:
        active: list[UUID] = []
        for raw_id in (product.attrs or {}).get("evidence_file_ids", []):
            try:
                file_id = UUID(str(raw_id))
                asset = self.files.get_by_id(file_id)
            except (TypeError, ValueError, AttributeError):
                continue
            if (
                asset is not None
                and asset.deleted_at is None
                and asset.asset_role == "direct_observation_file"
                and asset.sample_id == product.sample_id
            ):
                active.append(file_id)
        return active

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
