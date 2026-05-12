"""add layer count and substrate batch fields

Revision ID: 20260512_0017
Revises: 20260511_0016
Create Date: 2026-05-12 00:00:00.000000
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260512_0017"
down_revision: str | None = "20260511_0016"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

MIGRATION_METADATA = {"seed": "layer_count_substrate_batch_20260512_0017"}
LAYER_COUNT_VALUES: list[tuple[str, str, int]] = [
    ("1", "1", 1),
    ("2", "2", 2),
    ("3", "3", 3),
    ("多层", "多层", 4),
]
FIELD_DEFINITIONS: list[dict[str, object]] = [
    {
        "field_key": "layer_count",
        "module_key": "basic_info",
        "label_zh": "层数",
        "label_en": "Layer Count",
        "field_type": "select",
        "vocab_key": "layer_count",
        "sort_order": 6,
    },
    {
        "field_key": "batch_no",
        "module_key": "substrates",
        "label_zh": "基底批次",
        "label_en": "Substrate Batch",
        "field_type": "text",
        "sort_order": 5,
    },
]


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
        sa.column("metadata_json", _payload_type()),
    )


def upgrade() -> None:
    vocabulary_table = _vocabulary_table()
    field_definition_table = _field_definition_table()
    connection = op.get_bind()

    for value, label_zh, sort_order in LAYER_COUNT_VALUES:
        exists = connection.execute(
            sa.select(sa.literal(True)).where(
                sa.exists().where(
                    sa.and_(
                        vocabulary_table.c.vocab_key == "layer_count",
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
                        vocabulary_table.c.vocab_key == "layer_count",
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
                vocab_key="layer_count",
                value=value,
                label_zh=label_zh,
                label_en=value,
                sort_order=sort_order,
                is_active=True,
                metadata_json=MIGRATION_METADATA,
            )
        )

    for entry in FIELD_DEFINITIONS:
        exists = connection.execute(
            sa.select(sa.literal(True)).where(
                sa.exists().where(
                    sa.and_(
                        field_definition_table.c.module_key == entry["module_key"],
                        field_definition_table.c.field_key == entry["field_key"],
                    )
                )
            )
        ).scalar()
        values = {
            "label_zh": entry["label_zh"],
            "label_en": entry["label_en"],
            "field_type": entry["field_type"],
            "unit": entry.get("unit"),
            "required": entry.get("required", False),
            "default_strategy": entry.get("default_strategy"),
            "inheritable": entry.get("inheritable", False),
            "vocab_key": entry.get("vocab_key"),
            "sort_order": entry["sort_order"],
            "is_active": True,
        }
        if exists:
            connection.execute(
                field_definition_table.update()
                .where(
                    sa.and_(
                        field_definition_table.c.module_key == entry["module_key"],
                        field_definition_table.c.field_key == entry["field_key"],
                    )
                )
                .values(**values)
            )
            continue

        connection.execute(
            field_definition_table.insert().values(
                id=uuid.uuid4(),
                field_key=entry["field_key"],
                module_key=entry["module_key"],
                metadata_json=MIGRATION_METADATA,
                **values,
            )
        )


def downgrade() -> None:
    vocabulary_table = _vocabulary_table()
    field_definition_table = _field_definition_table()
    connection = op.get_bind()

    connection.execute(
        vocabulary_table.delete().where(
            sa.and_(
                vocabulary_table.c.vocab_key == "layer_count",
                vocabulary_table.c.value.in_(
                    [value for value, _label_zh, _sort_order in LAYER_COUNT_VALUES]
                ),
                vocabulary_table.c.metadata_json == MIGRATION_METADATA,
            )
        )
    )
    for entry in FIELD_DEFINITIONS:
        connection.execute(
            field_definition_table.delete().where(
                sa.and_(
                    field_definition_table.c.module_key == entry["module_key"],
                    field_definition_table.c.field_key == entry["field_key"],
                    field_definition_table.c.metadata_json == MIGRATION_METADATA,
                )
            )
        )
