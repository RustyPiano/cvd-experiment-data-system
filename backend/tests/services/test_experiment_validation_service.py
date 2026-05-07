from datetime import date
from types import SimpleNamespace

from app.models.experiment import ExperimentRun, QualityLabel
from app.models.module_payload import (
    ExperimentModuleKey,
    ExperimentModulePayload,
    normalize_module_payload,
)
from app.schemas.module_payload import validate_module_payload
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

    assert result.completion_score == 14


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


def test_furnace_program_schema_accepts_canonical_placements_and_legacy_precursors() -> None:
    canonical = validate_module_payload(
        ExperimentModuleKey.FURNACE_PROGRAM.value,
        {
            "furnace_info": {"zones_count": 2},
            "placements": [
                {
                    "precursor_index": 0,
                    "zone_key": "zone_1",
                    "position_cm": -15,
                    "note": "upstream",
                }
            ],
            "zones": [
                {
                    "zone_key": "zone_1",
                    "temperature_program": [
                        {"node_index": 1, "time_min": 0, "temperature_C": 25, "note": ""},
                        {"node_index": 2, "time_min": 30, "temperature_C": 750, "note": ""},
                    ],
                    "note": "upstream",
                }
            ],
        },
    )

    assert canonical["placements"] == [
        {
            "precursor_index": 0,
            "zone_key": "zone_1",
            "position_cm": -15.0,
            "note": "upstream",
        }
    ]
    assert canonical["zones"][0]["temperature_program"][1]["temperature_C"] == 750.0

    legacy = validate_module_payload(
        ExperimentModuleKey.FURNACE_PROGRAM.value,
        {
            "furnace_info": {"zones_count": 2},
            "precursors": [
                {"material": "MoO3", "position_cm": -15, "mass_mg": 15, "note": "legacy"}
            ],
            "steps": [],
        },
    )

    assert legacy["precursors"] == [
        {"material": "MoO3", "position_cm": -15.0, "mass_mg": 15.0, "note": "legacy"}
    ]


def test_furnace_program_normalizes_legacy_steps_to_zone_temperature_programs() -> None:
    normalized = normalize_module_payload(
        ExperimentModuleKey.FURNACE_PROGRAM.value,
        {
            "furnace_info": {
                "zones_count": 2,
                "initial_temperatures_C": {"zone_1": 25, "zone_2": 25},
            },
            "steps": [
                {
                    "step_index": 1,
                    "step_name": "升温",
                    "duration_min": 30,
                    "is_hold": False,
                    "temperatures_C": {"zone_1": 650, "zone_2": 780},
                    "note": "legacy ramp",
                },
                {
                    "step_index": 2,
                    "step_name": "保温",
                    "duration_min": 15,
                    "is_hold": True,
                    "temperatures_C": {"zone_1": 650, "zone_2": 780},
                    "note": "legacy hold",
                },
            ],
        },
    )

    assert normalized["zones"] == [
        {
            "zone_key": "zone_1",
            "temperature_program": [
                {"node_index": 1, "time_min": 0.0, "temperature_C": 25, "note": ""},
                {"node_index": 2, "time_min": 30.0, "temperature_C": 650, "note": "legacy ramp"},
                {"node_index": 3, "time_min": 45.0, "temperature_C": 650, "note": "legacy hold"},
            ],
            "note": "",
        },
        {
            "zone_key": "zone_2",
            "temperature_program": [
                {"node_index": 1, "time_min": 0.0, "temperature_C": 25, "note": ""},
                {"node_index": 2, "time_min": 30.0, "temperature_C": 780, "note": "legacy ramp"},
                {"node_index": 3, "time_min": 45.0, "temperature_C": 780, "note": "legacy hold"},
            ],
            "note": "",
        },
    ]
    assert "steps" not in normalized


def test_furnace_program_normalize_preserves_missing_zone_key_for_validation() -> None:
    normalized = normalize_module_payload(
        ExperimentModuleKey.FURNACE_PROGRAM.value,
        {
            "furnace_info": {"zones_count": 1},
            "zones": [
                {
                    "temperature_program": [
                        {"node_index": 1, "time_min": 0, "temperature_C": 25},
                        {"node_index": 2, "time_min": 30, "temperature_C": 750},
                    ]
                }
            ],
        },
    )

    assert "zone_key" not in normalized["zones"][0]
