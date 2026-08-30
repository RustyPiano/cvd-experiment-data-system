from datetime import UTC, date, datetime
from io import BytesIO
from uuid import uuid4

import pytest
from fastapi import HTTPException, UploadFile
from sqlalchemy import select

from app.models.audit import AuditEvent
from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.file_asset import FileAsset
from app.models.sample import Sample
from app.models.scientific import (
    AnalysisRun,
    DataDerivationEdge,
    MaterialAssertion,
    PropertyValue,
    RunFeature,
    RunRevision,
    TransformationInput,
    TransformationOutput,
    TransformationRun,
)
from app.models.v2_entities import Instrument, InstrumentVersion
from app.models.v2_results import CharacterizationRecord
from app.schemas.scientific import LifecycleEventCreate, TransformationRunCreate
from app.services.entity_file_service import EntityFileService
from app.services.file_asset_service import FileAssetService, refresh_revision_provenance
from app.services.reference_data_service import ReferenceDataService
from app.services.sample_service import SampleService, ensure_sample_revision_association
from app.services.scientific_measurement_service import ScientificMeasurementService
from app.services.scientific_sample_service import ScientificSampleService
from app.services.v2_reporting_service import V2ReportingService


def _scientific_context(db_session, active_user, run_code: str):
    run = ExperimentRun(
        run_code=run_code,
        owner_id=active_user.id,
        schema_version="cvd_v2",
        material_system="MoS2",
        experiment_date=date(2026, 8, 30),
        status=ExperimentStatus.LOCKED,
    )
    db_session.add(run)
    db_session.flush()
    modules = {
        "basic_info": {"operator": active_user.name},
        "target_product": {},
        "precursors": {"items": []},
        "substrates": {"items": []},
        "process_steps": {"items": []},
        "process_events": {"items": []},
    }
    revision = RunRevision(
        experiment_run_id=run.id,
        revision_number=1,
        schema_version="v4.0-alpha.19",
        schema_status="internal_validation",
        status="locked",
        content_json={
            "run": {
                "id": str(run.id),
                "run_code": run.run_code,
                "experiment_date": run.experiment_date.isoformat(),
                "objective": None,
                "setup_ref": None,
                "setup_ref_version": None,
                "setup_ref_snapshot": None,
            },
            "modules": modules,
        },
        content_sha256="1" * 64,
        locked_by_id=active_user.id,
        locked_at=datetime(2026, 8, 30, 10, tzinfo=UTC),
    )
    db_session.add(revision)
    db_session.flush()
    run.current_revision_id = revision.id
    sample = Sample(
        sample_code=f"{run_code}-S01",
        experiment_run_id=run.id,
        run_revision_id=revision.id,
        role="growth",
        metadata_json={},
    )
    db_session.add(sample)
    db_session.flush()
    return run, revision, sample


def _measurement(run, revision, sample, active_user, method: str, conditions: dict):
    record = CharacterizationRecord(
        experiment_run_id=run.id,
        run_revision_id=revision.id,
        sample_id=sample.id,
        method_instrument=method,
        performed_by_id=active_user.id,
        measured_at=datetime(2026, 8, 30, 11, tzinfo=UTC),
        sample_region={"geometry_type": "whole_sample"},
        typed_conditions=conditions,
        quality_flag="valid",
        attrs={},
    )
    return record


def _bind_instrument(db_session, record, code: str) -> None:
    instrument = Instrument()
    db_session.add(instrument)
    db_session.flush()
    db_session.add(
        InstrumentVersion(
            entity_id=instrument.id,
            version=1,
            instrument_code=code,
            name_type=record.method_instrument,
            attrs={},
        )
    )
    record.instrument_id = instrument.id
    record.instrument_version = 1
    record.instrument_snapshot_json = {
        "instrument_id": str(instrument.id),
        "instrument_version": 1,
        "instrument_code_snapshot": code,
        "name_type_snapshot": record.method_instrument,
        "attrs_snapshot": {},
        "capabilities": [record.method_instrument],
        "calibration_at_measurement": {"validity_status": "not_recorded"},
    }


def _file(
    run,
    sample,
    active_user,
    name: str,
    sha: str,
    *,
    record=None,
    deleted=False,
    method="Raman",
):
    return FileAsset(
        experiment_run_id=run.id,
        sample_id=sample.id,
        characterization_record_id=record.id if record else None,
        uploaded_by_id=active_user.id,
        original_name=name,
        storage_path=f"traceability/{run.id}/{name}",
        content_type="text/csv",
        size_bytes=12,
        sha256=sha * 64,
        method=method,
        file_category="raw" if record else "processed",
        asset_role="characterization_file",
        file_kind=method,
        metadata_json={"stage": "baseline"},
        deleted_at=(datetime(2026, 8, 30, 13, tzinfo=UTC) if deleted else None),
    )


