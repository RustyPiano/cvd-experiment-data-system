"""seed failure_mode vocabulary and result_summary failure field definitions

把扁平 quality_label 升级为可分析的失败模型 (M2)：
- seed 受控词表 failure_mode (v0.1 草案)
- 为 result_summary 增加 failure_modes / failure_detail 两条字段定义

Revision ID: 20260609_0024
Revises: 20260608_0023
Create Date: 2026-06-09 00:00:00.000000
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260609_0024"
down_revision: str | None = "20260608_0023"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# failure_mode v0.1 草案：(value, label_zh)，sort_order 按分组顺序（分组列见 M3）。
FAILURE_MODE_SEEDS: list[tuple[str, str]] = [
    ("no_growth", "无生长"),
    ("sparse_nucleation", "成核稀疏"),
    ("low_coverage", "覆盖率低"),
    ("multilayer", "多层"),
    ("discontinuous", "不连续/孤岛"),
    ("poor_uniformity", "不均匀"),
    ("wrong_phase", "物相错误"),
    ("amorphous", "非晶"),
    ("contamination", "沾污/杂质"),
    ("cracked", "开裂/破损"),
    ("equipment_fault", "设备故障"),
    ("other", "其他"),
]

FIELD_DEFINITIONS: list[dict[str, object]] = [
    {
        "field_key": "failure_modes",
        "module_key": "result_summary",
        "label_zh": "失败模式",
        "label_en": "Failure Modes",
        "field_type": "multi_select",
        "required": False,
        "vocab_key": "failure_mode",
        "sort_order": 10,
    },
    {
        "field_key": "failure_detail",
        "module_key": "result_summary",
        "label_zh": "失败说明",
        "label_en": "Failure Detail",
        "field_type": "textarea",
        "required": False,
        "sort_order": 11,
    },
]

VOCAB_METADATA = {"seed": "failure_mode_v0_1_20260609_0024"}
FIELD_METADATA = {"seed": "failure_fields_20260609_0024"}


def _vocab_table(payload_type):
    return sa.table(
        "controlled_vocabularies",
        sa.column("id", sa.Uuid()),
        sa.column("vocab_key", sa.String()),
        sa.column("value", sa.String()),
        sa.column("label_zh", sa.String()),
        sa.column("label_en", sa.String()),
        sa.column("sort_order", sa.Integer()),
        sa.column("is_active", sa.Boolean()),
        sa.column("metadata_json", payload_type),
    )


def _field_table(payload_type):
    return sa.table(
        "experiment_field_definitions",
        sa.column("id", sa.Uuid()),
        sa.column("field_key", sa.String()),
        sa.column("module_key", sa.String()),
        sa.column("label_zh", sa.String()),
        sa.column("label_en", sa.String()),
        sa.column("field_type", sa.String()),
        sa.column("unit", sa.String()),
        sa.column("required", sa.Boolean()),
        sa.column("default_strategy", sa.String()),
        sa.column("inheritable", sa.Boolean()),
        sa.column("vocab_key", sa.String()),
        sa.column("sort_order", sa.Integer()),
        sa.column("is_active", sa.Boolean()),
        sa.column("metadata_json", payload_type),
    )


def upgrade() -> None:
    payload_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")
    connection = op.get_bind()

    vocab_table = _vocab_table(payload_type)
    for sort_order, (value, label_zh) in enumerate(FAILURE_MODE_SEEDS, start=1):
        exists = connection.execute(
            sa.select(sa.literal(True)).where(
                sa.exists().where(
                    sa.and_(
                        vocab_table.c.vocab_key == "failure_mode",
                        vocab_table.c.value == value,
                    )
                )
            )
        ).scalar()
        if exists:
            continue
        connection.execute(
            vocab_table.insert().values(
                id=uuid.uuid4(),
                vocab_key="failure_mode",
                value=value,
                label_zh=label_zh,
                label_en=value,
                sort_order=sort_order,
                is_active=True,
                metadata_json=VOCAB_METADATA,
            )
        )

    field_table = _field_table(payload_type)
    for entry in FIELD_DEFINITIONS:
        exists = connection.execute(
            sa.select(sa.literal(True)).where(
                sa.exists().where(
                    sa.and_(
                        field_table.c.module_key == entry["module_key"],
                        field_table.c.field_key == entry["field_key"],
                    )
                )
            )
        ).scalar()
        if exists:
            continue
        connection.execute(
            field_table.insert().values(
                id=uuid.uuid4(),
                field_key=entry["field_key"],
                module_key=entry["module_key"],
                label_zh=entry["label_zh"],
                label_en=entry.get("label_en"),
                field_type=entry.get("field_type", "text"),
                unit=entry.get("unit"),
                required=entry.get("required", False),
                default_strategy=entry.get("default_strategy"),
                inheritable=entry.get("inheritable", False),
                vocab_key=entry.get("vocab_key"),
                sort_order=entry["sort_order"],
                is_active=True,
                metadata_json=FIELD_METADATA,
            )
        )


def downgrade() -> None:
    payload_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")
    connection = op.get_bind()

    field_table = _field_table(payload_type)
    connection.execute(
        field_table.delete().where(
            sa.and_(
                field_table.c.module_key == "result_summary",
                field_table.c.field_key.in_([entry["field_key"] for entry in FIELD_DEFINITIONS]),
                field_table.c.metadata_json == FIELD_METADATA,
            )
        )
    )

    vocab_table = _vocab_table(payload_type)
    connection.execute(
        vocab_table.delete().where(
            sa.and_(
                vocab_table.c.vocab_key == "failure_mode",
                vocab_table.c.metadata_json == VOCAB_METADATA,
            )
        )
    )
