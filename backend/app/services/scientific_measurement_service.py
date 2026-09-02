from __future__ import annotations

import base64
import binascii
import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.file_asset import FileAsset
from app.models.sample import Sample
from app.models.scientific import (
    AnalysisRun,
    DataDerivationEdge,
    MaterialAssertion,
    PropertyValue,
    RunRevision,
    SampleRevisionState,
)
from app.models.user import User, UserRole
from app.models.v2_entities import InstrumentCapability, InstrumentLifecycleEvent
from app.models.v2_results import CharacterizationRecord
from app.repositories.experiment_repository import ExperimentRepository
from app.schemas.scientific import (
    MeasurementAnalysisRead,
    MeasurementAssertionRead,
    MeasurementBundleCreate,
    MeasurementDetailRead,
    MeasurementListResponse,
    MeasurementPropertyRead,
    MeasurementRawFileRead,
    MeasurementSummaryRead,
    SampleRegion,
)
from app.services.audit_service import AuditService
from app.services.experiment_guards import (
    ensure_results_editable,
    get_locked_visible_experiment,
    get_visible_experiment,
)
from app.services.file_asset_service import refresh_revision_provenance
from app.services.sample_service import ensure_sample_revision_association
from app.services.v2_entity_service import V2EntityService
from app.services.v2_entity_snapshot_service import instrument_version_snapshot
from app.services.v2_field_source import (
    SCHEMA_VERSION,
    characterization_profiles,
    normalize_offset_datetime,
)
from app.services.v2_result_evidence import collect_measurement_evidence
from app.services.v2_result_status_service import (
    clear_not_characterized,
    refresh_result_missing_todo,
)


