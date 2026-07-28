from datetime import date

from app.commands.check_r0 import build_r0_reports
from app.models.experiment import ExperimentRun
from app.models.module_payload import ExperimentModulePayload
from app.models.sample import Sample, SampleRole
from app.models.v2_results import MeasuredProduct
from app.services.v2_field_source import experiment_fields, load_field_source


def _add_payload(db_session, run_id, module_key: str, payload: dict) -> None:
    db_session.add(
        ExperimentModulePayload(
            experiment_run_id=run_id,
            module_key=module_key,
            schema_version="cvd_v2",
            payload_json=payload,
        )
    )


def test_check_r0_reports_conditional_required_fields_and_rejects_pvd_as_noncompliant(
    db_session,
    active_user,
) -> None:
    run = ExperimentRun(
        run_code="RUN-R0-CVD",
        owner_id=active_user.id,
        schema_version="cvd_v2",
        experiment_date=date(2026, 7, 8),
    )
    pvd = ExperimentRun(
        run_code="RUN-R0-PVD",
        owner_id=active_user.id,
        schema_version="cvd_v2",
        experiment_date=date(2026, 7, 8),
    )
    db_session.add_all([run, pvd])
    db_session.flush()
    _add_payload(
        db_session,
        run.id,
        "basic_info",
        {
            "started_at": "2026-07-08T09:30:00",
            "synthesis_method": "CVD",
            "operator": "李俊杰",
            "run_code": "RUN-R0-CVD",
        },
    )
    _add_payload(db_session, run.id, "target_product", {"chemical_formula": "MoS2"})
    _add_payload(db_session, run.id, "equipment", {"setup_ref": "setup-1"})
    _add_payload(
        db_session,
        run.id,
        "precursors",
        {"items": [{"name_formula": "MoO3", "phase_state": "solid"}]},
    )
    _add_payload(db_session, run.id, "substrates", {"items": [{"material": "sio2_si"}]})
    _add_payload(
        db_session,
        run.id,
        "process_steps",
        {"items": [{"stage_type": "reaction_conditions"}]},
    )
    sample = Sample(
        sample_code="R0-S1",
        experiment_run_id=run.id,
        role=SampleRole.GROWTH,
    )
    db_session.add(sample)
    db_session.flush()
    db_session.add(MeasuredProduct(sample_id=sample.id, observed_phenomena=["不连续覆盖"]))
    _add_payload(
        db_session,
        pvd.id,
        "basic_info",
        {"synthesis_method": "PVD-磁控溅射", "run_code": "RUN-R0-PVD"},
    )
    db_session.commit()

    reports = build_r0_reports(db_session)

    cvd_report = next(report for report in reports if report["run_code"] == "RUN-R0-CVD")
    assert cvd_report["status"] == "non_compliant"
    missing_keys = {
        item["key"] for item in cvd_report["items"] if item["applicable"] and not item["passed"]
    }
    assert {
        "structure_type",
        "amount",
        "pressure_system",
        "zone_count",
        "orientation",
    }.issubset(missing_keys)
    assert "components" not in missing_keys

    pvd_report = next(report for report in reports if report["run_code"] == "RUN-R0-PVD")
    assert pvd_report["status"] == "non_compliant"


def test_structure_discriminator_and_conditional_components_are_part_of_r0() -> None:
    fields = experiment_fields(load_field_source())
    r0_fields = [field for field in fields if field.get("r0")]
    r0_by_key = {field["key"]: field for field in r0_fields}

    assert len(r0_fields) == 29
    assert r0_by_key["structure_type"]["requirement"]["level"] == "required"
    assert r0_by_key["components"]["requirement"]["level"] == "conditional_required"
