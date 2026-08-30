from __future__ import annotations

from datetime import UTC, date, datetime

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.file_asset import FileAsset
from app.models.sample import Sample, SampleRole
from app.models.scientific import PropertyValue, RunRevision
from app.models.v2_results import CharacterizationRecord, MeasuredProduct
from app.services.v2_result_evidence import collect_measurement_evidence
from app.services.v2_result_status_service import refresh_result_missing_todo


def _run(db_session, active_user, *, status: ExperimentStatus) -> ExperimentRun:
    run = ExperimentRun(
        run_code=f"RUN-{status.value.upper()}",
        owner_id=active_user.id,
        schema_version="cvd_v2",
        experiment_date=date(2026, 7, 8),
        status=status,
    )
    db_session.add(run)
    db_session.flush()
    if status in {ExperimentStatus.LOCKED, ExperimentStatus.REVIEWED}:
        revision = RunRevision(
            experiment_run_id=run.id,
            revision_number=1,
            schema_version="cvd_v2",
            schema_status="INTERNAL_VALIDATION",
            status=status.value,
            content_json={},
            content_sha256="0" * 64,
            locked_by_id=active_user.id,
        )
        db_session.add(revision)
        db_session.flush()
        run.current_revision_id = revision.id
        db_session.flush()
    return run


def _sample(db_session, run: ExperimentRun) -> Sample:
    sample = Sample(
        sample_code=f"S-{run.run_code}",
        experiment_run_id=run.id,
        run_revision_id=run.current_revision_id,
        role=SampleRole.GROWTH,
    )
    db_session.add(sample)
    db_session.flush()
    return sample


def test_locked_run_without_phenomena_or_characterization_is_marked_missing(
    db_session,
    active_user,
) -> None:
    run = _run(db_session, active_user, status=ExperimentStatus.LOCKED)

    assert refresh_result_missing_todo(db_session, run) is True
    assert run.result_missing_todo is True


def test_non_terminal_run_is_not_marked_missing(db_session, active_user) -> None:
    run = _run(db_session, active_user, status=ExperimentStatus.DRAFT)

    assert refresh_result_missing_todo(db_session, run) is False
    assert run.result_missing_todo is False


def test_empty_characterization_row_does_not_clear_missing_flag(db_session, active_user) -> None:
    run = _run(db_session, active_user, status=ExperimentStatus.LOCKED)
    sample = _sample(db_session, run)
    db_session.add(CharacterizationRecord(experiment_run_id=run.id, sample_id=sample.id))
    db_session.commit()

    assert refresh_result_missing_todo(db_session, run) is True
    assert run.result_missing_todo is True


def test_any_measured_result_row_clears_missing_flag(db_session, active_user) -> None:
    run = _run(db_session, active_user, status=ExperimentStatus.LOCKED)
    sample = _sample(db_session, run)
    record = CharacterizationRecord(
        experiment_run_id=run.id,
        run_revision_id=run.current_revision_id,
        sample_id=sample.id,
        method_instrument="optical_microscopy",
        performed_by_id=active_user.id,
        measured_at=datetime(2026, 8, 30, 12, tzinfo=UTC),
        sample_region={"geometry_type": "whole_sample", "label": "whole"},
        quality_flag="valid",
    )
    db_session.add(record)
    db_session.flush()
    db_session.add(
        MeasuredProduct(
            sample_id=sample.id,
            characterization_record_id=record.id,
            measured_layers_coverage="1层；70%",
        )
    )
    db_session.commit()

    assert refresh_result_missing_todo(db_session, run) is False
    assert run.result_missing_todo is False


def test_empty_legacy_measured_result_does_not_clear_missing_flag(
    db_session,
    active_user,
) -> None:
    run = _run(db_session, active_user, status=ExperimentStatus.LOCKED)
    sample = _sample(db_session, run)
    db_session.add(MeasuredProduct(sample_id=sample.id))
    db_session.commit()

    assert refresh_result_missing_todo(db_session, run) is True
    assert run.result_missing_todo is True


def test_empty_json_values_do_not_clear_missing_flag(db_session, active_user) -> None:
    run = _run(db_session, active_user, status=ExperimentStatus.LOCKED)
    sample = _sample(db_session, run)
    db_session.add(
        MeasuredProduct(
            sample_id=sample.id,
            observed_phenomena=[],
            key_spectral_metrics=[],
            attrs={"note": None},
        )
    )
    db_session.commit()

    assert refresh_result_missing_todo(db_session, run) is True
    assert run.result_missing_todo is True


