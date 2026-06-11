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

    assert result.completion_score == 11


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


def test_solution_precursor_without_mass_does_not_warn(
    active_user,
    db_session,
) -> None:
    experiment = ExperimentRun(
        run_code="CVD-2026-0004",
        owner_id=active_user.id,
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date=date(2026, 4, 23),
        objective="Solution precursor validation",
        quality_label=QualityLabel.UNKNOWN,
    )
    db_session.add(experiment)
    db_session.flush()
    db_session.add(
        ExperimentModulePayload(
            experiment_run_id=experiment.id,
            module_key=ExperimentModuleKey.PRECURSORS.value,
            payload_json={
                "items": [
                    {
                        "species": "MoO3",
                        "method": "solution",
                        "batch_no": "MO-2026-01",
                        "concentration": 0.5,
                        "spin_speed_rpm": 3000,
                        "spin_time_s": 30,
                    }
                ]
            },
        )
    )
    db_session.commit()
    db_session.refresh(experiment)

    result = ExperimentValidationService(db_session).validate_experiment(experiment)

    assert not any(
        issue.module_key == ExperimentModuleKey.PRECURSORS.value
        and issue.field_path == "items[0].mass_mg"
        for issue in result.warnings
    )


def test_solution_precursor_completion_score_does_not_require_mass(
    active_user,
    db_session,
) -> None:
    experiment_without_mass = ExperimentRun(
        run_code="CVD-2026-0005",
        owner_id=active_user.id,
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date=date(2026, 4, 23),
        objective="Solution precursor completion",
        quality_label=QualityLabel.UNKNOWN,
    )
    experiment_with_mass = ExperimentRun(
        run_code="CVD-2026-0006",
        owner_id=active_user.id,
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date=date(2026, 4, 23),
        objective="Solution precursor completion control",
        quality_label=QualityLabel.UNKNOWN,
    )
    db_session.add_all([experiment_without_mass, experiment_with_mass])
    db_session.flush()
    precursor_payload = {
        "items": [
            {
                "species": "MoO3",
                "method": "solution",
                "batch_no": "MO-2026-01",
                "concentration": 0.5,
                "spin_speed_rpm": 3000,
                "spin_time_s": 30,
            }
        ]
    }
    db_session.add_all(
        [
            ExperimentModulePayload(
                experiment_run_id=experiment_without_mass.id,
                module_key=ExperimentModuleKey.PRECURSORS.value,
                payload_json=precursor_payload,
            ),
            ExperimentModulePayload(
                experiment_run_id=experiment_with_mass.id,
                module_key=ExperimentModuleKey.PRECURSORS.value,
                payload_json={
                    "items": [
                        {
                            **precursor_payload["items"][0],
                            "mass_mg": 12.5,
                        }
                    ]
                },
            ),
        ]
    )
    db_session.commit()
    db_session.refresh(experiment_without_mass)
    db_session.refresh(experiment_with_mass)

    service = ExperimentValidationService(db_session)
    result_without_mass = service.validate_experiment(experiment_without_mass)
    result_with_mass = service.validate_experiment(experiment_with_mass)

    assert result_without_mass.completion_score == result_with_mass.completion_score


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


def test_setup_methods_missing_blocks_validation(active_user, db_session) -> None:
    experiment = ExperimentRun(
        run_code="CVD-2026-SETUP-MISSING",
        owner_id=active_user.id,
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date=date(2026, 6, 5),
        objective="setup validation",
        quality_label=QualityLabel.SUCCESS,
    )
    db_session.add(experiment)
    db_session.commit()
    db_session.refresh(experiment)

    result = ExperimentValidationService(db_session).validate_experiment(experiment)

    assert any(
        issue.module_key == "setup_methods"
        and issue.field_path == "root"
        and issue.message
        for issue in result.errors
    )


