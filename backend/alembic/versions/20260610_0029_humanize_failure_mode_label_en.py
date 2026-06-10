"""humanize failure_mode label_en

0024 把 failure_mode 的 label_en 直接设成了原始 key（如 "no_growth"）。这里改为
可读英文短语，使对外字段字典里的英文标签更专业。down 还原为原始 key。

Revision ID: 20260610_0029
Revises: 20260610_0028
Create Date: 2026-06-10 02:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260610_0029"
down_revision: str | None = "20260610_0028"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# value -> 可读英文标签
_LABELS_EN: dict[str, str] = {
    "no_growth": "No Growth",
    "sparse_nucleation": "Sparse Nucleation",
    "low_coverage": "Low Coverage",
    "multilayer": "Multilayer",
    "discontinuous": "Discontinuous / Islands",
    "poor_uniformity": "Poor Uniformity",
    "wrong_phase": "Wrong Phase",
    "amorphous": "Amorphous",
    "contamination": "Contamination",
    "cracked": "Cracked / Damaged",
    "equipment_fault": "Equipment Fault",
    "other": "Other",
}

_VOCAB = sa.table(
    "controlled_vocabularies",
    sa.column("vocab_key", sa.String()),
    sa.column("value", sa.String()),
    sa.column("label_en", sa.String()),
)


def _set_label(value: str, label_en: str) -> None:
    op.get_bind().execute(
        _VOCAB.update()
        .where(sa.and_(_VOCAB.c.vocab_key == "failure_mode", _VOCAB.c.value == value))
        .values(label_en=label_en)
    )


def upgrade() -> None:
    for value, label_en in _LABELS_EN.items():
        _set_label(value, label_en)


def downgrade() -> None:
    # 还原为原始 key（与 0024 的初始 seed 一致）。
    for value in _LABELS_EN:
        _set_label(value, value)