def test_provenance_uses_current_valid_profile_evidence(db_session, active_user) -> None:
    run, revision, sample = _scientific_context(db_session, active_user, "CVD-2026-0910")
    feature = RunFeature(
        run_revision_id=revision.id,
        feature_code="provenance_complete",
        ordinal=0,
        boolean_value=False,
        source_path="$.scientific_record.measurements",
    )
    optical = _measurement(run, revision, sample, active_user, "optical_microscopy", {})
    db_session.add_all([feature, optical])
    db_session.flush()
    assertion = MaterialAssertion(
        sample_id=sample.id,
        measurement_run_id=optical.id,
        assertion_type="growth_presence",
        value_json={"state": "absent"},
        validity="active",
    )
    db_session.add(assertion)
    db_session.flush()

    refresh_revision_provenance(db_session, revision.id)
    assert feature.boolean_value is True

    assertion.validity = "disputed"
    below_detection_limit = PropertyValue(
        sample_id=sample.id,
        measurement_run_id=optical.id,
        property_code="coverage_percent",
        numeric_value=0,
        unit="%",
        quality_flag="below_detection_limit",
    )
    db_session.add(below_detection_limit)
    db_session.flush()
    refresh_revision_provenance(db_session, revision.id)
    assert feature.boolean_value is True

    raman = _measurement(
        run,
        revision,
        sample,
        active_user,
        "Raman",
        {"laser_wavelength_nm": 532},
    )
    db_session.add(raman)
    db_session.flush()
    db_session.add(
        PropertyValue(
            sample_id=sample.id,
            measurement_run_id=raman.id,
            property_code="raman_e2g_peak_position",
            numeric_value=384,
            unit="cm^-1",
            quality_flag="valid",
        )
    )
    db_session.flush()
    refresh_revision_provenance(db_session, revision.id)
    assert feature.boolean_value is False

    raw = _file(run, sample, active_user, "raman.csv", "a", record=raman)
    db_session.add(raw)
    db_session.flush()
    refresh_revision_provenance(db_session, revision.id)
    assert feature.boolean_value is False

    _bind_instrument(db_session, raman, "RAMAN-TRACE-1")
    db_session.flush()
    snapshot = dict(raman.instrument_snapshot_json)
    raman.instrument_snapshot_json = {
        key: value for key, value in snapshot.items() if key != "calibration_at_measurement"
    }
    db_session.flush()
    refresh_revision_provenance(db_session, revision.id)
    assert feature.boolean_value is False

    raman.instrument_snapshot_json = snapshot
    db_session.flush()
    refresh_revision_provenance(db_session, revision.id)
    assert feature.boolean_value is True

    raman.quality_flag = "suspect"
    db_session.flush()
    refresh_revision_provenance(db_session, revision.id)
    assert feature.boolean_value is True

    below_detection_limit.quality_flag = "suspect"
    db_session.flush()
    refresh_revision_provenance(db_session, revision.id)
    assert feature.boolean_value is False

    below_detection_limit.quality_flag = "below_detection_limit"
    optical.quality_flag = "invalid"
    db_session.flush()
    refresh_revision_provenance(db_session, revision.id)
    assert feature.boolean_value is False

    optical.quality_flag = "valid"
    run.current_revision_id = None
    db_session.flush()
    refresh_revision_provenance(db_session, revision.id)
    assert feature.boolean_value is False

    run.current_revision_id = revision.id
    optical.quality_flag = "invalid"
    other = _measurement(
        run,
        revision,
        sample,
        active_user,
        "other",
        {"method_description": "custom spectroscopy"},
    )
    db_session.add(other)
    db_session.flush()
    db_session.add(
        _file(
            run,
            sample,
            active_user,
            "other.dat",
            "d",
            record=other,
            method="other",
        )
    )
    db_session.flush()
    refresh_revision_provenance(db_session, revision.id)
    assert feature.boolean_value is True

    _bind_instrument(db_session, other, "OTHER-TRACE-1")
    optional_snapshot = dict(other.instrument_snapshot_json)
    other.instrument_snapshot_json = {
        key: value
        for key, value in optional_snapshot.items()
        if key != "calibration_at_measurement"
    }
    db_session.flush()
    refresh_revision_provenance(db_session, revision.id)
    assert feature.boolean_value is False

    other.instrument_snapshot_json = optional_snapshot
    db_session.flush()
    refresh_revision_provenance(db_session, revision.id)
    assert feature.boolean_value is True


