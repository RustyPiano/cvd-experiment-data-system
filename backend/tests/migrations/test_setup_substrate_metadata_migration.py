import json
import os
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from alembic import command
from app.core.config import get_settings


def test_substrate_metadata_migration_rewrites_editable_steps_and_allows_no_batch(
    tmp_path: Path,
) -> None:
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
        command.upgrade(config, "20260903_0012")
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
                    "'22222222222242228222222222222222', 'substrates', 'cvd_v2', :payload)"
                ),
                {
                    "payload": json.dumps(
                        {
                            "items": [
                                {
                                    "pretreatment_steps": [
                                        {
                                            "type": "acetone_clean",
                                            "parameters": {"duration_min": 5},
                                        },
                                        {
                                            "type": "hydrophilic_treatment",
                                            "parameters": {
                                                "method": "UV/O3",
                                                "duration_min": 10,
                                            },
                                        },
                                    ]
                                }
                            ]
                        }
                    )
                },
            )
        engine.dispose()

        command.upgrade(config, "head")
        engine = create_engine(url)
        batch_column = next(
            item
            for item in inspect(engine).get_columns("material_lot_versions")
            if item["name"] == "batch_number"
        )
        assert batch_column["nullable"]
        with engine.begin() as connection:
            payload = json.loads(
                connection.scalar(text("SELECT payload_json FROM experiment_module_payloads"))
            )
            connection.execute(
                text("INSERT INTO material_lots (id) VALUES ('44444444444444448444444444444444')")
            )
            connection.execute(
                text(
                    "INSERT INTO material_lot_versions "
                    "(id, entity_id, version, lot_category, substance_name, "
                    "chemical_formula, batch_number, attrs) VALUES "
                    "('55555555555545558555555555555555', "
                    "'44444444444444448444444444444444', 1, "
                    "'substrate', '蓝宝石', 'Al2O3', NULL, "
                    '\'{"batch_number_availability":"batch_number_not_provided",'
                    '"production_date":"2026-08"}\')'
                )
            )
        steps = payload["items"][0]["pretreatment_steps"]
        assert steps == [
            {
                "type": "solvent_cleaning",
                "parameters": {
                    "solvent": "acetone",
                    "cleaning_method": "not_recorded",
                    "duration_min": 5,
                },
            },
            {
                "type": "uv_ozone_treatment",
                "parameters": {"duration_min": 10},
            },
        ]
        with pytest.raises(RuntimeError, match="cannot downgrade"):
            command.downgrade(config, "20260903_0012")
    finally:
        os.environ["DATABASE_URL"] = original_url
        get_settings.cache_clear()