def test_setup_methods_missing_group_key_blocks_validation(active_user, db_session) -> None:
    from datetime import UTC, datetime

    from app.models.setup_methods import ExperimentSetupSnapshot

    experiment = ExperimentRun(
        run_code="CVD-2026-SETUP-NOKEY",
        owner_id=active_user.id,
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date=date(2026, 6, 5),
        objective="setup key validation",
        quality_label=QualityLabel.SUCCESS,
    )
    db_session.add(experiment)
    db_session.commit()
    db_session.refresh(experiment)
    snapshot = ExperimentSetupSnapshot(
        experiment_run_id=experiment.id,
        setup_key_snapshot=None,
        setup_name_snapshot="Manual setup",
        setup_version_snapshot=1,
        apparatus_description_snapshot="Tube furnace",
        methods_text_snapshot="Methods",
        sample_placement_description_snapshot="Placement",
        reaction_flow_description_snapshot="Flow",
        unpublished_reason_snapshot="Internal",
        is_same_as_source=False,
        confirmed_by_id=active_user.id,
        confirmed_at=datetime.now(UTC),
        snapshot_hash="a" * 64,
        metadata_json={"semantic_context": {}},
    )
    db_session.add(snapshot)
    db_session.commit()

    result = ExperimentValidationService(db_session).validate_experiment(experiment)

    assert any(
        issue.module_key == "setup_methods"
        and issue.field_path == "setup_key_snapshot"
        and issue.message
        for issue in result.errors
    )


def test_setup_methods_missing_apparatus_description_does_not_block_validation(
    active_user,
    db_session,
) -> None:
    # Apparatus prose is optional; setup key/name/methods are the blocking fields.
    from datetime import UTC, datetime

    from app.models.file_asset import FileAsset
    from app.models.setup_methods import ExperimentSetupSnapshot

    experiment = ExperimentRun(
        run_code="CVD-2026-SETUP-NO-APPARATUS",
        owner_id=active_user.id,
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date=date(2026, 6, 5),
        objective="setup apparatus validation",
        quality_label=QualityLabel.SUCCESS,
    )
    db_session.add(experiment)
    db_session.commit()
    db_session.refresh(experiment)

    diagram_file = FileAsset(
        experiment_run_id=experiment.id,
        sample_id=None,
        uploaded_by_id=active_user.id,
        original_name="setup.png",
        storage_path=f"tests/{experiment.id}/setup-apparatus.png",
        content_type="image/png",
        size_bytes=7,
        sha256="e" * 64,
        method="setup_diagram",
        file_category="raw",
        asset_role="setup_diagram",
        metadata_json={},
    )
    db_session.add(diagram_file)
    db_session.commit()
    db_session.refresh(diagram_file)

    snapshot = ExperimentSetupSnapshot(
        experiment_run_id=experiment.id,
        setup_key_snapshot="manual:abcdef1234567890",
        setup_name_snapshot="Manual setup",
        setup_version_snapshot=1,
        apparatus_description_snapshot="",
        methods_text_snapshot="Methods",
        sample_placement_description_snapshot="Placement",
        reaction_flow_description_snapshot="Flow",
        unpublished_reason_snapshot="Internal",
        diagram_file_asset_id=diagram_file.id,
        is_same_as_source=False,
        confirmed_by_id=active_user.id,
        confirmed_at=datetime.now(UTC),
        snapshot_hash="a" * 64,
        metadata_json={"semantic_context": {}},
    )
    db_session.add(snapshot)
    db_session.commit()

    result = ExperimentValidationService(db_session).validate_experiment(experiment)

    assert not any(
        issue.module_key == "setup_methods" and issue.field_path == "apparatus_description_snapshot"
        for issue in result.errors
    )