def test_other_phenomenon_needs_detail_to_clear_missing_flag(
    db_session,
    active_user,
) -> None:
    run = _run(db_session, active_user, status=ExperimentStatus.LOCKED)
    sample = _sample(db_session, run)
    product = MeasuredProduct(
        sample_id=sample.id,
        observed_phenomena=["other"],
        attrs={},
    )
    record = CharacterizationRecord(
        experiment_run_id=run.id,
        run_revision_id=run.current_revision_id,
        sample_id=sample.id,
        method_instrument="optical_microscopy",
        performed_by_id=active_user.id,
        measured_at=datetime(2026, 8, 30, 12, tzinfo=UTC),
        sample_region={"geometry_type": "whole_sample", "label": "whole"},
        quality_flag="valid",
    )
    db_session.add(record)
    db_session.flush()
    product.characterization_record_id = record.id
    db_session.add(product)
    db_session.commit()

    assert refresh_result_missing_todo(db_session, run) is True

    product.attrs = {"observed_phenomena_other": "triangular domains"}
    db_session.commit()
    assert refresh_result_missing_todo(db_session, run) is False


def test_only_current_valid_bound_active_evidence_clears_missing(
    db_session,
    active_user,
) -> None:
    run = _run(db_session, active_user, status=ExperimentStatus.LOCKED)
    sample = _sample(db_session, run)
    unbound = FileAsset(
        experiment_run_id=run.id,
        sample_id=sample.id,
        uploaded_by_id=active_user.id,
        original_name="orphan.csv",
        storage_path="tests/orphan.csv",
        content_type="text/csv",
        size_bytes=1,
        sha256="a" * 64,
        method="Raman",
        file_category="raw",
        asset_role="characterization_file",
    )
    db_session.add(unbound)
    db_session.commit()
    assert refresh_result_missing_todo(db_session, run) is True

    record = CharacterizationRecord(
        experiment_run_id=run.id,
        run_revision_id=run.current_revision_id,
        sample_id=sample.id,
        method_instrument="optical_microscopy",
        performed_by_id=active_user.id,
        measured_at=datetime(2026, 8, 30, 12, tzinfo=UTC),
        sample_region={"geometry_type": "whole_sample", "label": "whole"},
        quality_flag="suspect",
    )
    db_session.add(record)
    db_session.flush()
    value = PropertyValue(
        sample_id=sample.id,
        measurement_run_id=record.id,
        property_code="coverage_percent",
        numeric_value=10,
        unit="%",
        quality_flag="valid",
    )
    db_session.add(value)
    db_session.commit()
    assert refresh_result_missing_todo(db_session, run) is True

    record.quality_flag = "valid"
    value.quality_flag = "suspect"
    unbound.characterization_record_id = record.id
    db_session.commit()
    assert refresh_result_missing_todo(db_session, run) is True

    unbound.method = "optical_microscopy"
    unbound.file_category = "processed"
    db_session.commit()
    assert refresh_result_missing_todo(db_session, run) is True

    unbound.file_category = "raw"
    db_session.commit()
    assert refresh_result_missing_todo(db_session, run) is False

    unbound.deleted_at = datetime.now(UTC)
    value.quality_flag = "below_detection_limit"
    db_session.commit()
    evidence_ids, raw_ids = collect_measurement_evidence(db_session, [record.id])
    assert record.id in evidence_ids
    assert record.id not in raw_ids
    assert refresh_result_missing_todo(db_session, run) is False

    stale_revision = RunRevision(
        experiment_run_id=run.id,
        revision_number=2,
        supersedes_revision_id=run.current_revision_id,
        schema_version="cvd_v2",
        schema_status="INTERNAL_VALIDATION",
        status="superseded",
        content_json={},
        content_sha256="3" * 64,
        locked_by_id=active_user.id,
    )
    db_session.add(stale_revision)
    db_session.flush()
    sample.run_revision_id = stale_revision.id
    db_session.commit()
    assert refresh_result_missing_todo(db_session, run) is True

    sample.run_revision_id = run.current_revision_id
    sample.lifecycle_state = "consumed"
    db_session.commit()
    assert refresh_result_missing_todo(db_session, run) is False


def test_historical_measurement_does_not_clear_current_revision_missing(
    db_session,
    active_user,
) -> None:
    run = _run(db_session, active_user, status=ExperimentStatus.LOCKED)
    sample = _sample(db_session, run)
    old_revision = RunRevision(
        experiment_run_id=run.id,
        revision_number=2,
        supersedes_revision_id=run.current_revision_id,
        schema_version="cvd_v2",
        schema_status="INTERNAL_VALIDATION",
        status="superseded",
        content_json={},
        content_sha256="2" * 64,
        locked_by_id=active_user.id,
    )
    db_session.add(old_revision)
    db_session.flush()
    record = CharacterizationRecord(
        experiment_run_id=run.id,
        run_revision_id=old_revision.id,
        sample_id=sample.id,
        method_instrument="optical_microscopy",
        performed_by_id=active_user.id,
        measured_at=datetime(2026, 8, 30, 12, tzinfo=UTC),
        sample_region={"geometry_type": "whole_sample", "label": "whole"},
        quality_flag="valid",
    )
    db_session.add(record)
    db_session.flush()
    db_session.add(
        PropertyValue(
            sample_id=sample.id,
            measurement_run_id=record.id,
            property_code="coverage_percent",
            numeric_value=10,
            unit="%",
            quality_flag="valid",
        )
    )
    db_session.commit()

    assert refresh_result_missing_todo(db_session, run) is True
