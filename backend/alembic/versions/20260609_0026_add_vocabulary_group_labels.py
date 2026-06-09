"""add group label/order to controlled_vocabularies and backfill

M3 词表分组（后端标签）：分组的显示标签与排序作为后端数据，避免前端写死造成
第二套真相。给每行回填 group_label_zh/en 与 group_sort_order（同一
(vocab_key, group_key) 内一致，由守卫测试保证）。

Revision ID: 20260609_0026
Revises: 20260609_0025
Create Date: 2026-06-09 01:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260609_0026"
down_revision: str | None = "20260609_0025"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# (vocab_key, group_key) -> (label_zh, label_en, group_sort_order)
GROUP_LABELS: dict[tuple[str, str], tuple[str, str, int]] = {
    ("failure_mode", "nucleation_coverage"): ("成核与覆盖", "Nucleation & Coverage", 1),
    ("failure_mode", "morphology"): ("形貌与厚度", "Morphology & Thickness", 2),
    ("failure_mode", "crystallinity"): ("结晶质量", "Crystallinity", 3),
    ("failure_mode", "contamination_damage"): ("污染与损伤", "Contamination & Damage", 4),
    ("failure_mode", "equipment"): ("设备/工艺", "Equipment / Process", 5),
    ("failure_mode", "other"): ("其他", "Other", 6),
    ("gas_label", "pure"): ("单一气体", "Pure Gas", 1),
    ("gas_label", "mixed"): ("混合气体", "Mixed Gas", 2),
    ("gas_label", "other"): ("其他", "Other", 3),
    ("substrate_type", "silicon"): ("硅基", "Silicon", 1),
    ("substrate_type", "sapphire"): ("蓝宝石", "Sapphire", 2),
    ("substrate_type", "other"): ("其他", "Other", 3),
}

_VOCAB = sa.table(
    "controlled_vocabularies",
    sa.column("vocab_key", sa.String()),
    sa.column("group_key", sa.String()),
    sa.column("group_label_zh", sa.String()),
    sa.column("group_label_en", sa.String()),
    sa.column("group_sort_order", sa.Integer()),
)


def upgrade() -> None:
    with op.batch_alter_table("controlled_vocabularies") as batch_op:
        batch_op.add_column(sa.Column("group_label_zh", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("group_label_en", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("group_sort_order", sa.Integer(), nullable=True))

    connection = op.get_bind()
    for (vocab_key, group_key), (label_zh, label_en, sort_order) in GROUP_LABELS.items():
        connection.execute(
            _VOCAB.update()
            .where(sa.and_(_VOCAB.c.vocab_key == vocab_key, _VOCAB.c.group_key == group_key))
            .values(
                group_label_zh=label_zh,
                group_label_en=label_en,
                group_sort_order=sort_order,
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("controlled_vocabularies") as batch_op:
        batch_op.drop_column("group_sort_order")
        batch_op.drop_column("group_label_en")
        batch_op.drop_column("group_label_zh")
