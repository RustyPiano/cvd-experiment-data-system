from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect

from app.db.base import Base

SCIENTIFIC_TABLES = {
    "run_revisions",
    "run_contributors",
    "target_specs",
    "target_material_regions",
    "target_composition_relations",
    "source_loads",
    "source_load_ingredients",
    "process_segments",
    "process_channels",
    "scientific_process_events",
    "transformation_runs",
    "transformation_inputs",
    "transformation_outputs",
    "analysis_runs",
    "property_values",
    "material_assertions",
    "data_derivation_edges",
    "run_features",
}


def test_migrations_build_the_current_scientific_schema(db_session) -> None:
    inspector = inspect(db_session.bind)
    tables = set(inspector.get_table_names()) - {"alembic_version"}

    assert tables == set(Base.metadata.tables)
    assert SCIENTIFIC_TABLES.issubset(tables)

    run_columns = {column["name"]: column for column in inspector.get_columns("experiment_runs")}
    assert {
        "current_revision_id",
        "draft_supersedes_revision_id",
        "correction_reason",
    }.issubset(run_columns)
    assert run_columns["schema_version"]["nullable"] is False

    sample_columns = {column["name"] for column in inspector.get_columns("samples")}
    assert {
        "run_revision_id",
        "actual_state",
        "actual_material_summary",
        "lifecycle_state",
    }.issubset(sample_columns)

    characterization_fks = inspector.get_foreign_keys("characterization_records")
    assert any(
        fk["constrained_columns"] == ["run_revision_id"] and fk["referred_table"] == "run_revisions"
        for fk in characterization_fks
    )


def test_migrations_match_model_metadata(db_session) -> None:
    context = MigrationContext.configure(db_session.connection())
    differences = compare_metadata(context, Base.metadata)
    structural = [difference for difference in differences if difference[0] != "modify_type"]

    assert structural == []