def test_provenance_rejects_stale_growth_but_allows_active_control(
    db_session,
    active_user,
) -> None:
    run, revision, _sample = _scientific_context(db_session, active_user, "CVD-2026-0912")
    feature = RunFeature(
        run_revision_id=revision.id,
        feature_code="provenance_complete",
        ordinal=0,
        boolean_value=False,
        source_path="$.scientific_record.measurements",
    )
    stale_growth = Sample(
        sample_code="CVD-2026-0912-STALE",
        experiment_run_id=run.id,
        run_revision_id=None,
        role="growth",
        metadata_json={},
    )
    control = Sample(
        sample_code="CVD-2026-0912-CONTROL",
        experiment_run_id=run.id,
        run_revision_id=None,
        role="control",
        metadata_json={},
    )
    db_session.add_all([feature, stale_growth, control])
    db_session.flush()
    stale_record = _measurement(run, revision, stale_growth, active_user, "optical_microscopy", {})
    db_session.add(stale_record)
    db_session.flush()
    db_session.add(
        MaterialAssertion(
            sample_id=stale_growth.id,
            measurement_run_id=stale_record.id,
            assertion_type="growth_presence",
            value_json={"state": "absent"},
            validity="active",
        )
    )
    db_session.flush()
    refresh_revision_provenance(db_session, revision.id)
    assert feature.boolean_value is False

    control_record = _measurement(run, revision, control, active_user, "optical_microscopy", {})
    db_session.add(control_record)
    db_session.flush()
    db_session.add(
        MaterialAssertion(
            sample_id=control.id,
            measurement_run_id=control_record.id,
            assertion_type="growth_presence",
            value_json={"state": "absent"},
            validity="active",
        )
    )
    db_session.flush()
    refresh_revision_provenance(db_session, revision.id)
    assert feature.boolean_value is True

    control.lifecycle_state = "consumed"
    db_session.flush()
    refresh_revision_provenance(db_session, revision.id)
    assert feature.boolean_value is True

    control.lifecycle_state = "active"
    control.deleted_at = datetime(2026, 8, 30, 14, tzinfo=UTC)
    db_session.flush()
    refresh_revision_provenance(db_session, revision.id)
    assert feature.boolean_value is False


def test_bound_measurement_files_require_current_active_evidence_and_refresh_status(
    db_session,
    active_user,
) -> None:
    run, revision, sample = _scientific_context(db_session, active_user, "CVD-2026-0913")
    run.result_missing_todo = True
    feature = RunFeature(
        run_revision_id=revision.id,
        feature_code="provenance_complete",
        ordinal=0,
        boolean_value=False,
        source_path="$.scientific_record.measurements",
    )
    record = _measurement(
        run,
        revision,
        sample,
        active_user,
        "Raman",
        {"laser_wavelength_nm": 532},
    )
    _bind_instrument(db_session, record, "RAMAN-UPLOAD-1")
    db_session.add_all([feature, record])
    db_session.flush()
    db_session.add(
        PropertyValue(
            sample_id=sample.id,
            measurement_run_id=record.id,
            property_code="raman_e2g_peak_position",
            numeric_value=384,
            unit="cm^-1",
            quality_flag="valid",
        )
    )
    db_session.commit()
    service = FileAssetService(db_session)
    measurements = ScientificMeasurementService(db_session)

    assert measurements.get_measurement(record.id, active_user).evidence_present is False

    def upload(*, method: str = "Raman", category: str = "raw"):
        return service.upload_file(
            experiment_id=run.id,
            upload=UploadFile(file=BytesIO(b"measurement raw"), filename="measurement.csv"),
            current_user=active_user,
            characterization_record_id=record.id,
            method=method,
            file_category=category,
        )

    def upload_staging():
        return service.upload_file(
            experiment_id=run.id,
            upload=UploadFile(file=BytesIO(b"staging raw"), filename="staging.csv"),
            current_user=active_user,
            sample_id=sample.id,
            method="Raman",
            file_category="raw",
        )

    with pytest.raises(HTTPException) as wrong_method:
        upload(method="SEM")
    assert wrong_method.value.status_code == 422
    with pytest.raises(HTTPException) as processed:
        upload(category="processed")
    assert processed.value.status_code == 422

    run.status = ExperimentStatus.DRAFT
    db_session.flush()
    with pytest.raises(HTTPException) as correction_draft:
        upload()
    assert correction_draft.value.status_code == 409
    run.status = ExperimentStatus.LOCKED
    sample.lifecycle_state = "consumed"
    db_session.flush()
    with pytest.raises(HTTPException) as consumed:
        upload()
    assert consumed.value.status_code == 409
    with pytest.raises(HTTPException) as consumed_staging:
        upload_staging()
    assert consumed_staging.value.status_code == 409
    sample.lifecycle_state = "active"
    sample.deleted_at = datetime(2026, 8, 30, 14, tzinfo=UTC)
    db_session.flush()
    with pytest.raises(HTTPException) as deleted:
        upload()
    assert deleted.value.status_code == 409
    sample.deleted_at = None
    sample.run_revision_id = None
    db_session.flush()
    with pytest.raises(HTTPException) as stale_growth:
        upload()
    assert stale_growth.value.status_code == 409
    with pytest.raises(HTTPException) as stale_staging:
        upload_staging()
    assert stale_staging.value.status_code == 409
    sample.run_revision_id = revision.id
    record.quality_flag = "invalid"
    db_session.flush()
    with pytest.raises(HTTPException) as invalid:
        upload()
    assert invalid.value.status_code == 409
    record.quality_flag = "valid"

    next_revision = RunRevision(
        experiment_run_id=run.id,
        revision_number=2,
        supersedes_revision_id=revision.id,
        schema_version="v4.0-alpha.19",
        schema_status="internal_validation",
        status="locked",
        content_json={},
        content_sha256="2" * 64,
        locked_by_id=active_user.id,
        locked_at=datetime(2026, 8, 30, 15, tzinfo=UTC),
    )
    db_session.add(next_revision)
    db_session.flush()
    run.current_revision_id = next_revision.id
    sample.run_revision_id = next_revision.id
    db_session.flush()
    with pytest.raises(HTTPException) as historical:
        upload()
    assert historical.value.status_code == 409
    run.current_revision_id = revision.id
    sample.run_revision_id = revision.id
    db_session.commit()

    saved = upload()
    db_session.refresh(run)
    db_session.refresh(feature)
    assert feature.boolean_value is True
    assert run.result_missing_todo is False
    assert measurements.get_measurement(record.id, active_user).evidence_present is True

    record.quality_flag = "invalid"
    db_session.commit()
    with pytest.raises(HTTPException) as invalid_delete:
        service.delete_file(saved.id, active_user)
    assert invalid_delete.value.status_code == 409
    assert db_session.get(FileAsset, saved.id).deleted_at is None
    record.quality_flag = "valid"
    db_session.commit()

    service.delete_file(saved.id, active_user)
    db_session.refresh(run)
    db_session.refresh(feature)
    assert feature.boolean_value is False
    assert run.result_missing_todo is True
    assert measurements.get_measurement(record.id, active_user).evidence_present is False

    run.not_characterized_by_id = active_user.id
    run.not_characterized_at = datetime(2026, 8, 30, 16, tzinfo=UTC)
    run.result_missing_todo = False
    db_session.commit()
    upload()
    db_session.refresh(run)
    assert run.not_characterized_by_id is None
    assert run.not_characterized_at is None
    assert run.result_missing_todo is False
    assert db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.entity_type == "experiment_run",
            AuditEvent.entity_id == run.id,
            AuditEvent.action == "clear_not_characterized",
        )
    )