def test_setup_methods_missing_diagram_and_reference_are_warnings(
    active_user,
    db_session,
) -> None:
    # Diagram and reference are recommended (warnings), not submit-blocking errors.
    from app.models.setup_methods import ExperimentSetupSnapshot

    experiment = ExperimentRun(
        run_code="CVD-2026-SETUP-NO-DIAGRAM-REF",
        owner_id=active_user.id,
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date=date(2026, 6, 5),
        objective="setup recommended-fields validation",
        quality_label=QualityLabel.SUCCESS,
    )
    db_session.add(experiment)
    db_session.commit()
    db_session.refresh(experiment)

    snapshot = ExperimentSetupSnapshot(
        experiment_run_id=experiment.id,
        setup_key_snapshot="manual:abcdef1234567890",
        setup_name_snapshot="Manual setup",
        setup_version_snapshot=1,
        apparatus_description_snapshot="Tube furnace",
        methods_text_snapshot="Methods",
        sample_placement_description_snapshot="Placement",
        reaction_flow_description_snapshot="Flow",
        reference_paper_url_snapshot=None,
        unpublished_reason_snapshot=None,
        diagram_file_asset_id=None,
        is_same_as_source=False,
        snapshot_hash="a" * 64,
        metadata_json={"semantic_context": {}},
    )
    db_session.add(snapshot)
    db_session.commit()

    result = ExperimentValidationService(db_session).validate_experiment(experiment)

    # No blocking setup errors despite the missing diagram + reference …
    assert not any(issue.module_key == "setup_methods" for issue in result.errors)
    # … but both surface as warnings.
    warning_fields = {
        issue.field_path for issue in result.warnings if issue.module_key == "setup_methods"
    }
    assert "diagram_file_asset_id" in warning_fields
    assert "reference" in warning_fields


def test_setup_methods_invalid_diagram_file_blocks_validation(active_user, db_session) -> None:
    from datetime import UTC, datetime

    from app.models.file_asset import FileAsset
    from app.models.setup_methods import ExperimentSetupSnapshot

    experiment = ExperimentRun(
        run_code="CVD-2026-SETUP-BAD-DIAGRAM",
        owner_id=active_user.id,
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date=date(2026, 6, 5),
        objective="setup diagram validation",
        quality_label=QualityLabel.SUCCESS,
    )
    db_session.add(experiment)
    db_session.commit()
    db_session.refresh(experiment)

    characterization_file = FileAsset(
        experiment_run_id=experiment.id,
        sample_id=None,
        uploaded_by_id=active_user.id,
        original_name="setup.png",
        storage_path=f"tests/{experiment.id}/setup.png",
        content_type="image/png",
        size_bytes=7,
        sha256="b" * 64,
        method="setup_diagram",
        file_category="raw",
        asset_role="characterization_file",
        metadata_json={},
    )
    db_session.add(characterization_file)
    db_session.commit()
    db_session.refresh(characterization_file)

    snapshot = ExperimentSetupSnapshot(
        experiment_run_id=experiment.id,
        setup_key_snapshot="manual:abcdef1234567890",
        setup_name_snapshot="Manual setup",
        setup_version_snapshot=1,
        apparatus_description_snapshot="Tube furnace",
        methods_text_snapshot="Methods",
        sample_placement_description_snapshot="Placement",
        reaction_flow_description_snapshot="Flow",
        unpublished_reason_snapshot="Internal",
        diagram_file_asset_id=characterization_file.id,
        is_same_as_source=False,
        confirmed_by_id=active_user.id,
        confirmed_at=datetime.now(UTC),
        snapshot_hash="a" * 64,
        metadata_json={"semantic_context": {}},
    )
    db_session.add(snapshot)
    db_session.commit()

    result = ExperimentValidationService(db_session).validate_experiment(experiment)

    assert any(
        issue.module_key == "setup_methods"
        and issue.field_path == "diagram_file_asset_id"
        and "setup diagram" in issue.message.lower()
        for issue in result.errors
    )


