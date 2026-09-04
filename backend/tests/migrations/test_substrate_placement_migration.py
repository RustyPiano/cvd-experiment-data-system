import json
import os
from pathlib import Path

from alembic.config import Config
from sqlalchemy import create_engine, text

from alembic import command
from app.core.config import get_settings


def test_substrate_placement_migration_preserves_incomplete_legacy_pose_as_text(
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
        command.upgrade(config, "20260903_0013")
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
                                    "size_placement": {
                                        "length_mm": 5,
                                        "width_mm": 10,
                                        "placement": "face_to_face",
                                    }
                                },
                                {
                                    "size_placement": {
                                        "length_mm": 10,
                                        "width_mm": 5,
                                        "placement": "tilted",
                                        "tilt_angle_deg": 15,
                                    }
                                },
                                {
                                    "size_placement": {
                                        "length_mm": 8,
                                        "width_mm": 5,
                                        "placement": "upright",
                                    }
                                },
                            ]
                        }
                    )
                },
            )
        engine.dispose()

        command.upgrade(config, "head")
        engine = create_engine(url)
        with engine.begin() as connection:
            payload = json.loads(
                connection.scalar(text("SELECT payload_json FROM experiment_module_payloads"))
            )
        placements = [item["size_placement"] for item in payload["items"]]
        assert [item["placement"] for item in placements] == ["other"] * 3
        assert (placements[0]["length_mm"], placements[0]["width_mm"]) == (10, 5)
        assert "未记录配对衬底片" in placements[0]["placement_other"]
        assert "倾角 15°" in placements[1]["placement_other"]
        assert "未记录生长面朝向" in placements[2]["placement_other"]
    finally:
        os.environ["DATABASE_URL"] = original_url
        get_settings.cache_clear()
