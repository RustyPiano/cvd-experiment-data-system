"""add spin time field definitions

Revision ID: 20260513_0018
Revises: 20260512_0017
Create Date: 2026-05-13 00:00:00.000000
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260513_0018"
down_revision: str | None = "20260512_0017"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

MIGRATION_METADATA = {"seed": "precursor_spin_time_20260513_0018"}
UPGRADED_SORT_ORDERS = {
    "pre_spin_speed_rpm": 9,
    "preparation_time_min": 11,
    "mass_mg": 12,
    "batch_no": 13,
}
DOWNGRADED_SORT_ORDERS = {
    "pre_spin_speed_rpm": 8,
    "preparation_time_min": 9,
    "mass_mg": 10,
    "batch_no": 11,
}
FIELD_DEFINITIONS: list[dict[str, object]] = [
    {
        "field_key": "spin_time_s",
        "module_key": "precursors",
        "label_zh": "旋涂时长",
        "label_en": "Spin Time",
        "field_type": "number",
        "unit": "s",
        "inheritable": True,
        "sort_order": 8,
    },
    {
        "field_key": "pre_spin_time_s",
        "module_key": "precursors",
        "label_zh": "预旋涂时长",
        "label_en": "Pre-spin Time",
        "field_type": "number",
        "unit": "s",
        "inheritable": True,
        "sort_order": 10,
    },
]


def _payload_type() -> sa.JSON:
    return sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


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
    field_definition_table = _field_definition_table()
    connection = op.get_bind()

    for field_key, sort_order in UPGRADED_SORT_ORDERS.items():
        connection.execute(
            field_definition_table.update()
            .where(
                sa.and_(
                    field_definition_table.c.module_key == "precursors",
                    field_definition_table.c.field_key == field_key,
                )
            )
            .values(sort_order=sort_order)
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
    field_definition_table = _field_definition_table()
    connection = op.get_bind()

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

    for field_key, sort_order in DOWNGRADED_SORT_ORDERS.items():
        connection.execute(
            field_definition_table.update()
            .where(
                sa.and_(
                    field_definition_table.c.module_key == "precursors",
                    field_definition_table.c.field_key == field_key,
                )
            )
            .values(sort_order=sort_order)
        )
