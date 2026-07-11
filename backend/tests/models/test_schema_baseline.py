from sqlalchemy import inspect

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
