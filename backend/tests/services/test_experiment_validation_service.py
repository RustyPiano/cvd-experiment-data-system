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


def test_furnace_program_schema_accepts_canonical_placements() -> None:
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


def test_furnace_program_schema_rejects_legacy_steps_and_precursors() -> None:
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError, match="extra_forbidden"):
        validate_module_payload(
            ExperimentModuleKey.FURNACE_PROGRAM.value,
            {
                "furnace_info": {"zones_count": 2},
                "steps": [],
            },
        )

    with pytest.raises(ValidationError, match="extra_forbidden"):
        validate_module_payload(
            ExperimentModuleKey.FURNACE_PROGRAM.value,
            {
                "furnace_info": {"zones_count": 2},
                "precursors": [],
            },
        )


def test_furnace_program_schema_rejects_explicit_null_canonical_containers() -> None:
    import pytest
    from pydantic import ValidationError

    for payload in [
        {"furnace_info": None, "placements": [], "zones": []},
        {"furnace_info": {"zones_count": 1}, "placements": None, "zones": []},
        {"furnace_info": {"zones_count": 1}, "placements": [], "zones": None},
        {
            "furnace_info": {"zones_count": 1},
            "placements": [],
            "zones": [{"zone_key": "zone_1", "temperature_program": None}],
        },
    ]:
        with pytest.raises(ValidationError):
            validate_module_payload(ExperimentModuleKey.FURNACE_PROGRAM.value, payload)


def test_furnace_program_schema_rejects_zone_index() -> None:
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError, match="extra_forbidden"):
        validate_module_payload(
            ExperimentModuleKey.FURNACE_PROGRAM.value,
            {
                "furnace_info": {"zones_count": 1},
                "placements": [],
                "zones": [
                    {
                        "zone_key": "zone_1",
                        "zone_index": 1,
                        "temperature_program": [],
                    }
                ],
            },
        )


def test_furnace_program_normalizes_canonical_zones() -> None:
    normalized = normalize_module_payload(
        ExperimentModuleKey.FURNACE_PROGRAM.value,
        {
            "furnace_info": {
                "zones_count": 2,
                "initial_temperatures_C": {"zone_1": 25, "zone_2": 25},
            },
            "zones": [
                {
                    "zone_key": "zone_1",
                    "temperature_program": [
                        {"node_index": 1, "time_min": 0, "temperature_C": 25},
                        {"node_index": 2, "time_min": 30, "temperature_C": 650, "note": "ramp"},
                    ],
                },
                {
                    "zone_key": "zone_2",
                    "temperature_program": [
                        {"node_index": 1, "time_min": 0, "temperature_C": 25},
                        {"node_index": 2, "time_min": 30, "temperature_C": 780, "note": "ramp"},
                    ],
                },
            ],
        },
    )

    assert len(normalized["zones"]) == 2
    assert normalized["zones"][0]["zone_key"] == "zone_1"
    assert normalized["zones"][0]["temperature_program"][1]["temperature_C"] == 650
    assert normalized["zones"][0]["note"] == ""
    assert normalized["zones"][1]["zone_key"] == "zone_2"
    assert normalized["zones"][1]["temperature_program"][1]["temperature_C"] == 780


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


def test_furnace_program_wrong_type_zones_passes_through_to_pydantic() -> None:
    """Wrong-type containers must NOT be silently coerced to [] — they must reach
    Pydantic so the API can return 422 instead of accepting invalid data."""
    import pytest
    from pydantic import ValidationError

    # zones with a string value should raise, not normalize to []
    with pytest.raises(ValidationError):
        validate_module_payload(
            ExperimentModuleKey.FURNACE_PROGRAM.value,
            {
                "furnace_info": {"zones_count": 1},
                "placements": [],
                "zones": "bad",
            },
        )

    # temperature_program with a string value should raise, not normalize to []
    with pytest.raises(ValidationError):
        validate_module_payload(
            ExperimentModuleKey.FURNACE_PROGRAM.value,
            {
                "furnace_info": {"zones_count": 1},
                "placements": [],
                "zones": [
                    {
                        "zone_key": "zone_1",
                        "temperature_program": "bad",
                    }
                ],
            },
        )


def test_furnace_program_missing_optional_containers_get_defaults() -> None:
    """Missing optional fields (zones, placements) are defaulted to [] by the
    normalize layer — ensuring downstream validate receives well-formed containers."""
    normalized = normalize_module_payload(
        ExperimentModuleKey.FURNACE_PROGRAM.value,
        {
            "furnace_info": {"zones_count": 1},
            # placements and zones omitted — normalize should supply []
        },
    )
    assert normalized["placements"] == []
    assert normalized["zones"] == []
