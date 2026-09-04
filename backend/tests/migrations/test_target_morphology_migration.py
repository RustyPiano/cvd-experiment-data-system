import json
import os
from pathlib import Path

from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from alembic import command
from app.core.config import get_settings


def test_target_morphology_migrates_editable_payload_and_projection(tmp_path: Path) -> None:
    url = f"sqlite+pysqlite:///{tmp_path / 'migration.sqlite3'}"
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option(
        "script_location",
        str(Path(__file__).resolve().parents[2] / "alembic"),
    )
    original_url = os.environ["DATABASE_URL"]
    os.environ["DATABASE_URL"] = url
    get_settings.cache_clear()
    try:
        command.upgrade(config, "20260813_0011")
        engine = create_engine(url)
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO users (id, email, name, password_hash) VALUES "
                    "('11111111111141118111111111111111', 'user@example.com', 'User', 'hash')"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO experiment_runs "
                    "(id, run_code, owner_id, schema_version, experiment_date) VALUES "
                    "('22222222222242228222222222222222', 'CVD-MIGRATION', "
                    "'11111111111141118111111111111111', 'cvd_v2', '2026-09-03')"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO experiment_module_payloads "
                    "(id, experiment_run_id, module_key, schema_version, payload_json) VALUES "
                    "('33333333333343338333333333333333', "
                    "'22222222222242228222222222222222', 'target_product', 'cvd_v2', "
                    '\'{"dimensional_form":"sheet","coverage_state":"continuous",'
                    '"orientation":"in_plane"}\')'
                )
            )
            connection.execute(
                text(
                    "INSERT INTO run_revisions "
                    "(id, experiment_run_id, revision_number, schema_version, schema_status, "
                    "status, content_json, content_sha256, locked_by_id) VALUES "
                    "('44444444444444448444444444444444', "
                    "'22222222222242228222222222222222', 1, 'cvd_v2', 'released', "
                    "'locked', '{}', 'sha', '11111111111141118111111111111111')"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO target_specs "
                    "(id, run_revision_id, architecture_type, dimensional_form, coverage_state, "
                    "orientation) "
                    "VALUES ('55555555555545558555555555555555', "
                    "'44444444444444448444444444444444', 'single_region', 'sheet', "
                    "'continuous', 'in_plane')"
                )
            )
        engine.dispose()

        command.upgrade(config, "head")
        engine = create_engine(url)
        columns = {item["name"] for item in inspect(engine).get_columns("target_specs")}
        assert "in_plane_outline" in columns
        assert "coverage_state" not in columns
        assert "orientation" not in columns
        with engine.connect() as connection:
            payload = json.loads(
                connection.scalar(text("SELECT payload_json FROM experiment_module_payloads"))
            )
            dimensional_form = connection.scalar(text("SELECT dimensional_form FROM target_specs"))
        assert payload == {"dimensional_form": "continuous_film"}
        assert dimensional_form == "continuous_film"
        engine.dispose()

        command.downgrade(config, "20260813_0011")
        engine = create_engine(url)
        with engine.connect() as connection:
            payload = json.loads(
                connection.scalar(text("SELECT payload_json FROM experiment_module_payloads"))
            )
            row = connection.execute(
                text("SELECT dimensional_form, coverage_state, orientation FROM target_specs")
            ).one()
        assert payload == {"dimensional_form": "sheet", "coverage_state": "continuous"}
        assert row == ("sheet", "continuous", None)
    finally:
        os.environ["DATABASE_URL"] = original_url
        get_settings.cache_clear()
