"""add vocabularies and file metadata fields

Revision ID: 20260423_0007
Revises: 20260423_0006
Create Date: 2026-04-23 10:40:00.000000
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260423_0007"
down_revision: str | None = "20260423_0006"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "file_assets",
        sa.Column("method", sa.String(length=64), nullable=False, server_default="Other"),
    )
    op.add_column(
        "file_assets",
        sa.Column("file_category", sa.String(length=32), nullable=False, server_default="raw"),
    )
    op.add_column("file_assets", sa.Column("note", sa.String(length=500), nullable=True))
    op.create_index("ix_file_assets_method", "file_assets", ["method"], unique=False)
    op.create_index("ix_file_assets_file_category", "file_assets", ["file_category"], unique=False)

    payload_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")
    op.create_table(
        "controlled_vocabularies",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("vocab_key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.String(length=128), nullable=False),
        sa.Column("label_zh", sa.String(length=128), nullable=False),
        sa.Column("label_en", sa.String(length=128), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("metadata_json", payload_type, nullable=False, server_default=sa.text("'{}'")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("vocab_key", "value", name="uq_controlled_vocabularies_key_value"),
    )
    op.create_index(
        "ix_controlled_vocabularies_is_active",
        "controlled_vocabularies",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        "ix_controlled_vocabularies_vocab_key",
        "controlled_vocabularies",
        ["vocab_key"],
        unique=False,
    )

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
    op.bulk_insert(vocabulary_table, _seed_vocabulary_rows())


def downgrade() -> None:
    op.drop_index("ix_controlled_vocabularies_vocab_key", table_name="controlled_vocabularies")
    op.drop_index("ix_controlled_vocabularies_is_active", table_name="controlled_vocabularies")
    op.drop_table("controlled_vocabularies")

    op.drop_index("ix_file_assets_file_category", table_name="file_assets")
    op.drop_index("ix_file_assets_method", table_name="file_assets")
    op.drop_column("file_assets", "note")
    op.drop_column("file_assets", "file_category")
    op.drop_column("file_assets", "method")


def _seed_vocabulary_rows() -> list[dict[str, object]]:
    seed_map = {
        "material_system": [
            ("MoS2", "MoS2"),
            ("WS2", "WS2"),
            ("WSe2", "WSe2"),
            ("MoSe2", "MoSe2"),
            ("hBN", "hBN"),
            ("graphene", "石墨烯"),
            ("other", "其他"),
        ],
        "sample_env": [
            ("clean", "洁净"),
            ("normal", "正常"),
            ("contaminated", "污染"),
            ("unknown", "未知"),
        ],
        "precursor_method": [
            ("melting", "熔融"),
            ("spin_coating", "旋涂"),
            ("powder", "粉末"),
            ("solution", "溶液"),
            ("other", "其他"),
        ],
        "substrate_role": [
            ("top", "上基底"),
            ("bottom", "下基底"),
            ("control", "对照"),
            ("product", "产物"),
        ],
        "substrate_treatment": [
            ("none", "无"),
            ("plasma_cleaning", "等离子清洗"),
            ("solvent_cleaning", "溶剂清洗"),
            ("annealing", "退火"),
            ("uv_ozone", "紫外臭氧"),
            ("other", "其他"),
        ],
        "gas": [
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
        "characterization_method": [
            ("OM", "光学显微镜"),
            ("Raman", "拉曼"),
            ("PL", "光致发光"),
            ("AFM", "原子力显微镜"),
            ("SEM", "扫描电镜"),
            ("Other", "其他"),
        ],
        "quality_label": [
            ("success", "成功"),
            ("partial", "部分成功"),
            ("failed", "失败"),
            ("unknown", "未知"),
        ],
    }

    rows: list[dict[str, object]] = []
    for vocab_key, entries in seed_map.items():
        for sort_order, (value, label_zh) in enumerate(entries, start=1):
            rows.append(
                {
                    "id": uuid.uuid4(),
                    "vocab_key": vocab_key,
                    "value": value,
                    "label_zh": label_zh,
                    "label_en": value,
                    "sort_order": sort_order,
                    "is_active": True,
                    "metadata_json": {},
                }
            )
    return rows