def test_completion_score_ignores_setup_confirmation(active_user, db_session) -> None:
    # The manual confirmation step was removed; an unconfirmed but complete setup
    # is scored the same as a confirmed one.
    from datetime import UTC, datetime

    from app.models.file_asset import FileAsset
    from app.models.setup_methods import ExperimentSetupSnapshot

    experiment = ExperimentRun(
        run_code="CVD-2026-SETUP-PARTIAL-CONFIRM",
        owner_id=active_user.id,
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date=date(2026, 6, 5),
        objective="setup confirmation score",
        quality_label=QualityLabel.SUCCESS,
    )
    db_session.add(experiment)
    db_session.commit()
    db_session.refresh(experiment)

    diagram_file = FileAsset(
        experiment_run_id=experiment.id,
        sample_id=None,
        uploaded_by_id=active_user.id,
        original_name="setup.png",
        storage_path=f"tests/{experiment.id}/valid-setup.png",
        content_type="image/png",
        size_bytes=7,
        sha256="c" * 64,
        method="setup_diagram",
        file_category="raw",
        asset_role="setup_diagram",
        metadata_json={},
    )
    db_session.add(diagram_file)
    db_session.commit()
    db_session.refresh(diagram_file)

    db_session.add(
        ExperimentSetupSnapshot(
            experiment_run_id=experiment.id,
            setup_key_snapshot="manual:abcdef1234567890",
            setup_name_snapshot="Manual setup",
            setup_version_snapshot=1,
            apparatus_description_snapshot="Tube furnace",
            methods_text_snapshot="Methods",
            sample_placement_description_snapshot="Placement",
            reaction_flow_description_snapshot="Flow",
            unpublished_reason_snapshot="Internal",
            diagram_file_asset_id=diagram_file.id,
            is_same_as_source=False,
            confirmed_by_id=None,
            confirmed_at=datetime.now(UTC),
            snapshot_hash="a" * 64,
            metadata_json={"semantic_context": {}},
        )
    )
    db_session.commit()

    result = ExperimentValidationService(db_session).validate_experiment(experiment)

    assert result.completion_score == 36


def test_completion_score_tracks_setup_methods_content_fields(active_user, db_session) -> None:
    from datetime import UTC, datetime

    from app.models.file_asset import FileAsset
    from app.models.setup_methods import ExperimentSetupSnapshot

    def create_experiment_with_setup(run_code: str, setup_overrides: dict) -> ExperimentRun:
        experiment = ExperimentRun(
            run_code=run_code,
            owner_id=active_user.id,
            experiment_type="cvd_2zone",
            material_system="MoS2",
            experiment_date=date(2026, 6, 5),
            objective=run_code,
            quality_label=QualityLabel.SUCCESS,
        )
        db_session.add(experiment)
        db_session.commit()
        db_session.refresh(experiment)

        diagram_file = FileAsset(
            experiment_run_id=experiment.id,
            sample_id=None,
            uploaded_by_id=active_user.id,
            original_name="setup.png",
            storage_path=f"tests/{experiment.id}/setup-completion.png",
            content_type="image/png",
            size_bytes=7,
            sha256="f" * 64,
            method="setup_diagram",
            file_category="raw",
            asset_role="setup_diagram",
            metadata_json={},
        )
        db_session.add(diagram_file)
        db_session.commit()
        db_session.refresh(diagram_file)

        setup_values = {
            "experiment_run_id": experiment.id,
            "setup_key_snapshot": "manual:abcdef1234567890",
            "setup_name_snapshot": "Manual setup",
            "setup_version_snapshot": 1,
            "apparatus_description_snapshot": "Tube furnace",
            "methods_text_snapshot": "Methods",
            "sample_placement_description_snapshot": "Placement",
            "reaction_flow_description_snapshot": "Flow",
            "unpublished_reason_snapshot": "Internal",
            "diagram_file_asset_id": diagram_file.id,
            "is_same_as_source": False,
            "confirmed_by_id": active_user.id,
            "confirmed_at": datetime.now(UTC),
            "snapshot_hash": "a" * 64,
            "metadata_json": {"semantic_context": {}},
        }
        setup_values.update(setup_overrides)
        db_session.add(ExperimentSetupSnapshot(**setup_values))
        db_session.commit()
        return experiment

    complete_experiment = create_experiment_with_setup("CVD-2026-SETUP-SCORE-FULL", {})
    incomplete_experiment = create_experiment_with_setup(
        "CVD-2026-SETUP-SCORE-PARTIAL",
        {
            "sample_placement_description_snapshot": "",
            "reaction_flow_description_snapshot": "",
            "unpublished_reason_snapshot": "",
            "source_setup_library_id": active_user.id,
            "is_same_as_source": False,
            "deviation_note": "",
        },
    )

    complete = ExperimentValidationService(db_session).validate_experiment(complete_experiment)
    incomplete = ExperimentValidationService(db_session).validate_experiment(incomplete_experiment)

    assert incomplete.completion_score < complete.completion_score


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
