from __future__ import annotations

from datetime import date

from sqlalchemy import inspect, select

from app.commands.migrate_v1_to_v2 import (
    build_migration_reports,
    build_reconciliation_reports,
    main,
    migrate_runs,
    render_json_report,
    render_text_report,
)
from app.models.experiment import ExperimentRun
from app.models.module_payload import ExperimentModulePayload, ExperimentModulePayloadV1Archive


def _add_payload(db_session, run_id, module_key: str, payload: dict) -> None:
    db_session.add(
        ExperimentModulePayload(
            experiment_run_id=run_id,
            module_key=module_key,
            schema_version="cvd_v1",
            payload_json=payload,
        )
    )


def test_archive_table_exists_after_migrations(db_session) -> None:
    columns = {
        column["name"]
        for column in inspect(db_session.bind).get_columns("experiment_module_payloads_v1_archive")
    }
    assert {
        "id",
        "source_payload_id",
        "experiment_run_id",
        "module_key",
        "schema_version",
        "payload_json",
        "archived_at",
    }.issubset(columns)


def test_dry_run_reports_mapping_counts_without_writing(db_session, active_user) -> None:
    run = ExperimentRun(
        run_code="RUN-MAP-DRY",
        owner_id=active_user.id,
        experiment_type="CVD",
        experiment_date=date(2026, 7, 8),
    )
    db_session.add(run)
    db_session.flush()
    _add_payload(
        db_session,
        run.id,
        "basic_info",
        {"operator_id": "李俊杰", "experiment_date": "2026-07-08"},
    )
    db_session.commit()

    reports = build_migration_reports(db_session)

    assert reports[0]["run_code"] == "RUN-MAP-DRY"
    assert reports[0]["counts"]["unmapped"] == 0
    assert reports[0]["counts"]["pending_confirmation"] >= 3
    assert reports[0]["counts"]["manual"] >= 1
    assert reports[0]["blocker"] is False
    assert "RUN-MAP-DRY" in render_text_report(reports)
    assert '"run_code": "RUN-MAP-DRY"' in render_json_report(reports)
    assert db_session.scalars(select(ExperimentModulePayloadV1Archive)).all() == []


def test_execute_requires_both_flags() -> None:
    assert main(["--execute"]) == 2
    assert main(["--i-have-backup"]) == 2


def test_execute_archives_before_overwriting_same_module_keys(db_session, active_user) -> None:
    run = ExperimentRun(
        run_code="RUN-MAP-EXEC",
        owner_id=active_user.id,
        experiment_type="CVD",
        experiment_date=date(2026, 7, 8),
    )
    db_session.add(run)
    db_session.flush()
    _add_payload(
        db_session,
        run.id,
        "basic_info",
        {
            "operator_id": "李俊杰",
            "experiment_type": "APCVD",
            "material_system": "MoS2",
            "experiment_date": "2026-07-08",
            "layer_count": "1",
        },
    )
    _add_payload(
        db_session,
        run.id,
        "precursors",
        {"items": [{"species": "MoO3", "method": "powder", "mass_mg": 12.5}]},
    )
    db_session.commit()

    reports = migrate_runs(db_session, run_code="RUN-MAP-EXEC", execute=True)

    assert reports[0]["run_code"] == "RUN-MAP-EXEC"
    db_session.refresh(run)
    assert run.schema_version == "cvd_v2"

    archived = db_session.scalars(
        select(ExperimentModulePayloadV1Archive).where(
            ExperimentModulePayloadV1Archive.experiment_run_id == run.id
        )
    ).all()
    assert {row.module_key for row in archived} == {"basic_info", "precursors"}
    assert (
        next(row for row in archived if row.module_key == "basic_info").payload_json["operator_id"]
        == "李俊杰"
    )

    basic_info = db_session.scalar(
        select(ExperimentModulePayload).where(
            ExperimentModulePayload.experiment_run_id == run.id,
            ExperimentModulePayload.module_key == "basic_info",
        )
    )
    assert basic_info is not None
    assert basic_info.schema_version == "cvd_v2"
    assert basic_info.payload_json["operator"] == "李俊杰"

    target_product = db_session.scalar(
        select(ExperimentModulePayload).where(
            ExperimentModulePayload.experiment_run_id == run.id,
            ExperimentModulePayload.module_key == "target_product",
        )
    )
    assert target_product is not None
    assert target_product.payload_json["chemical_formula"] == "MoS2"


def test_reconciliation_compares_copy_mapped_fields(db_session, active_user) -> None:
    run = ExperimentRun(
        run_code="RUN-MAP-RECON",
        owner_id=active_user.id,
        experiment_type="CVD",
        experiment_date=date(2026, 7, 8),
    )
    db_session.add(run)
    db_session.flush()
    _add_payload(
        db_session,
        run.id,
        "basic_info",
        {"operator_id": "李俊杰", "experiment_type": "APCVD", "material_system": "MoS2"},
    )
    db_session.commit()
    migrate_runs(db_session, run_code="RUN-MAP-RECON", execute=True)

    reports = build_reconciliation_reports(db_session, run_code="RUN-MAP-RECON")

    assert reports[0]["run_code"] == "RUN-MAP-RECON"
    assert reports[0]["differences"] == []
    compared = {item["source_path"] for item in reports[0]["matched"]}
    assert {
        "basic_info.operator_id",
        "basic_info.experiment_type",
        "basic_info.material_system",
    }.issubset(compared)
