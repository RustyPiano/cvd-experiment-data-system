"""create field definitions table

Revision ID: 20260506_0013
Revises: 20260428_0012
Create Date: 2026-05-06 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260506_0013"
down_revision: str | None = "20260428_0012"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    payload_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")
    op.create_table(
        "experiment_field_definitions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "field_key",
            sa.String(length=128),
            nullable=False,
            comment="字段标识，如 species, indoor_temperature_C",
        ),
        sa.Column(
            "module_key",
            sa.String(length=64),
            nullable=False,
            comment="所属模块，如 precursors, environment",
        ),
        sa.Column(
            "label_zh",
            sa.String(length=128),
            nullable=False,
            comment="中文名，如 物种, 室内温度",
        ),
        sa.Column(
            "label_en",
            sa.String(length=128),
            nullable=True,
            comment="英文名，如 Species, Indoor Temperature",
        ),
        sa.Column(
            "field_type",
            sa.String(length=32),
            nullable=False,
            server_default="text",
            comment=(
                "字段类型：text, number, boolean, select, textarea, date, multi_select, array"
            ),
        ),
        sa.Column(
            "unit",
            sa.String(length=32),
            nullable=True,
            comment="单位，如 ℃, sccm, mg, rpm",
        ),
        sa.Column(
            "required",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment="是否必填",
        ),
        sa.Column(
            "default_strategy",
            sa.String(length=64),
            nullable=True,
            comment="默认值策略：empty, inherit, last_used, recipe",
        ),
        sa.Column(
            "inheritable",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment="是否可从 Recipe 或上次实验继承",
        ),
        sa.Column(
            "vocab_key",
            sa.String(length=64),
            nullable=True,
            comment="关联的受控词表 key，如 material_system, substrate_type",
        ),
        sa.Column(
            "sort_order",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
            comment="排序顺序",
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
            comment="是否启用",
        ),
        sa.Column(
            "metadata_json",
            payload_type,
            nullable=False,
            server_default=sa.text("'{}'"),
            comment="扩展元数据，如 validation range, conditional rules",
        ),
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
        comment="字段词典：定义每个模块中字段的元数据",
    )
    op.create_index(
        op.f("ix_experiment_field_definitions_is_active"),
        "experiment_field_definitions",
        ["is_active"],
    )
    op.create_index(
        "uq_field_definitions_module_key",
        "experiment_field_definitions",
        ["module_key", "field_key"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "uq_field_definitions_module_key",
        table_name="experiment_field_definitions",
    )
    op.drop_index(
        op.f("ix_experiment_field_definitions_is_active"),
        table_name="experiment_field_definitions",
    )
    op.drop_table("experiment_field_definitions")
