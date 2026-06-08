"""add precursor brand vocabulary and switch precursor brand to select

Revision ID: 20260608_0022
Revises: 20260606_0021
Create Date: 2026-06-08 00:00:00.000000
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260608_0022"
down_revision: str | None = "20260606_0021"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

PRECURSOR_BRAND_ENTRIES: list[tuple[str, str, int]] = [
    ("阿拉丁", "阿拉丁", 1),
    ("麦克林", "麦克林", 2),
    ("国药", "国药", 3),
    ("Sigma-Aldrich", "Sigma-Aldrich", 4),
    ("Alfa Aesar", "Alfa Aesar", 5),
]
MIGRATION_METADATA = {"seed": "precursor_brand_20260608_0022"}


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
        sa.column("field_type", sa.String()),
        sa.column("vocab_key", sa.String()),
    )


def upgrade() -> None:
    vocabulary_table = _vocabulary_table()
    field_definition_table = _field_definition_table()
    connection = op.get_bind()

    for value, label_zh, sort_order in PRECURSOR_BRAND_ENTRIES:
        exists = connection.execute(
            sa.select(sa.literal(True)).where(
                sa.exists().where(
                    sa.and_(
                        vocabulary_table.c.vocab_key == "precursor_brand",
                        vocabulary_table.c.value == value,
                    )
                )
            )
        ).scalar()
        if exists:
            continue
        connection.execute(
            vocabulary_table.insert().values(
                id=uuid.uuid4(),
                vocab_key="precursor_brand",
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
                field_definition_table.c.module_key == "precursors",
                field_definition_table.c.field_key == "brand",
            )
        )
        .values(field_type="select", vocab_key="precursor_brand")
    )


def downgrade() -> None:
    vocabulary_table = _vocabulary_table()
    field_definition_table = _field_definition_table()
    connection = op.get_bind()

    connection.execute(
        field_definition_table.update()
        .where(
            sa.and_(
                field_definition_table.c.module_key == "precursors",
                field_definition_table.c.field_key == "brand",
            )
        )
        .values(field_type="text", vocab_key=None)
    )

    values = [value for value, _label, _sort in PRECURSOR_BRAND_ENTRIES]
    connection.execute(
        vocabulary_table.delete().where(
            sa.and_(
                vocabulary_table.c.vocab_key == "precursor_brand",
                vocabulary_table.c.value.in_(values),
                vocabulary_table.c.metadata_json == MIGRATION_METADATA,
            )
        )
    )