class ScientificMeasurementService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)
        self.entities = V2EntityService(db)
        self.audit = AuditService(db)

    def create_bundle(
        self,
        payload: MeasurementBundleCreate,
        actor: User,
    ) -> MeasurementSummaryRead:
        sample_run_id = self.db.scalar(
            select(Sample.experiment_run_id).where(Sample.id == payload.measurement.sample_id)
        )
        if sample_run_id is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
        run = get_locked_visible_experiment(
            self.experiments,
            sample_run_id,
            actor,
            schema_version=SCHEMA_VERSION,
        )
        sample = self.db.scalar(
            select(Sample)
            .where(Sample.id == payload.measurement.sample_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if (
            sample is None
            or sample.experiment_run_id != run.id
            or sample.deleted_at is not None
            or sample.lifecycle_state != "active"
        ):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
        ensure_results_editable(run)
        if run.status not in {ExperimentStatus.LOCKED, ExperimentStatus.REVIEWED}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Measurements require a locked run revision",
            )
        run_revision_id = run.current_revision_id
        if run_revision_id is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Sample is not bound to an immutable run revision",
            )
        if sample.role == "growth" and sample.run_revision_id != run_revision_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Growth sample does not belong to the current run revision",
            )
        measurement = payload.measurement
        revision = self.db.get(RunRevision, run_revision_id)
        basic_info = (
            ((revision.content_json or {}).get("modules") or {}).get("basic_info") or {}
            if revision is not None
            else {}
        )
        started_at = basic_info.get("started_at")
        if started_at is not None and measurement.measured_at < normalize_offset_datetime(
            started_at
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Measurement cannot precede the experiment start",
            )
        ensure_sample_revision_association(self.db, sample, run_revision_id)

        analysis_input_ids = [
            file_id for analysis in payload.analyses for file_id in analysis.input_file_ids
        ]
        analysis_output_ids = [
            file_id for analysis in payload.analyses for file_id in analysis.output_file_ids
        ]
        region_image_id = measurement.sample_region.image_file_id
        referenced_ids = set(
            [
                *measurement.raw_file_ids,
                *analysis_input_ids,
                *analysis_output_ids,
                *([region_image_id] if region_image_id else []),
            ]
        )
        referenced_files = self._active_files(list(referenced_ids), run.id, sample.id)
        files_by_id = {file.id: file for file in referenced_files}
        raw_files = [files_by_id[file_id] for file_id in measurement.raw_file_ids]
        analysis_input_files = [files_by_id[file_id] for file_id in set(analysis_input_ids)]
        analysis_output_files = [files_by_id[file_id] for file_id in analysis_output_ids]
        self._validate_region_image(measurement.sample_region, files_by_id)
        if any(
            file.asset_role != "characterization_file"
            or file.file_category not in {"raw", "processed"}
            for file in analysis_input_files
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Analysis input files must be characterization data",
            )
        self._validate_upstream_files(
            [
                *analysis_input_files,
                *([files_by_id[region_image_id]] if region_image_id else []),
            ],
            run_revision_id,
            sample.id,
        )
        if any(file.characterization_record_id is not None for file in analysis_output_files) or (
            analysis_output_ids
            and self.db.scalar(
                select(DataDerivationEdge.id)
                .where(DataDerivationEdge.file_asset_id.in_(analysis_output_ids))
                .limit(1)
            )
            is not None
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Analysis output files must be unused and have one producer",
            )
        if any(
            file.asset_role != "characterization_file"
            or file.file_category != "processed"
            or file.method != measurement.method_profile
            for file in analysis_output_files
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    "Analysis output files must be processed characterization data for the method"
                ),
            )
        instrument_snapshot = self._instrument_snapshot(
            measurement.instrument_id,
            measurement.instrument_version,
            measurement.method_profile,
            measurement.measured_at,
        )
        if any(file.characterization_record_id is not None for file in raw_files):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Raw data files are already linked to a measurement",
            )
        if any(
            file.asset_role != "characterization_file"
            or file.file_category != "raw"
            or file.method != measurement.method_profile
            for file in raw_files
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Raw data files must match the measurement method",
            )
        record = CharacterizationRecord(
            experiment_run_id=run.id,
            run_revision_id=run_revision_id,
            sample_id=sample.id,
            instrument_id=measurement.instrument_id,
            instrument_version=measurement.instrument_version,
            instrument_snapshot_json=instrument_snapshot,
            method_instrument=measurement.method_profile,
            performed_by_id=actor.id,
            measured_at=measurement.measured_at,
            sample_region=measurement.sample_region.model_dump(mode="json", exclude_none=True),
            typed_conditions=measurement.typed_conditions.model_dump(exclude_none=True),
            quality_flag=measurement.quality_flag,
            test_conditions=None,
            raw_data=None,
            attrs=(
                {"quality_note": measurement.quality_note}
                if measurement.quality_note is not None
                else {}
            ),
        )
        self.db.add(record)
        self.db.flush()
        for file in raw_files:
            file.characterization_record_id = record.id

        analyses: list[AnalysisRun] = []
        for item in payload.analyses:
            analysis = AnalysisRun(
                measurement_run_id=record.id,
                performed_by_id=actor.id,
                software_name=item.software_name,
                software_version=item.software_version,
                code_commit=item.code_commit,
                parameters_json=item.parameters,
                started_at=item.started_at,
                completed_at=item.completed_at,
            )
            self.db.add(analysis)
            self.db.flush()
            analyses.append(analysis)
            inputs = [files_by_id[file_id] for file_id in item.input_file_ids]
            outputs = [files_by_id[file_id] for file_id in item.output_file_ids]
            for direction, files in (("input", inputs), ("output", outputs)):
                for file in files:
                    self.db.add(
                        DataDerivationEdge(
                            analysis_run_id=analysis.id,
                            file_asset_id=file.id,
                            direction=direction,
                        )
                    )

        property_rows: list[tuple[PropertyValue, str | None]] = []
        for item in payload.properties:
            property_row = PropertyValue(
                sample_id=sample.id,
                measurement_run_id=record.id,
                analysis_run_id=(
                    analyses[item.analysis_index].id if item.analysis_index is not None else None
                ),
                property_code=item.property_code,
                numeric_value=item.numeric_value,
                text_value=item.text_value,
                structured_value=item.structured_value,
                unit=item.unit,
                statistic=item.statistic,
                uncertainty_value=item.uncertainty_value,
                uncertainty_type=item.uncertainty_type,
                sample_count=item.sample_count,
                quality_flag=item.quality_flag,
            )
            self.db.add(property_row)
            property_rows.append((property_row, item.quality_note))

        assertions: list[MaterialAssertion] = []
        for item in payload.assertions:
            assertion = MaterialAssertion(
                sample_id=sample.id,
                measurement_run_id=record.id,
                analysis_run_id=(
                    analyses[item.analysis_index].id if item.analysis_index is not None else None
                ),
                assertion_type=item.assertion_type,
                value_json=item.value,
                confidence=item.confidence,
            )
            self.db.add(assertion)
            assertions.append(assertion)

        self.db.flush()
        property_quality_notes = {
            str(row.id): note for row, note in property_rows if note is not None
        }
        if property_quality_notes:
            record.attrs = {
                **(record.attrs or {}),
                "property_quality_notes": property_quality_notes,
            }
        self._refresh_sample_actual_state(sample, run_revision_id)
        refresh_revision_provenance(self.db, run_revision_id)
        self.audit.record_event(
            actor=actor,
            entity_type="measurement_run",
            entity_id=record.id,
            action="create",
            before_json=None,
            after_json={
                "sample_id": str(sample.id),
                "run_revision_id": str(run_revision_id),
                "method_profile": measurement.method_profile,
                "raw_file_ids": [str(file.id) for file in raw_files],
                "analysis_count": len(analyses),
                "property_count": len(payload.properties),
                "assertion_count": len(assertions),
            },
        )
        if measurement.quality_flag == "valid" and (
            raw_files
            or any(
                item.quality_flag in {"valid", "below_detection_limit"}
                for item in payload.properties
            )
            or assertions
        ):
            clear_not_characterized(self.db, run, actor)
        refresh_result_missing_todo(self.db, run)
        self.db.commit()
        return self._summary(record)

    def list_measurements(
        self,
        actor: User,
        *,
        limit: int,
        cursor: str | None,
        run_id: UUID | None = None,
        sample_id: UUID | None = None,
        method_profile: str | None = None,
        include_history: bool = False,
    ) -> MeasurementListResponse:
        query_sha256 = self._cursor_query_sha256(
            actor_id=actor.id,
            limit=limit,
            run_id=run_id,
            sample_id=sample_id,
            method_profile=method_profile,
            include_history=include_history,
        )
        raw_count = (
            select(func.count(FileAsset.id))
            .where(
                FileAsset.characterization_record_id == CharacterizationRecord.id,
                FileAsset.deleted_at.is_(None),
                FileAsset.asset_role == "characterization_file",
                FileAsset.file_category == "raw",
            )
            .correlate(CharacterizationRecord)
            .scalar_subquery()
        )
        analysis_count = (
            select(func.count(AnalysisRun.id))
            .where(AnalysisRun.measurement_run_id == CharacterizationRecord.id)
            .correlate(CharacterizationRecord)
            .scalar_subquery()
        )
        property_count = (
            select(func.count(PropertyValue.id))
            .where(PropertyValue.measurement_run_id == CharacterizationRecord.id)
            .correlate(CharacterizationRecord)
            .scalar_subquery()
        )
        assertion_count = (
            select(func.count(MaterialAssertion.id))
            .where(MaterialAssertion.measurement_run_id == CharacterizationRecord.id)
            .correlate(CharacterizationRecord)
            .scalar_subquery()
        )
        statement = (
            select(
                CharacterizationRecord,
                Sample,
                ExperimentRun,
                raw_count.label("raw_file_count"),
                analysis_count.label("analysis_count"),
                property_count.label("property_count"),
                assertion_count.label("assertion_count"),
            )
            .join(Sample, Sample.id == CharacterizationRecord.sample_id)
            .join(ExperimentRun, ExperimentRun.id == CharacterizationRecord.experiment_run_id)
            .where(
                CharacterizationRecord.run_revision_id.is_not(None),
                Sample.deleted_at.is_(None),
            )
        )
        if not include_history:
            statement = statement.where(
                CharacterizationRecord.run_revision_id == ExperimentRun.current_revision_id,
                or_(
                    Sample.role != "growth",
                    Sample.run_revision_id == ExperimentRun.current_revision_id,
                ),
            )
        if run_id is not None:
            run = get_visible_experiment(
                self.experiments,
                run_id,
                actor,
                schema_version=SCHEMA_VERSION,
            )
            statement = statement.where(CharacterizationRecord.experiment_run_id == run.id)
        elif actor.role != UserRole.ADMIN:
            statement = statement.where(
                or_(
                    ExperimentRun.owner_id == actor.id,
                    ExperimentRun.status.in_([ExperimentStatus.LOCKED, ExperimentStatus.REVIEWED]),
                )
            )
        if sample_id is not None:
            statement = statement.where(CharacterizationRecord.sample_id == sample_id)
        if method_profile:
            statement = statement.where(CharacterizationRecord.method_instrument == method_profile)
        total = (
            self.db.scalar(
                statement.with_only_columns(func.count(CharacterizationRecord.id)).order_by(None)
            )
            or 0
        )
        if cursor:
            measured_at, measurement_id = self._decode_cursor(cursor, query_sha256)
            statement = statement.where(
                or_(
                    CharacterizationRecord.measured_at < measured_at,
                    and_(
                        CharacterizationRecord.measured_at == measured_at,
                        CharacterizationRecord.id < measurement_id,
                    ),
                )
            )
        rows = list(
            self.db.execute(
                statement.order_by(
                    CharacterizationRecord.measured_at.desc(),
                    CharacterizationRecord.id.desc(),
                ).limit(limit + 1)
            )
        )
        has_more = len(rows) > limit
        rows = rows[:limit]
        evidence_record_ids = self._evidence_record_ids(
            [row.CharacterizationRecord.id for row in rows]
        )
        items = [
            self._summary_from_values(
                record=row.CharacterizationRecord,
                sample=row.Sample,
                run=row.ExperimentRun,
                raw_file_count=row.raw_file_count,
                analysis_count=row.analysis_count,
                property_count=row.property_count,
                assertion_count=row.assertion_count,
                evidence_present=(
                    row.CharacterizationRecord.quality_flag == "valid"
                    and row.CharacterizationRecord.id in evidence_record_ids
                ),
            )
            for row in rows
        ]
        next_cursor = (
            self._encode_cursor(
                rows[-1].CharacterizationRecord.measured_at,
                rows[-1].CharacterizationRecord.id,
                query_sha256,
            )
            if has_more and rows
            else None
        )
        return MeasurementListResponse(
            items=items,
            total=total,
            next_cursor=next_cursor,
        )

    def get_measurement(self, measurement_id: UUID, actor: User) -> MeasurementDetailRead:
        record = self.db.get(CharacterizationRecord, measurement_id)
        if record is None or record.run_revision_id is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Measurement not found",
            )
        get_visible_experiment(
            self.experiments,
            record.experiment_run_id,
            actor,
            schema_version=SCHEMA_VERSION,
        )
        return self._detail(record, actor)

    def invalidate_measurement(
        self,
        measurement_id: UUID,
        reason: str,
        actor: User,
    ) -> MeasurementDetailRead:
        existing = self.db.get(CharacterizationRecord, measurement_id)
        if existing is None or existing.run_revision_id is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Measurement not found",
            )
        run = get_locked_visible_experiment(
            self.experiments,
            existing.experiment_run_id,
            actor,
            schema_version=SCHEMA_VERSION,
        )
        ensure_results_editable(run)
        sample = self.db.scalar(
            select(Sample)
            .where(Sample.id == existing.sample_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        record = self.db.scalar(
            select(CharacterizationRecord)
            .where(CharacterizationRecord.id == measurement_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Measurement not found",
            )
        if not self._measurement_is_current_and_active(run, record, sample):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Historical or inactive measurements are read-only",
            )
        if actor.role != UserRole.ADMIN and actor.id not in {record.performed_by_id, run.owner_id}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        if record.quality_flag == "invalid":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Measurement is already invalid",
            )
        if self._has_active_downstream_measurements(record):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Invalidate downstream measurements before their upstream evidence",
            )
        before = {
            "quality_flag": record.quality_flag,
            "attrs": record.attrs,
        }
        invalidated_at = datetime.now(UTC)
        record.quality_flag = "invalid"
        record.attrs = {
            **(record.attrs or {}),
            "invalidation_reason": reason,
            "invalidated_by_id": str(actor.id),
            "invalidated_at": invalidated_at.isoformat(),
        }
        self.db.flush()
        assert sample is not None
        self._refresh_sample_actual_state(sample, record.run_revision_id)
        refresh_revision_provenance(self.db, record.run_revision_id)
        self.audit.record_event(
            actor=actor,
            entity_type="measurement_run",
            entity_id=record.id,
            action="invalidate",
            before_json=before,
            after_json={
                "quality_flag": record.quality_flag,
                "attrs": record.attrs,
            },
            reason=reason,
        )
        refresh_result_missing_todo(self.db, run)
        self.db.commit()
        return self._detail(record, actor)

    def _detail(self, record: CharacterizationRecord, actor: User) -> MeasurementDetailRead:
        if record.run_revision_id is None:
            raise RuntimeError("invalid measurement row")
        revision = self.db.get(RunRevision, record.run_revision_id)
        if revision is None:
            raise RuntimeError("measurement revision is missing")
        raw_files = list(
            self.db.scalars(
                select(FileAsset)
                .where(
                    FileAsset.characterization_record_id == record.id,
                    FileAsset.asset_role == "characterization_file",
                    FileAsset.file_category == "raw",
                )
                .order_by(FileAsset.created_at, FileAsset.id)
            )
        )
        analyses = list(
            self.db.scalars(
                select(AnalysisRun)
                .where(AnalysisRun.measurement_run_id == record.id)
                .order_by(AnalysisRun.started_at, AnalysisRun.id)
            )
        )
        edges = (
            list(
                self.db.scalars(
                    select(DataDerivationEdge)
                    .where(
                        DataDerivationEdge.analysis_run_id.in_(
                            [analysis.id for analysis in analyses]
                        )
                    )
                    .order_by(
                        DataDerivationEdge.analysis_run_id,
                        DataDerivationEdge.direction,
                        DataDerivationEdge.file_asset_id,
                    )
                )
            )
            if analyses
            else []
        )
        related_file_ids = {edge.file_asset_id for edge in edges}
        region_image_id = (record.sample_region or {}).get("image_file_id")
        if region_image_id:
            try:
                related_file_ids.add(UUID(str(region_image_id)))
            except ValueError:
                region_image_id = None
        related_files = (
            list(
                self.db.scalars(
                    select(FileAsset)
                    .where(FileAsset.id.in_(related_file_ids))
                    .order_by(FileAsset.created_at, FileAsset.id)
                )
            )
            if related_file_ids
            else []
        )
        related_file_by_id = {file.id: file for file in related_files}
        properties = list(
            self.db.scalars(
                select(PropertyValue)
                .where(PropertyValue.measurement_run_id == record.id)
                .order_by(PropertyValue.id)
            )
        )
        assertions = list(
            self.db.scalars(
                select(MaterialAssertion)
                .where(MaterialAssertion.measurement_run_id == record.id)
                .order_by(MaterialAssertion.created_at, MaterialAssertion.id)
            )
        )
        attrs = record.attrs or {}
        summary = self._summary(record)
        run = self.db.get(ExperimentRun, record.experiment_run_id)
        sample = self.db.get(Sample, record.sample_id)
        performer = self.db.get(User, record.performed_by_id)
        analysis_performer_names = {
            user_id: user.name
            for user_id in {analysis.performed_by_id for analysis in analyses}
            if (user := self.db.get(User, user_id)) is not None
        }
        property_quality_notes = attrs.get("property_quality_notes", {})

        def file_read(file: FileAsset) -> MeasurementRawFileRead:
            return MeasurementRawFileRead(
                id=file.id,
                original_name=file.original_name,
                sha256=file.sha256,
                content_type=file.content_type,
                size_bytes=file.size_bytes,
                method=file.method,
                file_category=file.file_category,
                deleted_at=file.deleted_at,
            )

        return MeasurementDetailRead(
            **summary.model_dump(),
            revision_number=revision.revision_number,
            performed_by_name=performer.name if performer is not None else None,
            can_invalidate=bool(
                record.quality_flag != "invalid"
                and self._measurement_is_current_and_active(run, record, sample)
                and not self._has_active_downstream_measurements(record)
                and (
                    actor.role == UserRole.ADMIN
                    or actor.id in {record.performed_by_id, run.owner_id}
                )
            ),
            raw_files=[file_read(file) for file in raw_files],
            region_image_file=(
                file_read(related_file_by_id[UUID(str(region_image_id))])
                if region_image_id and UUID(str(region_image_id)) in related_file_by_id
                else None
            ),
            analyses=[
                MeasurementAnalysisRead(
                    id=analysis.id,
                    performed_by_id=analysis.performed_by_id,
                    performed_by_name=analysis_performer_names.get(analysis.performed_by_id),
                    software_name=analysis.software_name,
                    software_version=analysis.software_version,
                    code_commit=analysis.code_commit,
                    parameters=analysis.parameters_json,
                    started_at=analysis.started_at,
                    completed_at=analysis.completed_at,
                    input_file_ids=[
                        edge.file_asset_id
                        for edge in edges
                        if edge.analysis_run_id == analysis.id and edge.direction == "input"
                    ],
                    output_file_ids=[
                        edge.file_asset_id
                        for edge in edges
                        if edge.analysis_run_id == analysis.id and edge.direction == "output"
                    ],
                    input_files=[
                        file_read(related_file_by_id[edge.file_asset_id])
                        for edge in edges
                        if edge.analysis_run_id == analysis.id
                        and edge.direction == "input"
                        and edge.file_asset_id in related_file_by_id
                    ],
                    output_files=[
                        file_read(related_file_by_id[edge.file_asset_id])
                        for edge in edges
                        if edge.analysis_run_id == analysis.id
                        and edge.direction == "output"
                        and edge.file_asset_id in related_file_by_id
                    ],
                )
                for analysis in analyses
            ],
            properties=[
                MeasurementPropertyRead(
                    id=item.id,
                    analysis_run_id=item.analysis_run_id,
                    property_code=item.property_code,
                    numeric_value=item.numeric_value,
                    text_value=item.text_value,
                    structured_value=item.structured_value,
                    unit=item.unit,
                    statistic=item.statistic,
                    uncertainty_value=item.uncertainty_value,
                    uncertainty_type=item.uncertainty_type,
                    sample_count=item.sample_count,
                    quality_flag=item.quality_flag,
                    quality_note=property_quality_notes.get(str(item.id)),
                )
                for item in properties
            ],
            assertions=[
                MeasurementAssertionRead(
                    id=item.id,
                    analysis_run_id=item.analysis_run_id,
                    assertion_type=item.assertion_type,
                    value=item.value_json,
                    confidence=item.confidence,
                    validity=item.validity,
                )
                for item in assertions
            ],
            invalidation_reason=attrs.get("invalidation_reason"),
            invalidated_by_id=attrs.get("invalidated_by_id"),
            invalidated_at=attrs.get("invalidated_at"),
        )

    @staticmethod
    def _measurement_is_current_and_active(
        run: ExperimentRun | None,
        record: CharacterizationRecord,
        sample: Sample | None,
    ) -> bool:
        return bool(
            run is not None
            and run.status in {ExperimentStatus.LOCKED, ExperimentStatus.REVIEWED}
            and run.current_revision_id is not None
            and record.experiment_run_id == run.id
            and record.run_revision_id == run.current_revision_id
            and sample is not None
            and sample.id == record.sample_id
            and sample.experiment_run_id == run.id
            and sample.deleted_at is None
            and sample.lifecycle_state == "active"
            and (sample.role != "growth" or sample.run_revision_id == run.current_revision_id)
        )

    def _instrument_snapshot(
        self,
        instrument_id: UUID | None,
        version_number: int | None,
        method_profile: str,
        measured_at: datetime,
    ) -> dict | None:
        profile = characterization_profiles().get(method_profile)
        if profile is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Unsupported measurement profile",
            )
        if instrument_id is None or version_number is None:
            if profile["instrument_required"]:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="This measurement profile requires an instrument version",
                )
            return None
        version = self.entities.get_version("instrument", instrument_id, version_number)
        capabilities = set(
            self.db.scalars(
                select(InstrumentCapability.capability_code).where(
                    InstrumentCapability.instrument_version_id == version.id
                )
            )
        )
        legacy_capability = str(version.name_type)
        if capabilities and method_profile not in capabilities:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Instrument does not support the selected method profile",
            )
        if not capabilities and legacy_capability not in {method_profile, "other"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Instrument type does not match the selected method profile",
            )
        snapshot = instrument_version_snapshot(version)
        snapshot["capabilities"] = sorted(capabilities or {legacy_capability})
        snapshot["calibration_at_measurement"] = self._calibration_snapshot(
            instrument_id,
            measured_at,
        )
        return snapshot

    def _calibration_snapshot(self, instrument_id: UUID, measured_at: datetime) -> dict:
        event = self.db.scalar(
            select(InstrumentLifecycleEvent)
            .where(
                InstrumentLifecycleEvent.instrument_id == instrument_id,
                InstrumentLifecycleEvent.event_type == "calibration",
                InstrumentLifecycleEvent.occurred_at <= measured_at,
            )
            .order_by(
                InstrumentLifecycleEvent.occurred_at.desc(),
                InstrumentLifecycleEvent.id.desc(),
            )
            .limit(1)
        )
        if event is None:
            return {
                "measured_at": measured_at.isoformat(),
                "validity_status": "not_recorded",
            }
        certificate = (
            self.db.get(FileAsset, event.certificate_file_id) if event.certificate_file_id else None
        )
        validity = (
            "validity_not_declared"
            if event.valid_until is None
            else "valid"
            if normalize_offset_datetime(event.valid_until) >= measured_at
            else "expired"
        )
        return {
            "event_id": str(event.id),
            "occurred_at": normalize_offset_datetime(event.occurred_at).isoformat(),
            "valid_until": (
                normalize_offset_datetime(event.valid_until).isoformat()
                if event.valid_until
                else None
            ),
            "validity_status": validity,
            "affected_component": event.affected_component,
            "quantity": event.quantity,
            "correction": event.correction,
            "expanded_uncertainty": event.expanded_uncertainty,
            "details": event.details_json,
            "certificate": (
                {
                    "file_asset_id": str(certificate.id),
                    "original_name": certificate.original_name,
                    "sha256": certificate.sha256,
                }
                if certificate
                else None
            ),
        }

    def _active_files(
        self,
        file_ids: list[UUID],
        run_id: UUID,
        sample_id: UUID,
    ) -> list[FileAsset]:
        if not file_ids:
            return []
        files = list(
            self.db.scalars(
                select(FileAsset)
                .where(
                    FileAsset.id.in_(file_ids),
                    FileAsset.experiment_run_id == run_id,
                    FileAsset.sample_id == sample_id,
                    FileAsset.deleted_at.is_(None),
                )
                .order_by(FileAsset.id)
                .with_for_update()
            )
        )
        if {file.id for file in files} != set(file_ids):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="A referenced data file is missing or belongs to another sample",
            )
        return files

    def _validate_region_image(
        self,
        region: SampleRegion,
        files_by_id: dict[UUID, FileAsset],
    ) -> None:
        if region.image_file_id is None:
            return
        image = files_by_id[region.image_file_id]
        if image.asset_role != "characterization_file" or not (image.content_type or "").startswith(
            "image/"
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Sample-region image must be characterization image data",
            )

    def _validate_upstream_files(
        self,
        files: list[FileAsset],
        run_revision_id: UUID,
        sample_id: UUID,
    ) -> None:
        file_ids = {file.id for file in files}
        if not file_ids:
            return
        files_by_id = {file.id: file for file in files}
        upstream_rows = list(
            self.db.execute(
                select(FileAsset.id, CharacterizationRecord)
                .join(
                    CharacterizationRecord,
                    CharacterizationRecord.id == FileAsset.characterization_record_id,
                )
                .where(FileAsset.id.in_(file_ids))
            )
        ) + list(
            self.db.execute(
                select(DataDerivationEdge.file_asset_id, CharacterizationRecord)
                .join(AnalysisRun, AnalysisRun.id == DataDerivationEdge.analysis_run_id)
                .join(
                    CharacterizationRecord,
                    CharacterizationRecord.id == AnalysisRun.measurement_run_id,
                )
                .where(
                    DataDerivationEdge.file_asset_id.in_(file_ids),
                    DataDerivationEdge.direction == "output",
                )
            )
        )
        if any(
            record.experiment_run_id != files_by_id[file_id].experiment_run_id
            or record.run_revision_id != run_revision_id
            or record.sample_id != sample_id
            or record.quality_flag == "invalid"
            for file_id, record in upstream_rows
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    "Analysis and region inputs require a valid upstream record "
                    "in the current revision"
                ),
            )

    def _has_active_downstream_measurements(self, record: CharacterizationRecord) -> bool:
        source_file_ids = set(
            self.db.scalars(
                select(FileAsset.id).where(FileAsset.characterization_record_id == record.id)
            )
        ) | set(
            self.db.scalars(
                select(DataDerivationEdge.file_asset_id)
                .join(AnalysisRun, AnalysisRun.id == DataDerivationEdge.analysis_run_id)
                .where(
                    AnalysisRun.measurement_run_id == record.id,
                    DataDerivationEdge.direction == "output",
                )
            )
        )
        if not source_file_ids:
            return False
        downstream_ids = set(
            self.db.scalars(
                select(AnalysisRun.measurement_run_id)
                .join(DataDerivationEdge, DataDerivationEdge.analysis_run_id == AnalysisRun.id)
                .join(
                    CharacterizationRecord,
                    CharacterizationRecord.id == AnalysisRun.measurement_run_id,
                )
                .where(
                    DataDerivationEdge.file_asset_id.in_(source_file_ids),
                    DataDerivationEdge.direction == "input",
                    AnalysisRun.measurement_run_id != record.id,
                    CharacterizationRecord.run_revision_id == record.run_revision_id,
                    CharacterizationRecord.quality_flag != "invalid",
                )
            )
        )
        if downstream_ids:
            return True
        region_records = self.db.scalars(
            select(CharacterizationRecord).where(
                CharacterizationRecord.id != record.id,
                CharacterizationRecord.sample_id == record.sample_id,
                CharacterizationRecord.run_revision_id == record.run_revision_id,
                CharacterizationRecord.quality_flag != "invalid",
            )
        )
        source_file_id_strings = {str(file_id) for file_id in source_file_ids}
        return any(
            (candidate.sample_region or {}).get("image_file_id") in source_file_id_strings
            for candidate in region_records
        )

    def _summary(self, record: CharacterizationRecord) -> MeasurementSummaryRead:
        sample = self.db.get(Sample, record.sample_id)
        if sample is None or record.run_revision_id is None or record.measured_at is None:
            raise RuntimeError("invalid measurement row")
        run = sample.experiment_run
        return self._summary_from_values(
            record=record,
            sample=sample,
            run=run,
            raw_file_count=self.db.scalar(
                select(func.count(FileAsset.id)).where(
                    FileAsset.characterization_record_id == record.id,
                    FileAsset.deleted_at.is_(None),
                    FileAsset.asset_role == "characterization_file",
                    FileAsset.file_category == "raw",
                )
            )
            or 0,
            analysis_count=self.db.scalar(
                select(func.count(AnalysisRun.id)).where(
                    AnalysisRun.measurement_run_id == record.id
                )
            )
            or 0,
            property_count=self.db.scalar(
                select(func.count(PropertyValue.id)).where(
                    PropertyValue.measurement_run_id == record.id
                )
            )
            or 0,
            assertion_count=self.db.scalar(
                select(func.count(MaterialAssertion.id)).where(
                    MaterialAssertion.measurement_run_id == record.id
                )
            )
            or 0,
            evidence_present=(
                record.quality_flag == "valid"
                and record.id in self._evidence_record_ids([record.id])
            ),
        )

    def _evidence_record_ids(self, record_ids: list[UUID]) -> set[UUID]:
        evidence_ids, _raw_ids = collect_measurement_evidence(self.db, record_ids)
        return evidence_ids

    @staticmethod
    def _summary_from_values(
        *,
        record: CharacterizationRecord,
        sample: Sample,
        run: ExperimentRun,
        raw_file_count: int,
        analysis_count: int,
        property_count: int,
        assertion_count: int,
        evidence_present: bool,
    ) -> MeasurementSummaryRead:
        if record.run_revision_id is None or record.measured_at is None:
            raise RuntimeError("invalid measurement row")
        return MeasurementSummaryRead(
            id=record.id,
            run_revision_id=record.run_revision_id,
            run_code=run.run_code,
            sample_id=sample.id,
            sample_code=sample.sample_code,
            method_profile=record.method_instrument or "",
            instrument_snapshot_json=record.instrument_snapshot_json,
            performed_by_id=record.performed_by_id,
            measured_at=record.measured_at,
            sample_region=record.sample_region or {},
            typed_conditions=record.typed_conditions,
            quality_flag=record.quality_flag,
            quality_note=(record.attrs or {}).get("quality_note"),
            evidence_present=evidence_present,
            raw_file_count=raw_file_count,
            analysis_count=analysis_count,
            property_count=property_count,
            assertion_count=assertion_count,
        )

    def _refresh_sample_actual_state(self, sample: Sample, run_revision_id: UUID) -> None:
        assertions = list(
            self.db.scalars(
                select(MaterialAssertion)
                .join(
                    CharacterizationRecord,
                    CharacterizationRecord.id == MaterialAssertion.measurement_run_id,
                )
                .where(
                    MaterialAssertion.sample_id == sample.id,
                    MaterialAssertion.sample_id == CharacterizationRecord.sample_id,
                    MaterialAssertion.validity == "active",
                    CharacterizationRecord.run_revision_id == run_revision_id,
                    CharacterizationRecord.quality_flag == "valid",
                )
            )
        )
        phases: list[str] = []
        growth_states: set[str] = set()
        identity_values: dict[str, set[str]] = {}
        for item in assertions:
            value = item.value_json
            if item.assertion_type == "growth_presence" and value.get("state"):
                growth_states.add(str(value["state"]))
            if item.assertion_type != "growth_presence":
                identity_values.setdefault(item.assertion_type, set()).add(
                    json.dumps(value, ensure_ascii=False, sort_keys=True)
                )
            if item.assertion_type != "phase_identity":
                continue
            if value.get("phase"):
                phases.append(str(value["phase"]))
        state = self.db.scalar(
            select(SampleRevisionState).where(
                SampleRevisionState.sample_id == sample.id,
                SampleRevisionState.run_revision_id == run_revision_id,
            )
        )
        if state is None:
            state = SampleRevisionState(
                sample_id=sample.id,
                run_revision_id=run_revision_id,
                evidence_assertion_ids=[],
            )
            self.db.add(state)
        if growth_states == {"absent"}:
            state.growth_state = "absent"
            actual_state = "no_growth"
        elif growth_states == {"present"}:
            state.growth_state = "present"
            actual_state = "growth_present"
        elif growth_states:
            state.growth_state = "uncertain"
            actual_state = "uncertain"
        else:
            state.growth_state = "unknown"
            actual_state = "unknown"
        state.identity_state = (
            "conflicting"
            if any(len(values) > 1 for values in identity_values.values())
            else "asserted"
            if identity_values
            else "unknown"
        )
        state.material_summary = " + ".join(dict.fromkeys(phases)) or None
        state.evidence_assertion_ids = [str(item.id) for item in assertions]
        run = self.db.get(ExperimentRun, sample.experiment_run_id)
        if run is not None and run.current_revision_id == run_revision_id:
            sample.actual_state = actual_state
            sample.identity_state = state.identity_state
            sample.actual_material_summary = state.material_summary

    @staticmethod
    def _cursor_query_sha256(
        *,
        actor_id: UUID,
        limit: int,
        run_id: UUID | None,
        sample_id: UUID | None,
        method_profile: str | None,
        include_history: bool,
    ) -> str:
        payload = {
            "actor_id": str(actor_id),
            "limit": limit,
            "run_id": str(run_id) if run_id else None,
            "sample_id": str(sample_id) if sample_id else None,
            "method_profile": method_profile,
            "include_history": include_history,
        }
        return hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()

    @staticmethod
    def _encode_cursor(
        measured_at: datetime,
        measurement_id: UUID,
        query_sha256: str,
    ) -> str:
        if measured_at.utcoffset() is None:
            measured_at = measured_at.replace(tzinfo=UTC)
        raw = f"{query_sha256}|{measured_at.isoformat()}|{measurement_id}".encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    @staticmethod
    def _decode_cursor(cursor: str, expected_query_sha256: str) -> tuple[datetime, UUID]:
        try:
            padded = cursor + ("=" * (-len(cursor) % 4))
            raw = base64.urlsafe_b64decode(padded).decode()
            query_sha256, measured_at, measurement_id = raw.split("|", 2)
            parsed_at = datetime.fromisoformat(measured_at)
            if query_sha256 != expected_query_sha256 or parsed_at.utcoffset() is None:
                raise ValueError
            return parsed_at, UUID(measurement_id)
        except (binascii.Error, ValueError, UnicodeDecodeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid or mismatched measurement cursor",
            ) from exc
