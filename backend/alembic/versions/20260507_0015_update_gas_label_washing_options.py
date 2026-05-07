"""update gas label washing options

Revision ID: 20260507_0015
Revises: 20260506_0014
Create Date: 2026-05-07 00:00:00.000000
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260507_0015"
down_revision: str | None = "20260506_0014"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

VOCAB_KEY = "gas_label"
ACTIVE_VALUES: list[tuple[str, str, int]] = [
    ("Ar", "氩气", 1),
    ("CO2", "二氧化碳", 2),
    ("O2", "氧气", 3),
    ("Ar+H2", "氩氢混合", 4),
    ("Ar+O2", "氩氧混合", 5),
    ("H2+CO2", "氢气二氧化碳混合", 6),
    ("CO+Ar", "一氧化碳氩气混合", 7),
]
LEGACY_ACTIVE_VALUES = ["H2", "CO", "Ar+CO", "other"]
MIGRATION_METADATA = {"seed": "gas_label_washing_options_20260507_0015"}


def _vocabulary_table() -> sa.Table:
    payload_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")
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


def upgrade() -> None:
    vocabulary_table = _vocabulary_table()
    connection = op.get_bind()

    connection.execute(
        vocabulary_table.update()
        .where(
            sa.and_(
                vocabulary_table.c.vocab_key == VOCAB_KEY,
                vocabulary_table.c.value.in_(LEGACY_ACTIVE_VALUES),
            )
        )
        .values(is_active=False)
    )

    for value, label_zh, sort_order in ACTIVE_VALUES:
        exists = connection.execute(
            sa.select(sa.literal(True)).where(
                sa.exists().where(
                    sa.and_(
                        vocabulary_table.c.vocab_key == VOCAB_KEY,
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
                        vocabulary_table.c.vocab_key == VOCAB_KEY,
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
                vocab_key=VOCAB_KEY,
                value=value,
                label_zh=label_zh,
                label_en=value,
                sort_order=sort_order,
                is_active=True,
                metadata_json=MIGRATION_METADATA,
            )
        )


def downgrade() -> None:
    vocabulary_table = _vocabulary_table()
    connection = op.get_bind()

    connection.execute(
        vocabulary_table.delete().where(
            sa.and_(
                vocabulary_table.c.vocab_key == VOCAB_KEY,
                vocabulary_table.c.value == "CO+Ar",
                vocabulary_table.c.metadata_json == MIGRATION_METADATA,
            )
        )
    )
    connection.execute(
        vocabulary_table.update()
        .where(
            sa.and_(
                vocabulary_table.c.vocab_key == VOCAB_KEY,
                vocabulary_table.c.value.in_(LEGACY_ACTIVE_VALUES),
            )
        )
        .values(is_active=True)
    )