def test_analysis_edge_files_are_in_formal_export_catalog(db_session, active_user) -> None:
    run, revision, sample = _scientific_context(db_session, active_user, "CVD-2026-0911")
    record = _measurement(
        run,
        revision,
        sample,
        active_user,
        "Raman",
        {"laser_wavelength_nm": 532},
    )
    record.quality_flag = "invalid"
    record.attrs = {
        "invalidation_reason": "wrong calibration",
        "invalidated_by_id": str(active_user.id),
        "invalidated_at": "2026-08-30T13:00:00+00:00",
        "retained_note": "append-only",
    }
    db_session.add(record)
    db_session.flush()
    analysis = AnalysisRun(
        measurement_run_id=record.id,
        performed_by_id=active_user.id,
        software_name="TraceFit",
        software_version="1.0",
        parameters_json={"baseline": "linear"},
        started_at=datetime(2026, 8, 30, 12, tzinfo=UTC),
    )
    db_session.add(analysis)
    db_session.flush()
    raw = _file(run, sample, active_user, "raw.csv", "a", record=record)
    analysis_input = _file(run, sample, active_user, "input.csv", "b")
    analysis_output = _file(
        run,
        sample,
        active_user,
        "output.csv",
        "c",
        deleted=True,
    )
    region_image = _file(run, sample, active_user, "region.png", "d")
    region_image.content_type = "image/png"
    db_session.add_all([raw, analysis_input, analysis_output, region_image])
    db_session.flush()
    record.sample_region = {
        "geometry_type": "selected_area",
        "label": "center",
        "coordinate_system": "sample_local",
        "image_file_id": str(region_image.id),
        "pixel_roi": {"x": 0, "y": 0, "width": 10, "height": 10},
    }
    db_session.add_all(
        [
            DataDerivationEdge(
                analysis_run_id=analysis.id,
                file_asset_id=analysis_input.id,
                direction="input",
                role="source",
            ),
            DataDerivationEdge(
                analysis_run_id=analysis.id,
                file_asset_id=analysis_output.id,
                direction="output",
                role="fit_result",
            ),
        ]
    )
    db_session.flush()

    reporting = V2ReportingService(db_session)
    bundle = reporting._run_bundle(run, revision)
    catalog = {item["id"]: item for item in bundle["scientific_record"]["files"]}
    edge_rows = bundle["scientific_record"]["measurements"][0]["analyses"][0]["file_derivations"]

    assert {row["file_asset_id"] for row in edge_rows} <= set(catalog)
    assert catalog[str(analysis_input.id)]["sha256"] == "b" * 64
    assert catalog[str(analysis_input.id)]["metadata"] == {"stage": "baseline"}
    assert catalog[str(analysis_output.id)]["sha256"] == "c" * 64
    assert catalog[str(analysis_output.id)]["download_url"] is None
    assert catalog[str(region_image.id)]["sha256"] == "d" * 64
    assert bundle["scientific_record"]["measurements"][0]["raw_file_ids"] == [str(raw.id)]
    exported_measurement = bundle["scientific_record"]["measurements"][0]
    assert exported_measurement["attrs"] == record.attrs
    assert exported_measurement["invalidation_reason"] == "wrong calibration"
    assert exported_measurement["invalidated_by_id"] == str(active_user.id)
    assert exported_measurement["invalidated_at"] == "2026-08-30T13:00:00+00:00"

    file_rows = reporting._csv_tables([run], {run.id: revision})["files.csv"][1]
    exported_sha = {row["file_id"]: row["sha256"] for row in file_rows}
    assert exported_sha[str(analysis_input.id)] == "b" * 64
    assert exported_sha[str(analysis_output.id)] == "c" * 64


