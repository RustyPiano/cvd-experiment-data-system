from __future__ import annotations

import base64
import json
from datetime import datetime
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
    SampleRevisionState,
)
from app.models.user import User, UserRole
from app.models.v2_entities import InstrumentCapability, InstrumentLifecycleEvent
from app.models.v2_results import CharacterizationRecord
from app.repositories.experiment_repository import ExperimentRepository
from app.schemas.scientific import (
    MeasurementBundleCreate,
    MeasurementListResponse,
    MeasurementSummaryRead,
)
from app.services.audit_service import AuditService
from app.services.experiment_guards import (
    ensure_results_editable,
    get_locked_visible_experiment,
)
from app.services.file_asset_service import refresh_revision_provenance
from app.services.v2_entity_service import V2EntityService
from app.services.v2_entity_snapshot_service import instrument_version_snapshot
from app.services.v2_field_source import SCHEMA_VERSION, normalize_offset_datetime
from app.services.v2_result_status_service import refresh_result_missing_todo


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
        sample = self.db.get(Sample, payload.measurement.sample_id)
        if sample is None or sample.deleted_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
        run = get_locked_visible_experiment(
            self.experiments,
            sample.experiment_run_id,
            actor,
            schema_version=SCHEMA_VERSION,
        )
        ensure_results_editable(run)
        if run.status not in {ExperimentStatus.LOCKED, ExperimentStatus.REVIEWED}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Measurements require a locked run revision",
            )
        run_revision_id = run.current_revision_id or sample.run_revision_id
        if run_revision_id is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Sample is not bound to an immutable run revision",
            )

        measurement = payload.measurement
        instrument_snapshot = self._instrument_snapshot(
            measurement.instrument_id,
            measurement.instrument_version,
            measurement.method_profile,
            measurement.measured_at,
        )
        raw_files = self._active_files(
            measurement.raw_file_ids,
            run.id,
            sample.id,
        )
        if any(file.characterization_record_id is not None for file in raw_files):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Raw data files are already linked to a measurement",
            )
        if any(
            file.asset_role != "characterization_file" or file.method != measurement.method_profile
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
            attrs={},
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
            inputs = self._active_files(item.input_file_ids, run.id, sample.id)
            outputs = self._active_files(item.output_file_ids, run.id, sample.id)
            for direction, files in (("input", inputs), ("output", outputs)):
                for file in files:
                    self.db.add(
                        DataDerivationEdge(
                            analysis_run_id=analysis.id,
                            file_asset_id=file.id,
                            direction=direction,
                        )
                    )

        for item in payload.properties:
            self.db.add(
                PropertyValue(
                    sample_id=sample.id,
                    measurement_run_id=record.id,
                    analysis_run_id=(
                        analyses[item.analysis_index].id
                        if item.analysis_index is not None
                        else None
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
            )

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
    ) -> MeasurementListResponse:
        raw_count = (
            select(func.count(FileAsset.id))
            .where(
                FileAsset.characterization_record_id == CharacterizationRecord.id,
                FileAsset.deleted_at.is_(None),
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
        if run_id is not None:
            run = get_locked_visible_experiment(
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
        if cursor:
            measured_at, measurement_id = self._decode_cursor(cursor)
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
        items = [
            self._summary_from_values(
                record=row.CharacterizationRecord,
                sample=row.Sample,
                run=row.ExperimentRun,
                raw_file_count=row.raw_file_count,
                analysis_count=row.analysis_count,
                property_count=row.property_count,
                assertion_count=row.assertion_count,
            )
            for row in rows
        ]
        next_cursor = (
            self._encode_cursor(
                rows[-1].CharacterizationRecord.measured_at,
                rows[-1].CharacterizationRecord.id,
            )
            if has_more and rows
            else None
        )
        return MeasurementListResponse(
            items=items,
            total=len(items),
            next_cursor=next_cursor,
        )

    def _instrument_snapshot(
        self,
        instrument_id: UUID | None,
        version_number: int | None,
        method_profile: str,
        measured_at: datetime,
    ) -> dict | None:
        if instrument_id is None or version_number is None:
            if method_profile != "optical_microscopy":
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
                .with_for_update()
            )
        )
        if {file.id for file in files} != set(file_ids):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="A referenced data file is missing or belongs to another sample",
            )
        return files

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
        )

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
                    MaterialAssertion.validity == "active",
                    CharacterizationRecord.run_revision_id == run_revision_id,
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
            sample.actual_state = "no_growth"
        elif growth_states == {"present"}:
            state.growth_state = "present"
            sample.actual_state = "growth_present"
        elif growth_states:
            state.growth_state = "uncertain"
            sample.actual_state = "uncertain"
        else:
            state.growth_state = "unknown"
            sample.actual_state = "unknown"
        state.identity_state = (
            "conflicting"
            if any(len(values) > 1 for values in identity_values.values())
            else "asserted"
            if identity_values
            else "unknown"
        )
        state.material_summary = " + ".join(dict.fromkeys(phases)) or None
        state.evidence_assertion_ids = [str(item.id) for item in assertions]
        sample.identity_state = state.identity_state
        sample.actual_material_summary = state.material_summary

    @staticmethod
    def _encode_cursor(measured_at: datetime, measurement_id: UUID) -> str:
        raw = f"{measured_at.isoformat()}|{measurement_id}".encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    @staticmethod
    def _decode_cursor(cursor: str) -> tuple[datetime, UUID]:
        try:
            padded = cursor + ("=" * (-len(cursor) % 4))
            raw = base64.urlsafe_b64decode(padded).decode()
            measured_at, measurement_id = raw.rsplit("|", 1)
            return datetime.fromisoformat(measured_at), UUID(measurement_id)
        except (ValueError, UnicodeDecodeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid measurement cursor",
            ) from exc
