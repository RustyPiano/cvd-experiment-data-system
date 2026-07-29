from datetime import UTC, date, datetime

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.sample import Sample
from app.models.scientific import RunRevision, SampleRevisionAssociation
from app.models.v2_results import CharacterizationRecord, MeasuredProduct
from app.services.v2_reporting_service import (
    LEGACY_BACKFILL_REASON,
    V2ReportingService,
)


def test_legacy_measured_products_export_only_with_their_backfilled_revision(
    db_session,
    active_user,
) -> None:
    run = ExperimentRun(
        run_code="CVD-2026-0099",
        owner_id=active_user.id,
        schema_version="cvd_v2",
        material_system="MoS2",
        experiment_date=date(2026, 7, 28),
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

    def revision_content() -> dict:
        return {
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
        }

    first = RunRevision(
        experiment_run_id=run.id,
        revision_number=1,
        schema_version="v4.0-alpha.2",
        schema_status="internal_validation",
        status="superseded",
        content_json=revision_content(),
        content_sha256="1" * 64,
        correction_reason=LEGACY_BACKFILL_REASON,
        locked_by_id=active_user.id,
        locked_at=datetime(2026, 7, 28, 12, tzinfo=UTC),
    )
    db_session.add(first)
    db_session.flush()
    second = RunRevision(
        experiment_run_id=run.id,
        revision_number=2,
        supersedes_revision_id=first.id,
        schema_version="v4.0-alpha.2",
        schema_status="internal_validation",
        status="locked",
        content_json=revision_content(),
        content_sha256="2" * 64,
        correction_reason="correct target",
        locked_by_id=active_user.id,
        locked_at=datetime(2026, 7, 29, 12, tzinfo=UTC),
    )
    db_session.add(second)
    db_session.flush()
    run.current_revision_id = second.id

    sample = Sample(
        sample_code="CVD-2026-0099-S01",
        experiment_run_id=run.id,
        run_revision_id=second.id,
        role="growth",
        metadata_json={},
    )
    db_session.add(sample)
    db_session.flush()
    db_session.add_all(
        [
            SampleRevisionAssociation(
                sample_id=sample.id,
                run_revision_id=first.id,
                sample_snapshot_json={"sample_code": sample.sample_code},
            ),
            SampleRevisionAssociation(
                sample_id=sample.id,
                run_revision_id=second.id,
                sample_snapshot_json={"sample_code": sample.sample_code},
            ),
        ]
    )

    legacy_record = CharacterizationRecord(
        experiment_run_id=run.id,
        run_revision_id=first.id,
        sample_id=sample.id,
        method_instrument="optical_microscopy",
        performed_by_id=active_user.id,
        measured_at=datetime(2026, 7, 28, 13, tzinfo=UTC),
        sample_region={"geometry_type": "whole_sample"},
        typed_conditions={},
        attrs={},
    )
    current_record = CharacterizationRecord(
        experiment_run_id=run.id,
        run_revision_id=second.id,
        sample_id=sample.id,
        method_instrument="optical_microscopy",
        performed_by_id=active_user.id,
        measured_at=datetime(2026, 7, 29, 13, tzinfo=UTC),
        sample_region={"geometry_type": "whole_sample"},
        typed_conditions={},
        attrs={},
    )
    db_session.add_all([legacy_record, current_record])
    db_session.flush()
    db_session.add_all(
        [
            MeasuredProduct(
                sample_id=sample.id,
                characterization_record_id=legacy_record.id,
                layer_count=3,
                measured_layers_coverage="3层；历史",
                attrs={},
            ),
            MeasuredProduct(
                sample_id=sample.id,
                characterization_record_id=None,
                coverage_percent=42,
                measured_layers_coverage="直接观察；42%",
                attrs={},
            ),
        ]
    )
    db_session.flush()

    reporting = V2ReportingService(db_session)
    first_rows = reporting._csv_tables([run], {run.id: first})["characterization_results.csv"][1]
    second_rows = reporting._csv_tables([run], {run.id: second})["characterization_results.csv"][1]
    first_bundle = reporting._run_bundle(run, first)
    second_bundle = reporting._run_bundle(run, second)

    assert {row["result_code"] for row in first_rows} == {
        f"{sample.sample_code}-R01",
        f"{sample.sample_code}-R02",
    }
    assert {row["measured_layers_coverage"] for row in first_rows} == {
        "3层；历史",
        "直接观察；42%",
    }
    assert {row["sample_code"] for row in second_rows} == {sample.sample_code}
    assert {row["measured_layers_coverage"] for row in second_rows} == {""}
    assert {
        row["measured_layers_coverage"]
        for row in first_bundle["scientific_record"]["legacy_measured_products"]
    } == {"3层；历史", "直接观察；42%"}
    assert second_bundle["scientific_record"]["legacy_measured_products"] == []
