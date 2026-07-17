from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect

from app.db.base import Base

EXPECTED_TABLES = {
    "audit_events",
    "characterization_records",
    "experiment_module_payloads",
    "experiment_runs",
    "file_assets",
    "instrument_versions",
    "instruments",
    "material_lot_versions",
    "material_lots",
    "measured_products",
    "samples",
    "setup_versions",
    "setups",
    "users",
}

EXPECTED_EXPERIMENT_RUN_COLUMNS = {
    "id",
    "run_code",
    "owner_id",
    "schema_version",
    "material_system",
    "experiment_date",
    "objective",
    "status",
    "invalid_reason",
    "created_at",
    "updated_at",
    "submitted_at",
    "locked_at",
    "setup_ref",
    "setup_ref_version",
    "setup_ref_snapshot_json",
    "result_missing_todo",
}

EXPECTED_SAMPLE_COLUMNS = {
    "id",
    "sample_code",
    "experiment_run_id",
    "parent_sample_id",
    "role",
    "metadata_json",
    "created_at",
    "updated_at",
    "deleted_at",
    "deleted_by_id",
}

EXPECTED_INDEXES = {
    "audit_events": {
        ("ix_audit_events_actor_id", ("actor_id",), False),
        ("ix_audit_events_entity_id", ("entity_id",), False),
        ("ix_audit_events_entity_type", ("entity_type",), False),
        (
            "ix_audit_events_entity_type_entity_id",
            ("entity_type", "entity_id"),
            False,
        ),
    },
    "characterization_records": {
        ("ix_characterization_records_experiment_run_id", ("experiment_run_id",), False),
        ("ix_characterization_records_sample_id", ("sample_id",), False),
    },
    "experiment_module_payloads": {
        ("ix_experiment_module_payloads_experiment_run_id", ("experiment_run_id",), False),
    },
    "experiment_runs": {
        ("ix_experiment_runs_experiment_date", ("experiment_date",), False),
        ("ix_experiment_runs_material_system", ("material_system",), False),
        ("ix_experiment_runs_owner_id", ("owner_id",), False),
        ("ix_experiment_runs_run_code", ("run_code",), True),
        ("ix_experiment_runs_schema_version", ("schema_version",), False),
        ("ix_experiment_runs_status", ("status",), False),
    },
    "file_assets": {
        (f"ix_file_assets_{column}", (column,), False)
        for column in {
            "asset_role",
            "characterization_record_id",
            "deleted_by_id",
            "experiment_run_id",
            "file_category",
            "file_kind",
            "method",
            "sample_id",
            "sha256",
            "uploaded_by_id",
        }
    },
    "instrument_versions": {("ix_instrument_versions_entity_id", ("entity_id",), False)},
    "instruments": set(),
    "material_lot_versions": {("ix_material_lot_versions_entity_id", ("entity_id",), False)},
    "material_lots": set(),
    "measured_products": {
        ("ix_measured_products_characterization_record_id", ("characterization_record_id",), False),
        ("ix_measured_products_sample_id", ("sample_id",), False),
    },
    "samples": {
        ("ix_samples_deleted_by_id", ("deleted_by_id",), False),
        ("ix_samples_experiment_run_id", ("experiment_run_id",), False),
        ("ix_samples_role", ("role",), False),
        ("ix_samples_sample_code", ("sample_code",), True),
    },
    "setup_versions": {("ix_setup_versions_entity_id", ("entity_id",), False)},
    "setups": set(),
    "users": {("ix_users_email", ("email",), True)},
}


def test_initial_migration_builds_only_the_v2_schema(db_session) -> None:
    inspector = inspect(db_session.bind)

    assert set(inspector.get_table_names()) == EXPECTED_TABLES | {"alembic_version"}
    assert {
        column["name"] for column in inspector.get_columns("experiment_runs")
    } == EXPECTED_EXPERIMENT_RUN_COLUMNS
    assert {
        column["name"] for column in inspector.get_columns("samples")
    } == EXPECTED_SAMPLE_COLUMNS

    run_columns = {column["name"]: column for column in inspector.get_columns("experiment_runs")}
    assert run_columns["schema_version"]["nullable"] is False

    payload_columns = {
        column["name"]: column for column in inspector.get_columns("experiment_module_payloads")
    }
    assert "cvd_v2" in str(payload_columns["schema_version"]["default"])

    file_asset_fks = inspector.get_foreign_keys("file_assets")
    assert any(
        fk["constrained_columns"] == ["characterization_record_id"]
        and fk["referred_table"] == "characterization_records"
        and fk["referred_columns"] == ["id"]
        for fk in file_asset_fks
    )
    file_asset_columns = {column["name"]: column for column in inspector.get_columns("file_assets")}
    assert file_asset_columns["method"]["default"] is None

    for table, expected in EXPECTED_INDEXES.items():
        actual = {
            (index["name"], tuple(index["column_names"]), bool(index["unique"]))
            for index in inspector.get_indexes(table)
        }
        assert actual == expected, table


def test_initial_migration_matches_model_metadata(db_session) -> None:
    context = MigrationContext.configure(db_session.connection())

    differences = compare_metadata(context, Base.metadata)
    structural = [difference for difference in differences if difference[0] != "modify_type"]

    assert structural == []