def test_measurement_detail_keeps_analysis_and_region_file_tombstones(
    db_session,
    active_user,
) -> None:
    run, revision, sample = _scientific_context(db_session, active_user, "CVD-2026-0917")
    record = _measurement(
        run,
        revision,
        sample,
        active_user,
        "optical_microscopy",
        {},
    )
    db_session.add(record)
    db_session.flush()
    analysis = AnalysisRun(
        measurement_run_id=record.id,
        performed_by_id=active_user.id,
        software_name="ImageJ",
        software_version="1.0",
        parameters_json={},
        started_at=datetime(2026, 8, 30, 12, tzinfo=UTC),
    )
    analysis_input = _file(run, sample, active_user, "input.csv", "e", deleted=True)
    analysis_output = _file(run, sample, active_user, "output.csv", "f", deleted=True)
    region_image = _file(run, sample, active_user, "region.png", "9", deleted=True)
    region_image.content_type = "image/png"
    db_session.add_all([analysis, analysis_input, analysis_output, region_image])
    db_session.flush()
    db_session.add_all(
        [
            DataDerivationEdge(
                analysis_run_id=analysis.id,
                file_asset_id=analysis_input.id,
                direction="input",
            ),
            DataDerivationEdge(
                analysis_run_id=analysis.id,
                file_asset_id=analysis_output.id,
                direction="output",
            ),
        ]
    )
    record.sample_region = {
        "geometry_type": "selected_area",
        "label": "center",
        "coordinate_system": "image",
        "image_file_id": str(region_image.id),
        "pixel_roi": {"x": 0, "y": 0, "width": 10, "height": 10},
    }
    db_session.commit()

    detail = ScientificMeasurementService(db_session)._detail(record, active_user)

    assert detail.region_image_file is not None
    assert detail.region_image_file.deleted_at is not None
    assert detail.analyses[0].input_files[0].id == analysis_input.id
    assert detail.analyses[0].input_files[0].deleted_at is not None
    assert detail.analyses[0].output_files[0].id == analysis_output.id
    assert detail.analyses[0].output_files[0].deleted_at is not None


def test_analysis_and_region_files_follow_measurement_read_only_state(
    db_session,
    active_user,
) -> None:
    run, revision, sample = _scientific_context(db_session, active_user, "CVD-2026-0914")
    record = _measurement(
        run,
        revision,
        sample,
        active_user,
        "optical_microscopy",
        {},
    )
    db_session.add(record)
    db_session.flush()
    analysis = AnalysisRun(
        measurement_run_id=record.id,
        performed_by_id=active_user.id,
        software_name="ImageJ",
        software_version="1.0",
        parameters_json={},
        started_at=datetime(2026, 8, 30, 12, tzinfo=UTC),
    )
    analysis_file = _file(run, sample, active_user, "analysis.csv", "e")
    region_image = _file(run, sample, active_user, "region.png", "f")
    region_image.content_type = "image/png"
    db_session.add_all([analysis, analysis_file, region_image])
    db_session.flush()
    db_session.add(
        DataDerivationEdge(
            analysis_run_id=analysis.id,
            file_asset_id=analysis_file.id,
            direction="input",
        )
    )
    record.sample_region = {
        "geometry_type": "selected_area",
        "label": "center",
        "coordinate_system": "sample_local",
        "image_file_id": str(region_image.id),
        "pixel_roi": {"x": 0, "y": 0, "width": 10, "height": 10},
    }
    db_session.commit()
    service = FileAssetService(db_session)

    record.quality_flag = "invalid"
    db_session.commit()
    with pytest.raises(HTTPException) as invalid_analysis:
        service.delete_file(analysis_file.id, active_user)
    assert invalid_analysis.value.status_code == 409
    with pytest.raises(HTTPException) as invalid_region:
        service.delete_file(region_image.id, active_user)
    assert invalid_region.value.status_code == 409

    record.quality_flag = "valid"
    sample.lifecycle_state = "consumed"
    db_session.commit()
    with pytest.raises(HTTPException) as consumed_region:
        service.delete_file(region_image.id, active_user)
    assert consumed_region.value.status_code == 409

    sample.lifecycle_state = "active"
    db_session.commit()
    with pytest.raises(HTTPException) as active_analysis:
        service.delete_file(analysis_file.id, active_user)
    assert active_analysis.value.status_code == 409
    with pytest.raises(HTTPException) as active_region:
        service.delete_file(region_image.id, active_user)
    assert active_region.value.status_code == 409
    assert db_session.get(FileAsset, analysis_file.id).deleted_at is None
    assert db_session.get(FileAsset, region_image.id).deleted_at is None


