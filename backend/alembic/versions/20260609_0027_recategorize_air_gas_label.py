"""recategorize gas_label 'air' from pure to mixed

M3 词表分组修正：air（空气）本质是混合气体，0025 的启发式把无 "+" 且非 other 的值
一律归为 pure，导致 air 被错分到「单一气体」。这里把它移到 mixed 分组（标签与
0026 的 mixed 一致），保持 (vocab_key, group_key) 标签一致性（T1.5 守卫）。

Revision ID: 20260609_0027
Revises: 20260609_0026
Create Date: 2026-06-09 02:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260609_0027"
down_revision: str | None = "20260609_0026"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

_VOCAB = sa.table(
    "controlled_vocabularies",
    sa.column("vocab_key", sa.String()),
    sa.column("value", sa.String()),
    sa.column("group_key", sa.String()),
    sa.column("group_label_zh", sa.String()),
    sa.column("group_label_en", sa.String()),
    sa.column("group_sort_order", sa.Integer()),
)

# (group_key, label_zh, label_en, sort_order) —— 与 0026 中 gas_label 分组保持一致。
_MIXED = ("mixed", "混合气体", "Mixed Gas", 2)
_PURE = ("pure", "单一气体", "Pure Gas", 1)


def _set_group(group_key: str, label_zh: str, label_en: str, sort_order: int) -> None:
    op.get_bind().execute(
        _VOCAB.update()
        .where(sa.and_(_VOCAB.c.vocab_key == "gas_label", _VOCAB.c.value == "air"))
        .values(
            group_key=group_key,
            group_label_zh=label_zh,
            group_label_en=label_en,
            group_sort_order=sort_order,
        )
    )


def upgrade() -> None:
    _set_group(*_MIXED)


def downgrade() -> None:
    _set_group(*_PURE)
