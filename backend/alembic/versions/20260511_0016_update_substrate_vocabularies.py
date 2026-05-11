"""update substrate vocabularies

Revision ID: 20260511_0016
Revises: 20260507_0015
Create Date: 2026-05-11 00:00:00.000000
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260511_0016"
down_revision: str | None = "20260507_0015"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

ACTIVE_VOCABULARIES: dict[str, list[tuple[str, str, int]]] = {
    "substrate_type": [
        ("硅片单抛N<100>", "硅片单抛N<100>", 1),
        ("蓝宝石单抛<0001>/<11-20>", "蓝宝石单抛<0001>/<11-20>", 2),
        ("蓝宝石单抛<10-10>/<0001>", "蓝宝石单抛<10-10>/<0001>", 3),
        ("蓝宝石单抛<11-20>/<0001>", "蓝宝石单抛<11-20>/<0001>", 4),
        ("蓝宝石双抛C<0001>", "蓝宝石双抛C<0001>", 5),
        ("蓝宝石双抛A<11-20>", "蓝宝石双抛A<11-20>", 6),
        ("蓝宝石双抛M<10-10>", "蓝宝石双抛M<10-10>", 7),
    ],
    "substrate_brand": [
        ("华赫硅材料", "华赫硅材料", 1),
        ("合肥科晶", "合肥科晶", 2),
        ("苏州研材微纳科技", "苏州研材微纳科技", 3),
    ],
    "substrate_size": [
        ("5x5", "5x5", 1),
        ("5x8", "5x8", 2),
        ("5x10", "5x10", 3),
        ("10x10", "10x10", 4),
    ],
    "substrate_treatment_method": [
        ("none", "无", 1),
        ("plasma_cleaning", "等离子清洗", 2),
        ("uv_cleaning", "紫外清洗", 3),
        ("annealing", "退火", 4),
    ],
}
LEGACY_VALUES_TO_DISABLE: dict[str, list[str]] = {
    "substrate_type": ["SiO2/Si", "sapphire", "quartz", "graphite", "hBN", "other"],
    "substrate_treatment_method": ["solvent_cleaning", "other"],
}
MIGRATION_METADATA = {"seed": "substrate_vocabularies_20260511_0016"}
MVP_0_2_SEED_METADATA = {"seed": "mvp_0_2_20260424_0009"}


def _payload_type() -> sa.JSON:
    return sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def _vocabulary_table() -> sa.Table:
    return sa.table(
        "controlled_vocabularies",
        sa.column("id", sa.Uuid()),
        sa.column("vocab_key", sa.String()),
        sa.column("value", sa.String()),
        sa.column("label_zh", sa.String()),
        sa.column("label_en", sa.String()),
        sa.column("sort_order", sa.Integer()),
        sa.column("is_active", sa.Boolean()),
        sa.column("metadata_json", _payload_type()),
    )


def _field_definition_table() -> sa.Table:
    return sa.table(
        "experiment_field_definitions",
        sa.column("module_key", sa.String()),
        sa.column("field_key", sa.String()),
        sa.column("label_zh", sa.String()),
        sa.column("label_en", sa.String()),
        sa.column("field_type", sa.String()),
        sa.column("unit", sa.String()),
        sa.column("vocab_key", sa.String()),
    )


def upgrade() -> None:
    vocabulary_table = _vocabulary_table()
    field_definition_table = _field_definition_table()
    connection = op.get_bind()

    for vocab_key, entries in ACTIVE_VOCABULARIES.items():
        legacy_values = LEGACY_VALUES_TO_DISABLE.get(vocab_key, [])
        if legacy_values:
            connection.execute(
                vocabulary_table.update()
                .where(
                    sa.and_(
                        vocabulary_table.c.vocab_key == vocab_key,
                        vocabulary_table.c.value.in_(legacy_values),
                        vocabulary_table.c.metadata_json == MVP_0_2_SEED_METADATA,
                    )
                )
                .values(is_active=False)
            )

        for value, label_zh, sort_order in entries:
            exists = connection.execute(
                sa.select(sa.literal(True)).where(
                    sa.exists().where(
                        sa.and_(
                            vocabulary_table.c.vocab_key == vocab_key,
                            vocabulary_table.c.value == value,
                        )
                    )
                )
            ).scalar()

            if exists:
                connection.execute(
                    vocabulary_table.update()
                    .where(
                        sa.and_(
                            vocabulary_table.c.vocab_key == vocab_key,
                            vocabulary_table.c.value == value,
                        )
                    )
                    .values(
                        label_zh=label_zh,
                        label_en=value,
                        sort_order=sort_order,
                        is_active=True,
                    )
                )
                continue

            connection.execute(
                vocabulary_table.insert().values(
                    id=uuid.uuid4(),
                    vocab_key=vocab_key,
                    value=value,
                    label_zh=label_zh,
                    label_en=value,
                    sort_order=sort_order,
                    is_active=True,
                    metadata_json=MIGRATION_METADATA,
                )
            )

    connection.execute(
        field_definition_table.update()
        .where(
            sa.and_(
                field_definition_table.c.module_key == "substrates",
                field_definition_table.c.field_key == "brand",
            )
        )
        .values(field_type="select", vocab_key="substrate_brand")
    )
    connection.execute(
        field_definition_table.update()
        .where(
            sa.and_(
                field_definition_table.c.module_key == "substrates",
                field_definition_table.c.field_key == "size_mm",
            )
        )
        .values(field_type="select", vocab_key="substrate_size")
    )
    connection.execute(
        field_definition_table.update()
        .where(
            sa.and_(
                field_definition_table.c.module_key == "substrates",
                field_definition_table.c.field_key == "position_mm",
            )
        )
        .values(label_zh="相对温区位置", label_en="Relative Zone Position", unit=None)
    )


def downgrade() -> None:
    vocabulary_table = _vocabulary_table()
    field_definition_table = _field_definition_table()
    connection = op.get_bind()

    for vocab_key, entries in ACTIVE_VOCABULARIES.items():
        values = [value for value, _label_zh, _sort_order in entries]
        connection.execute(
            vocabulary_table.delete().where(
                sa.and_(
                    vocabulary_table.c.vocab_key == vocab_key,
                    vocabulary_table.c.value.in_(values),
                    vocabulary_table.c.metadata_json == MIGRATION_METADATA,
                )
            )
        )

    for vocab_key, values in LEGACY_VALUES_TO_DISABLE.items():
        connection.execute(
            vocabulary_table.update()
            .where(
                sa.and_(
                    vocabulary_table.c.vocab_key == vocab_key,
                    vocabulary_table.c.value.in_(values),
                )
            )
            .values(is_active=True)
        )

    connection.execute(
        field_definition_table.update()
        .where(
            sa.and_(
                field_definition_table.c.module_key == "substrates",
                field_definition_table.c.field_key == "brand",
            )
        )
        .values(field_type="text", vocab_key=None)
    )
    connection.execute(
        field_definition_table.update()
        .where(
            sa.and_(
                field_definition_table.c.module_key == "substrates",
                field_definition_table.c.field_key == "size_mm",
            )
        )
        .values(field_type="text", vocab_key=None)
    )
    connection.execute(
        field_definition_table.update()
        .where(
            sa.and_(
                field_definition_table.c.module_key == "substrates",
                field_definition_table.c.field_key == "position_mm",
            )
        )
        .values(label_zh="位置", label_en="Position", unit="mm")
    )
