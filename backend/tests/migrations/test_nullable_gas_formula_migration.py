import os
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from alembic import command
from app.core.config import get_settings


def test_nullable_gas_formula_upgrade_and_safe_downgrade(tmp_path: Path) -> None:
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
        command.upgrade(config, "20260812_0010")
        engine = create_engine(url)
        with engine.begin() as connection:
            connection.execute(
                text("INSERT INTO material_lots (id) VALUES ('11111111111141118111111111111111')")
            )
            connection.execute(
                text(
                    "INSERT INTO material_lot_versions "
                    "(id, entity_id, version, lot_category, substance_name, "
                    "chemical_formula, batch_number, attrs) VALUES "
                    "('22222222222242228222222222222222', "
                    "'11111111111141118111111111111111', 1, "
                    "'gas_cylinder', '5% H2 in Ar', 'Ar', 'MIX-001', '{}')"
                )
            )
        command.upgrade(config, "head")
        assert next(
            item
            for item in inspect(engine).get_columns("material_lot_versions")
            if item["name"] == "chemical_formula"
        )["nullable"]
        with engine.begin() as connection:
            connection.execute(
                text("INSERT INTO material_lots (id) VALUES ('33333333333343338333333333333333')")
            )
            connection.execute(
                text(
                    "INSERT INTO material_lot_versions "
                    "(id, entity_id, version, lot_category, substance_name, "
                    "chemical_formula, batch_number, attrs) VALUES "
                    "('44444444444444448444444444444444', "
                    "'33333333333343338333333333333333', 1, "
                    "'gas_cylinder', '5% H2 in Ar', NULL, 'MIX-002', '{}')"
                )
            )
        with pytest.raises(RuntimeError, match="cannot downgrade"):
            command.downgrade(config, "20260812_0010")
    finally:
        os.environ["DATABASE_URL"] = original_url
        get_settings.cache_clear()
