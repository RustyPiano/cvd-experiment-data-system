"""reconcile furnace_program field definitions to canonical

背景：2026-05-12 的 "hard-cut furnace program canonical model" 重构就地改写了
种子迁移 0014，把炉温程序字段从老的扁平 7 字段
（zones/zone_index/precursor_placed/temperature_program/time_min/temperature_C/note）
收敛为新的 3 字段嵌套模型（furnace_info/placements/zones）。

但"就地改迁移文件"不会重跑在已建好的库上——凡是在该重构之前建立、之后只做增量
升级的库（含线上库），其 experiment_field_definitions 表仍残留老的 7 条炉温字段，
导致字段总数显示为 72 而非标准的 68，且 admin 字段词典 / 标准导出与代码模型不一致。

本迁移对 module_key='furnace_program' 做"全删重插"，把字段定义无条件收敛到 canonical
3 字段。该操作幂等且自愈：
- 老库（7 条）→ 删 7 插 3 → 68
- 全新库（已是 3 条）→ 删 3 插 3 → 不变
字段定义表无任何外键指向（已核），删/插安全；不触碰任何实验数据（payloads）。

Revision ID: 20260611_0031
Revises: 20260611_0030
Create Date: 2026-06-11 00:00:00.000000
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260611_0031"
down_revision: str | None = "20260611_0030"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

MODULE_KEY = "furnace_program"
# 与 0014 现行种子保持一致，使被修复的库与全新安装逐字节等价。
SEED_METADATA = {"seed": "field_definitions_20260506_0014"}

# 当前标准（canonical）——与 0014 的 furnace_program 段一致。
CANONICAL_FIELDS: list[dict[str, object]] = [
    {
        "field_key": "furnace_info",
        "label_zh": "炉子信息",
        "label_en": "Furnace Info",
        "field_type": "object",
        "required": True,
        "inheritable": True,
        "sort_order": 0,
    },
    {
        "field_key": "placements",
        "label_zh": "前驱体放置",
        "label_en": "Precursor Placements",
        "field_type": "array",
        "inheritable": True,
        "sort_order": 1,
    },
    {
        "field_key": "zones",
        "label_zh": "温区程序",
        "label_en": "Zone Programs",
        "field_type": "array",
        "required": True,
        "inheritable": True,
        "sort_order": 2,
    },
]

# 重构前的遗留模型——仅供 downgrade 还原。
LEGACY_FIELDS: list[dict[str, object]] = [
    {
        "field_key": "zones",
        "label_zh": "温区列表",
        "label_en": "Furnace Zones",
        "field_type": "array",
        "required": True,
        "inheritable": True,
        "sort_order": 0,
    },
    {
        "field_key": "zone_index",
        "label_zh": "温区编号",
        "label_en": "Zone Index",
        "field_type": "number",
        "inheritable": True,
        "sort_order": 1,
    },
    {
        "field_key": "precursor_placed",
        "label_zh": "放置前驱体",
        "label_en": "Precursor Placed",
        "field_type": "boolean",
        "inheritable": True,
        "sort_order": 2,
    },
    {
        "field_key": "temperature_program",
        "label_zh": "温度程序",
        "label_en": "Temperature Program",
        "field_type": "array",
        "inheritable": True,
        "sort_order": 3,
    },
    {
        "field_key": "time_min",
        "label_zh": "时间",
        "label_en": "Time",
        "field_type": "number",
        "unit": "min",
        "inheritable": True,
        "sort_order": 4,
    },
    {
        "field_key": "temperature_C",
        "label_zh": "温度",
        "label_en": "Temperature",
        "field_type": "number",
        "unit": "℃",
        "inheritable": True,
        "sort_order": 5,
    },
    {
        "field_key": "note",
        "label_zh": "备注",
        "label_en": "Note",
        "field_type": "textarea",
        "inheritable": False,
        "sort_order": 6,
    },
]


def _table() -> sa.Table:
    payload_type = sa.JSON().with_variant(
        postgresql.JSONB(astext_type=sa.Text()), "postgresql"
    )
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


def _replace(fields: list[dict[str, object]]) -> None:
    table = _table()
    connection = op.get_bind()
    # 全删该模块所有字段定义，再写入目标集合 —— 与起始状态无关，结果确定。
    connection.execute(table.delete().where(table.c.module_key == MODULE_KEY))
    for entry in fields:
        connection.execute(
            table.insert().values(
                id=uuid.uuid4(),
                field_key=entry["field_key"],
                module_key=MODULE_KEY,
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
                metadata_json=SEED_METADATA,
            )
        )


def upgrade() -> None:
    _replace(CANONICAL_FIELDS)


def downgrade() -> None:
    _replace(LEGACY_FIELDS)