def test_export_preserves_measured_control_and_derived_sample_metadata(
    db_session,
    active_user,
) -> None:
    run, revision, parent = _scientific_context(db_session, active_user, "CVD-2026-0915")
    control = Sample(
        sample_code="CVD-2026-0915-C01",
        experiment_run_id=run.id,
        role="control",
        control_subtype="blank_substrate",
        current_carrier="quartz boat A",
        sample_region={"label": "center"},
        dimensions_json={"width": 10, "height": 10, "unit": "mm"},
        metadata_json={"purpose": "background"},
    )
    derived = Sample(
        sample_code="CVD-2026-0915-D01",
        experiment_run_id=run.id,
        parent_sample_id=parent.id,
        role="derived",
        current_carrier="TEM grid",
        sample_region={"label": "flake 1"},
        dimensions_json={"diameter": 3, "unit": "mm"},
        metadata_json={"preparation": "transfer"},
    )
    db_session.add_all([control, derived])
    db_session.flush()
    ensure_sample_revision_association(db_session, control, revision.id)
    ensure_sample_revision_association(db_session, derived, revision.id)
    db_session.flush()
    control.metadata_json = {"purpose": "edited after revision binding"}
    derived.current_carrier = "holder changed later"
    transformation = TransformationRun(
        output_experiment_run_id=run.id,
        transformation_type="transfer",
        operator_id=active_user.id,
        occurred_at=datetime(2026, 8, 30, 10, 30, tzinfo=UTC),
        parameters_json={},
    )
    db_session.add(transformation)
    db_session.flush()
    db_session.add_all(
        [
            TransformationInput(
                transformation_run_id=transformation.id,
                sample_id=control.id,
                run_revision_id=None,
                provenance_json={"legacy": True},
            ),
            TransformationOutput(
                transformation_run_id=transformation.id,
                sample_id=derived.id,
                output_role="transferred_sample",
            ),
        ]
    )
    db_session.add_all(
        [
            _measurement(run, revision, control, active_user, "optical_microscopy", {}),
            _measurement(run, revision, derived, active_user, "optical_microscopy", {}),
        ]
    )
    db_session.flush()

    reporting = V2ReportingService(db_session)
    scientific = reporting._run_bundle(run, revision)["scientific_record"]
    samples = {item["sample_code"]: item for item in scientific["samples"]}
    assert {
        key: samples[control.sample_code][key]
        for key in (
            "id",
            "experiment_run_id",
            "run_revision_id",
            "control_subtype",
            "current_carrier",
            "sample_region",
            "dimensions",
            "metadata",
        )
    } == {
        "id": str(control.id),
        "experiment_run_id": str(run.id),
        "run_revision_id": None,
        "control_subtype": "blank_substrate",
        "current_carrier": "quartz boat A",
        "sample_region": {"label": "center"},
        "dimensions": {"width": 10, "height": 10, "unit": "mm"},
        "metadata": {"purpose": "background"},
    }
    assert samples[derived.sample_code]["parent_sample_id"] == str(parent.id)
    assert samples[derived.sample_code]["current_carrier"] == "TEM grid"
    assert samples[derived.sample_code]["live_state"]["current_carrier"] == ("holder changed later")
    assert samples[derived.sample_code]["sample_region"] == {"label": "flake 1"}
    assert samples[derived.sample_code]["dimensions"] == {"diameter": 3, "unit": "mm"}
    assert scientific["transformations"][0]["id"] == str(transformation.id)
    assert scientific["transformations"][0]["inputs"][0]["sample_id"] == str(control.id)
    assert scientific["transformations"][0]["outputs"][0]["sample_id"] == str(derived.id)

    rows = reporting._csv_tables([run], {run.id: revision})["samples.csv"][1]
    by_code = {row["sample_code"]: row for row in rows}
    assert by_code[control.sample_code]["sample_id"] == str(control.id)
    assert by_code[control.sample_code]["run_revision_id"] == ""
    assert by_code[control.sample_code]["control_subtype"] == "blank_substrate"
    assert by_code[derived.sample_code]["parent_sample_id"] == str(parent.id)
    assert {
        (row["nested_field"], row["nested_path"], row["nested_value"])
        for row in rows
        if row["sample_code"] == derived.sample_code
    } >= {
        ("sample_region", "label", "flake 1"),
        ("dimensions", "diameter", 3),
        ("sample_metadata", "preparation", "transfer"),
    }


