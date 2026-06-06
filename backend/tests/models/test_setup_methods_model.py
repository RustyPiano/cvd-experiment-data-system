from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.experiment import ExperimentRun, QualityLabel
from app.models.file_asset import FileAsset
from app.models.setup_methods import ExperimentSetupSnapshot


def make_experiment(db_session, active_user, run_code: str) -> ExperimentRun:
    experiment = ExperimentRun(
        run_code=run_code,
        owner_id=active_user.id,
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date=date(2026, 6, 5),
        objective="setup methods model test",
        quality_label=QualityLabel.UNKNOWN,
    )
    db_session.add(experiment)
    db_session.commit()
    db_session.refresh(experiment)
    return experiment


def test_setup_snapshot_allows_draft_without_key_and_diagram(db_session, active_user) -> None:
    experiment = make_experiment(db_session, active_user, "CVD-2026-SM01")

    snapshot = ExperimentSetupSnapshot(
        experiment_run_id=experiment.id,
        setup_key_snapshot=None,
        setup_name_snapshot="Manual setup",
        setup_version_snapshot=1,
        apparatus_description_snapshot="Tube furnace with manual setup",
        methods_text_snapshot="Manual methods text",
        sample_placement_description_snapshot="Sample downstream of precursor",
        reaction_flow_description_snapshot="Ramp, hold, cool",
        unpublished_reason_snapshot="Internal protocol",
        is_same_as_source=False,
        snapshot_hash="",
        metadata_json={"semantic_context": {"pressure": "ambient"}},
    )
    db_session.add(snapshot)
    db_session.commit()
    db_session.refresh(snapshot)

    assert snapshot.setup_key_snapshot is None
    assert snapshot.diagram_file_asset_id is None


def test_setup_snapshot_is_unique_per_experiment(db_session, active_user) -> None:
    experiment = make_experiment(db_session, active_user, "CVD-2026-SM02")
    db_session.add_all(
        [
            ExperimentSetupSnapshot(
                experiment_run_id=experiment.id,
                setup_key_snapshot="manual:1111",
                setup_name_snapshot="Setup A",
                setup_version_snapshot=1,
                apparatus_description_snapshot="Apparatus",
                methods_text_snapshot="Methods",
                sample_placement_description_snapshot="Placement",
                reaction_flow_description_snapshot="Flow",
                unpublished_reason_snapshot="Internal",
                is_same_as_source=False,
                snapshot_hash="1111",
                metadata_json={},
            ),
            ExperimentSetupSnapshot(
                experiment_run_id=experiment.id,
                setup_key_snapshot="manual:2222",
                setup_name_snapshot="Setup B",
                setup_version_snapshot=1,
                apparatus_description_snapshot="Apparatus",
                methods_text_snapshot="Methods",
                sample_placement_description_snapshot="Placement",
                reaction_flow_description_snapshot="Flow",
                unpublished_reason_snapshot="Internal",
                is_same_as_source=False,
                snapshot_hash="2222",
                metadata_json={},
            ),
        ]
    )

    with pytest.raises(IntegrityError):
        db_session.commit()


def test_file_asset_defaults_to_characterization_role(db_session, active_user) -> None:
    experiment = make_experiment(db_session, active_user, "CVD-2026-SM03")
    file_asset = FileAsset(
        experiment_run_id=experiment.id,
        uploaded_by_id=active_user.id,
        original_name="raman.txt",
        storage_path="tests/raman.txt",
        size_bytes=5,
        sha256="a" * 64,
        method="Raman",
        file_category="raw",
    )
    db_session.add(file_asset)
    db_session.commit()
    db_session.refresh(file_asset)

    assert file_asset.asset_role == "characterization_file"
