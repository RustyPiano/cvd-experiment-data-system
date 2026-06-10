"""unify FieldDefinition field_key with Pydantic leaf names

把 5 个用扁平命名描述嵌套字段的 FieldDefinition.field_key 改为与 Pydantic
(JSON Schema) 叶子名一致，消除规范层与校验层的命名漂移：
- substrates.treatment_temperature_C → temperature_C
- substrates.treatment_duration_min  → duration_min
- substrates.treatment_power_W       → power_W
- substrates.treatment_gas           → gas
- characterization.characterization_note → note

这样 M1 的 T1.3 守卫不再需要别名映射、M5 字段字典不再需要 canonical_field 补丁。
field_key 不被任何存储 payload / 外键引用（payload_json 用嵌套结构），故仅是
spec 表内 UPDATE，安全可回滚。

Revision ID: 20260610_0028
Revises: 20260609_0027
Create Date: 2026-06-10 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260610_0028"
down_revision: str | None = "20260609_0027"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# (module_key, old_field_key, new_field_key)
_RENAMES: tuple[tuple[str, str, str], ...] = (
    ("substrates", "treatment_temperature_C", "temperature_C"),
    ("substrates", "treatment_duration_min", "duration_min"),
    ("substrates", "treatment_power_W", "power_W"),
    ("substrates", "treatment_gas", "gas"),
    ("characterization", "characterization_note", "note"),
)

_FIELDS = sa.table(
    "experiment_field_definitions",
    sa.column("module_key", sa.String()),
    sa.column("field_key", sa.String()),
)


def _rename(module_key: str, from_key: str, to_key: str) -> None:
    op.get_bind().execute(
        _FIELDS.update()
        .where(
            sa.and_(
                _FIELDS.c.module_key == module_key,
                _FIELDS.c.field_key == from_key,
            )
        )
        .values(field_key=to_key)
    )


def upgrade() -> None:
    for module_key, old_key, new_key in _RENAMES:
        _rename(module_key, old_key, new_key)


def downgrade() -> None:
    for module_key, old_key, new_key in _RENAMES:
        _rename(module_key, new_key, old_key)