def test_multi_input_lineage_prevents_source_cleanup_and_keeps_tombstones(
    db_session,
    active_user,
) -> None:
    run, first_revision, first = _scientific_context(
        db_session,
        active_user,
        "CVD-2026-0918",
    )
    first_source_id = uuid4()
    second_source_id = uuid4()
    first.source_substrate_id = first_source_id
    second = Sample(
        sample_code="CVD-2026-0918-S02",
        experiment_run_id=run.id,
        run_revision_id=first_revision.id,
        role="growth",
        source_substrate_id=second_source_id,
        metadata_json={},
    )
    db_session.add(second)
    db_session.commit()

    transformed = ScientificSampleService(db_session).create_transformation(
        TransformationRunCreate(
            transformation_type="stack",
            input_sample_ids=[first.id, second.id],
            outputs=[{"output_role": "stack"}],
            occurred_at="2026-08-30T12:00:00+08:00",
        ),
        active_user,
    )
    output_id = transformed.output_sample_ids[0]
    output = db_session.get(Sample, output_id)
    assert output is not None and output.parent_sample_id is None

    second_revision = RunRevision(
        experiment_run_id=run.id,
        revision_number=2,
        supersedes_revision_id=first_revision.id,
        schema_version="v4.0-alpha.19",
        schema_status="internal_validation",
        status="locked",
        content_json=first_revision.content_json,
        content_sha256="2" * 64,
        locked_by_id=active_user.id,
        locked_at=datetime(2026, 8, 31, 10, tzinfo=UTC),
    )
    db_session.add(second_revision)
    db_session.flush()
    run.current_revision_id = second_revision.id
    SampleService(db_session).sync_growth_samples(
        run,
        [{"source_id": str(second_source_id)}],
        active_user,
        second_revision.id,
    )
    db_session.commit()
    db_session.refresh(first)
    assert first.deleted_at is None

    first.deleted_at = datetime(2026, 8, 31, 11, tzinfo=UTC)
    first.deleted_by_id = active_user.id
    db_session.commit()
    lineage = ScientificSampleService(db_session).lineage(output_id, active_user)
    samples = {item.id: item for item in lineage.samples}
    assert set(transformed.input_sample_ids) <= set(samples)
    assert samples[first.id].deleted_at is not None
    assert {
        item.id
        for item in ScientificSampleService(db_session).lineage(first.id, active_user).samples
    } == set(samples)


def test_transformation_respects_producer_time_and_exports_input_order(
    db_session,
    active_user,
) -> None:
    run, revision, first = _scientific_context(
        db_session,
        active_user,
        "CVD-2026-0921",
    )
    second = Sample(
        sample_code="CVD-2026-0921-C01",
        experiment_run_id=run.id,
        run_revision_id=revision.id,
        role="control",
        metadata_json={},
    )
    db_session.add(second)
    db_session.commit()
    service = ScientificSampleService(db_session)
    producer = service.create_transformation(
        TransformationRunCreate(
            transformation_type="transfer",
            input_sample_ids=[first.id],
            outputs=[{"output_role": "transferred"}],
            occurred_at="2026-08-30T12:00:00+08:00",
        ),
        active_user,
    )
    produced_id = producer.output_sample_ids[0]

    with pytest.raises(HTTPException) as exc_info:
        service.create_transformation(
            TransformationRunCreate(
                transformation_type="stack",
                input_sample_ids=[second.id, produced_id],
                outputs=[{"output_role": "stacked"}],
                occurred_at="2026-08-30T11:59:59+08:00",
            ),
            active_user,
        )
    assert exc_info.value.status_code == 409

    stacked = service.create_transformation(
        TransformationRunCreate(
            transformation_type="stack",
            input_sample_ids=[second.id, produced_id],
            outputs=[{"output_role": "stacked"}],
            occurred_at="2026-08-30T12:00:00+08:00",
        ),
        active_user,
    )
    links = list(
        db_session.scalars(
            select(TransformationInput).where(
                TransformationInput.transformation_run_id == stacked.id
            )
        )
    )
    assert {
        link.sample_id: (link.input_role, link.provenance_json["input_ordinal"]) for link in links
    } == {
        second.id: ("input_1", 0),
        produced_id: ("input_2", 1),
    }

    scientific = V2ReportingService(db_session)._run_bundle(run, revision)["scientific_record"]
    exported = next(item for item in scientific["transformations"] if item["id"] == str(stacked.id))
    assert [(item["sample_id"], item["role"], item["ordinal"]) for item in exported["inputs"]] == [
        (str(second.id), "input_1", 0),
        (str(produced_id), "input_2", 1),
    ]


