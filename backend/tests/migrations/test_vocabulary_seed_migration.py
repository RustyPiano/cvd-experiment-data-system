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


def test_substrate_vocabulary_update_sets_active_options_and_disables_legacy_values() -> None:
    command.upgrade(_alembic_config(), "head")

    expected_active_values = {
        "substrate_type": [
            "硅片单抛N<100>",
            "蓝宝石单抛<0001>/<11-20>",
            "蓝宝石单抛<10-10>/<0001>",
            "蓝宝石单抛<11-20>/<0001>",
            "蓝宝石双抛C<0001>",
            "蓝宝石双抛A<11-20>",
            "蓝宝石双抛M<10-10>",
        ],
        "substrate_brand": [
            "华赫硅材料",
            "合肥科晶",
            "苏州研材微纳科技",
        ],
        "substrate_size": ["5x5", "5x8", "5x10", "10x10"],
        "substrate_treatment_method": [
            "none",
            "plasma_cleaning",
            "uv_cleaning",
            "annealing",
        ],
        "layer_count": ["1", "2", "3", "多层"],
    }
    expected_legacy_inactive = {
        ("substrate_type", "SiO2/Si"),
        ("substrate_type", "sapphire"),
        ("substrate_type", "quartz"),
        ("substrate_type", "other"),
        ("substrate_treatment_method", "solvent_cleaning"),
        ("substrate_treatment_method", "other"),
    }

    with db_session_module.engine.connect() as connection:
        for vocab_key, values in expected_active_values.items():
            rows = connection.execute(
                sa.text(
                    """
                    SELECT value
                    FROM controlled_vocabularies
                    WHERE vocab_key = :vocab_key AND is_active = 1
                    ORDER BY sort_order
                    """
                ),
                {"vocab_key": vocab_key},
            ).scalars()

            assert list(rows) == values

        inactive_rows = connection.execute(
            sa.text(
                """
                SELECT vocab_key, value
                FROM controlled_vocabularies
                WHERE is_active = 0
                """
            )
        ).all()

        field_rows = list(
            connection.execute(
                sa.text(
                    """
                    SELECT field_key, label_zh, field_type, unit, vocab_key
                    FROM experiment_field_definitions
                    WHERE module_key = 'substrates'
                      AND field_key IN ('brand', 'size_mm', 'position_mm')
                    """
                )
            ).mappings()
        )
        added_field_rows = list(
            connection.execute(
                sa.text(
                    """
                    SELECT module_key, field_key, label_zh, field_type, vocab_key
                    FROM experiment_field_definitions
                    WHERE (module_key = 'basic_info' AND field_key = 'layer_count')
                       OR (module_key = 'substrates' AND field_key = 'batch_no')
                    """
                )
            ).mappings()
        )
        furnace_field_rows = list(
            connection.execute(
                sa.text(
                    """
                    SELECT field_key
                    FROM experiment_field_definitions
                    WHERE module_key = 'furnace_program'
                    ORDER BY sort_order
                    """
                )
            ).scalars()
        )
        precursor_spin_rows = list(
            connection.execute(
                sa.text(
                    """
                    SELECT field_key, sort_order
                    FROM experiment_field_definitions
                    WHERE module_key = 'precursors'
                      AND field_key IN (
                        'spin_speed_rpm',
                        'spin_time_s',
                        'pre_spin_speed_rpm',
                        'pre_spin_time_s',
                        'preparation_time_min',
                        'mass_mg',
                        'batch_no'
                      )
                    ORDER BY sort_order
                    """
                )
            ).mappings()
        )

    assert expected_legacy_inactive.issubset(set(inactive_rows))
    field_definitions = {row["field_key"]: dict(row) for row in field_rows}
    assert field_definitions["brand"]["field_type"] == "select"
    assert field_definitions["brand"]["vocab_key"] == "substrate_brand"
    assert field_definitions["size_mm"]["field_type"] == "select"
    assert field_definitions["size_mm"]["vocab_key"] == "substrate_size"
    assert field_definitions["position_mm"]["label_zh"] == "相对温区位置"
    assert field_definitions["position_mm"]["unit"] is None
    added_field_definitions = {
        (row["module_key"], row["field_key"]): dict(row) for row in added_field_rows
    }
    assert added_field_definitions[("basic_info", "layer_count")]["label_zh"] == "层数"
    assert added_field_definitions[("basic_info", "layer_count")]["field_type"] == "select"
    assert added_field_definitions[("basic_info", "layer_count")]["vocab_key"] == "layer_count"
    assert added_field_definitions[("substrates", "batch_no")]["label_zh"] == "基底批次"
    assert added_field_definitions[("substrates", "batch_no")]["field_type"] == "text"
    assert furnace_field_rows == ["furnace_info", "placements", "zones"]
    assert [row["field_key"] for row in precursor_spin_rows] == [
        "spin_speed_rpm",
        "spin_time_s",
        "pre_spin_speed_rpm",
        "pre_spin_time_s",
        "preparation_time_min",
        "mass_mg",
        "batch_no",
    ]
    assert len({row["sort_order"] for row in precursor_spin_rows}) == len(precursor_spin_rows)


def test_substrate_vocabulary_update_preserves_custom_active_entries() -> None:
    command.downgrade(_alembic_config(), "20260423_0008")

    custom_entries = [
        ("substrate_type", "sapphire", "用户维护蓝宝石"),
        ("substrate_brand", "custom_substrate_brand", "自定义品牌"),
        ("substrate_size", "custom_substrate_size", "自定义尺寸"),
        ("substrate_treatment_method", "solvent_cleaning", "用户维护溶剂清洗"),
    ]
    with db_session_module.engine.begin() as connection:
        for index, (vocab_key, value, label_zh) in enumerate(custom_entries, start=1):
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
                    "id": f"22222222-2222-2222-2222-22222222222{index}",
                    "vocab_key": vocab_key,
                    "value": value,
                    "label_zh": label_zh,
                    "label_en": value,
                    "sort_order": 100 + index,
                    "is_active": True,
                    "metadata_json": "{}",
                },
            )

    command.upgrade(_alembic_config(), "head")

    with db_session_module.engine.connect() as connection:
        rows = connection.execute(
            sa.text(
                """
                SELECT vocab_key, value
                FROM controlled_vocabularies
                WHERE is_active = 1
                """
            )
        ).all()

    active_entries = set(rows)
    for vocab_key, value, _label_zh in custom_entries:
        assert (vocab_key, value) in active_entries


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
