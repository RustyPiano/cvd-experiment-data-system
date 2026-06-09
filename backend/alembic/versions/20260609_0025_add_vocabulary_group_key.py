"""add group_key to controlled_vocabularies and backfill long vocabularies

M3 词表分组：给受控词表加 group_key，并为长词表（failure_mode / gas_label /
substrate_type）回填分组，解决「列表长 / 无分组」。

Revision ID: 20260609_0025
Revises: 20260609_0024
Create Date: 2026-06-09 00:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260609_0025"
down_revision: str | None = "20260609_0024"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# failure_mode → 分组（与 0024 的 seed 取值对应）。
FAILURE_MODE_GROUPS: dict[str, str] = {
    "no_growth": "nucleation_coverage",
    "sparse_nucleation": "nucleation_coverage",
    "low_coverage": "nucleation_coverage",
    "multilayer": "morphology",
    "discontinuous": "morphology",
    "poor_uniformity": "morphology",
    "wrong_phase": "crystallinity",
    "amorphous": "crystallinity",
    "contamination": "contamination_damage",
    "cracked": "contamination_damage",
    "equipment_fault": "equipment",
    "other": "other",
}

_VOCAB = sa.table(
    "controlled_vocabularies",
    sa.column("vocab_key", sa.String()),
    sa.column("value", sa.String()),
    sa.column("group_key", sa.String()),
)


def _gas_label_group(value: str) -> str:
    if value == "other":
        return "other"
    return "mixed" if "+" in value else "pure"


def _substrate_type_group(value: str) -> str:
    if value.startswith("硅"):
        return "silicon"
    if value.startswith("蓝宝石"):
        return "sapphire"
    return "other"


def _set_group(connection, vocab_key: str, value: str, group_key: str) -> None:
    connection.execute(
        _VOCAB.update()
        .where(sa.and_(_VOCAB.c.vocab_key == vocab_key, _VOCAB.c.value == value))
        .values(group_key=group_key)
    )


def upgrade() -> None:
    with op.batch_alter_table("controlled_vocabularies") as batch_op:
        batch_op.add_column(sa.Column("group_key", sa.String(length=64), nullable=True))

    connection = op.get_bind()

    for value, group_key in FAILURE_MODE_GROUPS.items():
        _set_group(connection, "failure_mode", value, group_key)

    for vocab_key, grouper in (
        ("gas_label", _gas_label_group),
        ("substrate_type", _substrate_type_group),
    ):
        rows = connection.execute(
            sa.select(_VOCAB.c.value).where(_VOCAB.c.vocab_key == vocab_key)
        ).all()
        for (value,) in rows:
            _set_group(connection, vocab_key, value, grouper(value))


def downgrade() -> None:
    with op.batch_alter_table("controlled_vocabularies") as batch_op:
        batch_op.drop_column("group_key")
