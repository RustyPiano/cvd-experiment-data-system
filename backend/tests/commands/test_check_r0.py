from datetime import date

from app.commands.check_r0 import build_r0_reports
from app.models.experiment import ExperimentRun
from app.models.module_payload import ExperimentModulePayload
from app.models.sample import Sample, SampleRole
from app.models.v2_results import MeasuredProduct


def _add_payload(db_session, run_id, module_key: str, payload: dict) -> None:
    db_session.add(
        ExperimentModulePayload(
            experiment_run_id=run_id,
            module_key=module_key,
            schema_version="cvd_v2",
            payload_json=payload,
        )
    )


def test_check_r0_reports_conditional_required_fields_and_excludes_pvd(
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
            "synthesis_method": "APCVD",
            "operator": "李俊杰",
            "run_code": "RUN-R0-CVD",
        },
    )
    _add_payload(
        db_session,
        run.id,
        "target_product",
        {"chemical_formula": "MoS2", "structure_type": "本征"},
    )
    _add_payload(db_session, run.id, "equipment", {"setup_ref": "setup-1"})
    _add_payload(
        db_session,
        run.id,
        "precursors",
        {"items": [{"name_formula": "MoO3", "phase_state": "固"}]},
    )
    _add_payload(db_session, run.id, "substrates", {"items": [{"material": "SiO2/Si"}]})
    _add_payload(
        db_session,
        run.id,
        "process_steps",
        {
            "items": [
                {
                    "stage_type": "反应生长",
                    "temperature_program": "25->750",
                    "gas_species": "Ar",
                    "gas_flow_sccm": 80,
                }
            ]
        },
    )
    sample = Sample(
        sample_code="R0-S1",
        experiment_run_id=run.id,
        role=SampleRole.PRODUCT,
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
    assert {"amount", "pressure_system", "zone_count", "orientation"}.issubset(missing_keys)

    pvd_report = next(report for report in reports if report["run_code"] == "RUN-R0-PVD")
    assert pvd_report["status"] == "excluded_pvd"