def test_cross_run_transformation_exports_frozen_external_sample_snapshots(
    db_session,
    active_user,
) -> None:
    first_run, first_revision, first_sample = _scientific_context(
        db_session,
        active_user,
        "CVD-2026-0919",
    )
    second_run, second_revision, second_sample = _scientific_context(
        db_session,
        active_user,
        "CVD-2026-0920",
    )
    db_session.commit()
    transformed = ScientificSampleService(db_session).create_transformation(
        TransformationRunCreate(
            transformation_type="stack",
            input_sample_ids=[first_sample.id, second_sample.id],
            output_experiment_run_id=second_run.id,
            outputs=[{"output_role": "stacked_sample"}],
            occurred_at="2026-08-30T12:00:00+08:00",
        ),
        active_user,
    )

    for run, revision in (
        (first_run, first_revision),
        (second_run, second_revision),
    ):
        scientific = V2ReportingService(db_session)._run_bundle(run, revision)["scientific_record"]
        transformation = scientific["transformations"][0]
        assert transformation["id"] == str(transformed.id)
        assert all(
            item["sample_code"]
            and item["experiment_run_id"]
            and item["run_revision_id"]
            and item["sample_snapshot"]
            for item in transformation["inputs"]
        )
        assert transformation["outputs"] == [
            {
                "sample_id": str(transformed.output_sample_ids[0]),
                "sample_code": transformation["outputs"][0]["sample_code"],
                "experiment_run_id": str(second_run.id),
                "run_revision_id": str(second_revision.id),
                "role": "stacked_sample",
                "sample_snapshot": transformation["outputs"][0]["sample_snapshot"],
            }
        ]
        assert transformation["outputs"][0]["sample_code"]
        assert transformation["outputs"][0]["sample_snapshot"]


def test_instrument_certificate_is_bound_once_and_scoped_to_instrument(
    db_session,
    admin_user,
) -> None:
    first = Instrument()
    second = Instrument()
    db_session.add_all([first, second])
    db_session.flush()
    db_session.add_all(
        [
            InstrumentVersion(
                entity_id=first.id,
                version=1,
                instrument_code="RAMAN-CERT-1",
                name_type="Raman",
                attrs={},
            ),
            InstrumentVersion(
                entity_id=second.id,
                version=1,
                instrument_code="RAMAN-CERT-2",
                name_type="Raman",
                attrs={},
            ),
        ]
    )
    db_session.commit()

    entity_files = EntityFileService(db_session)
    certificate = entity_files.upload(
        upload=UploadFile(file=BytesIO(b"calibration certificate"), filename="cert.pdf"),
        current_user=admin_user,
    )
    event = LifecycleEventCreate(
        event_type="calibration",
        occurred_at="2026-08-30T12:00:00+08:00",
        certificate_file_id=certificate.id,
    )
    ReferenceDataService(db_session).create_instrument_event(first.id, event, admin_user)
    bound = db_session.get(FileAsset, certificate.id)
    assert (bound.entity_type, bound.entity_id, bound.entity_version) == (
        "instrument",
        first.id,
        1,
    )
    bind_audits = (
        db_session.query(AuditEvent)
        .filter_by(
            entity_type="file_asset",
            entity_id=certificate.id,
            action="bind_instrument_certificate",
        )
        .all()
    )
    assert len(bind_audits) == 1
    assert bind_audits[0].before_json["entity_id"] is None
    assert bind_audits[0].after_json["entity_id"] == str(first.id)
    calibration_audit = (
        db_session.query(AuditEvent)
        .filter_by(entity_type="instrument", entity_id=first.id, action="calibration")
        .one()
    )
    assert calibration_audit.after_json["certificate_file_id"] == str(certificate.id)
    same_instrument_event = ReferenceDataService(db_session).create_instrument_event(
        first.id,
        event.model_copy(update={"event_type": "maintenance"}),
        admin_user,
    )
    assert same_instrument_event.certificate_file_id == certificate.id
    assert (
        db_session.query(AuditEvent)
        .filter_by(
            entity_type="file_asset",
            entity_id=certificate.id,
            action="bind_instrument_certificate",
        )
        .count()
        == 1
    )
    with pytest.raises(HTTPException) as wrong_instrument:
        ReferenceDataService(db_session).create_instrument_event(second.id, event, admin_user)
    assert wrong_instrument.value.status_code == 422
    with pytest.raises(HTTPException) as immutable:
        entity_files.delete(certificate.id, admin_user)
    assert immutable.value.status_code == 409

    deleted = entity_files.upload(
        upload=UploadFile(file=BytesIO(b"deleted"), filename="deleted.pdf"),
        current_user=admin_user,
    )
    entity_files.delete(deleted.id, admin_user)
    with pytest.raises(HTTPException) as unavailable:
        ReferenceDataService(db_session).create_instrument_event(
            first.id,
            event.model_copy(update={"certificate_file_id": deleted.id}),
            admin_user,
        )
    assert unavailable.value.status_code == 422
