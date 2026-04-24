"""seed mvp 0.2 controlled vocabularies

Revision ID: 20260424_0009
Revises: 20260423_0008
Create Date: 2026-04-24 10:15:00.000000
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260424_0009"
down_revision: str | None = "20260423_0008"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

VOCABULARY_SEEDS: dict[str, list[tuple[str, str]]] = {
    "substrate_type": [
        ("SiO2/Si", "SiO2/Si"),
        ("sapphire", "蓝宝石"),
        ("quartz", "石英"),
        ("graphite", "石墨"),
        ("hBN", "hBN"),
        ("other", "其他"),
    ],
    "substrate_treatment_method": [
        ("none", "无"),
        ("plasma_cleaning", "等离子清洗"),
        ("annealing", "退火"),
        ("solvent_cleaning", "溶剂清洗"),
        ("other", "其他"),
    ],
    "gas_label": [
        ("Ar", "氩气"),
        ("H2", "氢气"),
        ("O2", "氧气"),
        ("CO2", "二氧化碳"),
        ("CO", "一氧化碳"),
        ("Ar+H2", "氩氢混合"),
        ("Ar+O2", "氩氧混合"),
        ("H2+CO2", "氢气二氧化碳混合"),
        ("Ar+CO", "氩气一氧化碳混合"),
        ("other", "其他"),
    ],
}
SEED_METADATA = {"seed": "mvp_0_2_20260424_0009"}


def upgrade() -> None:
    payload_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")
    vocabulary_table = sa.table(
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
    connection = op.get_bind()

    for vocab_key, entries in VOCABULARY_SEEDS.items():
        for sort_order, (value, label_zh) in enumerate(entries, start=1):
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
                    metadata_json=SEED_METADATA,
                )
            )


def downgrade() -> None:
    payload_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")
    vocabulary_table = sa.table(
        "controlled_vocabularies",
        sa.column("vocab_key", sa.String()),
        sa.column("value", sa.String()),
        sa.column("metadata_json", payload_type),
    )
    connection = op.get_bind()

    for vocab_key, entries in VOCABULARY_SEEDS.items():
        values = [value for value, _label_zh in entries]
        connection.execute(
            vocabulary_table.delete().where(
                sa.and_(
                    vocabulary_table.c.vocab_key == vocab_key,
                    vocabulary_table.c.value.in_(values),
                    vocabulary_table.c.metadata_json == SEED_METADATA,
                )
            )
        )
