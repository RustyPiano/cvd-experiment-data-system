import os
from pathlib import Path

from alembic.config import Config
from sqlalchemy import create_engine, text

from alembic import command
from app.core.config import get_settings


def test_existing_0004_process_channel_upgrades_to_head(tmp_path: Path) -> None:
    database = tmp_path / "migration.sqlite3"
    url = f"sqlite+pysqlite:///{database}"
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option(
        "script_location",
        str(Path(__file__).resolve().parents[2] / "alembic"),
    )
    config.set_main_option("sqlalchemy.url", url)
    original_url = os.environ["DATABASE_URL"]
    os.environ["DATABASE_URL"] = url
    get_settings.cache_clear()
    try:
        command.upgrade(config, "20260729_0004")
        engine = create_engine(url)
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO process_channels (
                        id, run_revision_id, channel_key, channel_type, source_type,
                        unit, data_kind, scalar_value, canonical_unit,
                        canonical_scalar_value, projection_status
                    ) VALUES (
                        :id, :revision, :key, 'temperature', 'measured',
                        '°C', 'scalar', 750, '°C', 750, 'ready'
                    )
                    """
                ),
                {
                    "id": "11111111111141118111111111111111",
                    "revision": "22222222222242228222222222222222",
                    "key": "legacy_temperature",
                },
            )
        command.upgrade(config, "head")
        with engine.connect() as connection:
            row = connection.execute(
                text(
                    "SELECT subject_type, subject_ref, subject_instance_ref "
                    "FROM process_channels "
                    "WHERE channel_key = 'legacy_temperature'"
                )
            ).one()
            columns = {
                item["name"]
                for item in connection.dialect.get_columns(
                    connection,
                    "process_channels",
                )
            }
    finally:
        os.environ["DATABASE_URL"] = original_url
        get_settings.cache_clear()
    assert row.subject_type == "temperature_zone"
    assert row.subject_ref == "legacy:legacy_temperature"
    assert row.subject_instance_ref == "legacy:legacy_temperature"
    assert "gas_species" not in columns
    assert "sensor_or_controller_snapshot" not in columns
