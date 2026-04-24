from pathlib import Path

import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.db import session as db_session_module

ALEMBIC_INI_PATH = Path(__file__).resolve().parents[2] / "alembic.ini"
ALEMBIC_SCRIPT_PATH = Path(__file__).resolve().parents[2] / "alembic"


def _alembic_config() -> Config:
    config = Config(str(ALEMBIC_INI_PATH))
    config.set_main_option("script_location", str(ALEMBIC_SCRIPT_PATH))
    return config


def test_mvp_0_2_vocabulary_seed_downgrade_preserves_preexisting_entries() -> None:
    command.downgrade(_alembic_config(), "20260423_0008")

    with db_session_module.engine.begin() as connection:
        connection.execute(
            sa.text(
                """
                INSERT INTO controlled_vocabularies (
                    id,
                    vocab_key,
                    value,
                    label_zh,
                    label_en,
                    sort_order,
                    is_active,
                    metadata_json
                )
                VALUES (
                    :id,
                    :vocab_key,
                    :value,
                    :label_zh,
                    :label_en,
                    :sort_order,
                    :is_active,
                    :metadata_json
                )
                """
            ),
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "vocab_key": "substrate_type",
                "value": "sapphire",
                "label_zh": "用户维护蓝宝石",
                "label_en": "User Sapphire",
                "sort_order": 50,
                "is_active": True,
                "metadata_json": "{}",
            },
        )

    command.upgrade(_alembic_config(), "head")
    command.downgrade(_alembic_config(), "20260423_0008")

    with db_session_module.engine.connect() as connection:
        row = connection.execute(
            sa.text(
                """
                SELECT label_zh
                FROM controlled_vocabularies
                WHERE vocab_key = :vocab_key AND value = :value
                """
            ),
            {
                "vocab_key": "substrate_type",
                "value": "sapphire",
            },
        ).one_or_none()

    assert row is not None
    assert row.label_zh == "用户维护蓝宝石"
