from datetime import date
from types import SimpleNamespace

from app.models.experiment import ExperimentRun, QualityLabel
from app.models.module_payload import ExperimentModuleKey, ExperimentModulePayload
from app.services.experiment_validation_service import ExperimentValidationService


def test_validate_experiment_reports_file_missing_experiment_id(
    active_user,
    db_session,
    monkeypatch,
) -> None:
    experiment = ExperimentRun(
        run_code="CVD-2026-0001",
        owner_id=active_user.id,
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date=date(2026, 4, 23),
        objective="Validation defense branch",
        quality_label=QualityLabel.UNKNOWN,
    )
    db_session.add(experiment)
    db_session.commit()
    db_session.refresh(experiment)

    service = ExperimentValidationService(db_session)
    monkeypatch.setattr(
        service.files,
        "list_by_experiment",
        lambda _experiment_id: [
            SimpleNamespace(
                experiment_run_id=None,
                method="OM",
                sample_id=None,
            )
        ],
    )

    result = service.validate_experiment(experiment)

    assert any(
        issue.module_key == "files"
        and issue.field_path == "items[0].experiment_id"
        and "必填" in issue.message
        for issue in result.errors
    )


def test_completion_score_does_not_award_points_for_not_null_owner_id(
    active_user,
    db_session,
) -> None:
    experiment = ExperimentRun(
        run_code="CVD-2026-0002",
        owner_id=active_user.id,
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date=date(2026, 4, 23),
        objective="Completion score",
        quality_label=QualityLabel.UNKNOWN,
    )
    db_session.add(experiment)
    db_session.commit()
    db_session.refresh(experiment)

    result = ExperimentValidationService(db_session).validate_experiment(experiment)

    assert result.completion_score == 13


def test_schema_validation_reports_string_type_in_chinese(
    active_user,
    db_session,
) -> None:
    experiment = ExperimentRun(
        run_code="CVD-2026-0003",
        owner_id=active_user.id,
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date=date(2026, 4, 23),
        objective="Schema localization",
        quality_label=QualityLabel.UNKNOWN,
    )
    db_session.add(experiment)
    db_session.flush()
    db_session.add(
        ExperimentModulePayload(
            experiment_run_id=experiment.id,
            module_key=ExperimentModuleKey.CHARACTERIZATION.value,
            payload_json={"methods": [{"method": 123}]},
        )
    )
    db_session.commit()
    db_session.refresh(experiment)

    result = ExperimentValidationService(db_session).validate_experiment(experiment)

    assert any(
        issue.module_key == ExperimentModuleKey.CHARACTERIZATION.value
        and issue.field_path == "methods[0].method"
        and issue.message == "必须是文本"
        for issue in result.errors
    )
