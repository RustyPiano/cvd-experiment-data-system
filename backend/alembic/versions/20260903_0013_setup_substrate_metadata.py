"""support named external fields and substrate lot metadata

Revision ID: 20260903_0013
Revises: 20260903_0012
Create Date: 2026-09-03 16:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa

from alembic import op

revision: str = "20260903_0013"
down_revision: str | None = "20260903_0012"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _restore_sqlite_immutability_guards() -> None:
    if op.get_bind().dialect.name != "sqlite":
        return
    op.execute(
        """
        CREATE TRIGGER trg_material_lot_versions_immutable
        BEFORE UPDATE ON material_lot_versions
        BEGIN
            SELECT RAISE(ABORT, 'v2 entity version rows are immutable');
        END
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_material_lot_versions_immutable_delete
        BEFORE DELETE ON material_lot_versions
        BEGIN
            SELECT RAISE(ABORT, 'v2 entity version rows are immutable');
        END
        """
    )


def _legacy_parameter(name: str, value: Any, unit: str) -> dict[str, Any]:
    return {"name": name, "value": value, "unit": unit}


def _upgrade_step(step: dict[str, Any]) -> dict[str, Any]:
    step_type = step.get("type")
    parameters = step.get("parameters") if isinstance(step.get("parameters"), dict) else {}
    if step_type in {"acetone_clean", "isopropanol_clean"}:
        rewritten = {
            "type": "solvent_cleaning",
            "parameters": {
                "solvent": "acetone" if step_type == "acetone_clean" else "isopropanol",
                "cleaning_method": "not_recorded",
            },
        }
        if parameters.get("duration_min") is not None:
            rewritten["parameters"]["duration_min"] = parameters["duration_min"]
        return rewritten
    if step_type != "hydrophilic_treatment":
        return step

    method = str(parameters.get("method") or "").strip()
    duration = parameters.get("duration_min")
    normalized_method = method.casefold().replace("/", "").replace("-", "")
    if duration is not None and any(
        token in normalized_method for token in ("uv", "ozone", "o3", "紫外", "臭氧")
    ):
        return {
            "type": "uv_ozone_treatment",
            "parameters": {"duration_min": duration},
        }

    items: list[dict[str, Any]] = []
    if method:
        items.append(_legacy_parameter("method", method, "—"))
    if duration is not None:
        items.append(_legacy_parameter("duration_min", duration, "min"))
    if not items:
        items.append(_legacy_parameter("legacy_step", "亲水处理", "—"))
    return {
        "type": "other",
        "other_name": "亲水处理（旧记录）",
        "parameters": {"items": items},
    }


def _downgrade_step(step: dict[str, Any]) -> dict[str, Any]:
    step_type = step.get("type")
    parameters = step.get("parameters") if isinstance(step.get("parameters"), dict) else {}
    if step_type == "uv_ozone_treatment":
        return {
            "type": "hydrophilic_treatment",
            "parameters": {
                "method": "UV/ozone",
                "duration_min": parameters.get("duration_min"),
            },
        }
    if step_type != "solvent_cleaning":
        return step

    solvent = parameters.get("solvent")
    method = parameters.get("cleaning_method")
    if solvent in {"acetone", "isopropanol"} and method == "not_recorded":
        legacy = {
            "type": "acetone_clean" if solvent == "acetone" else "isopropanol_clean",
            "parameters": {},
        }
        if parameters.get("duration_min") is not None:
            legacy["parameters"]["duration_min"] = parameters["duration_min"]
        return legacy

    items = [
        _legacy_parameter("solvent", parameters.get("solvent_other") or solvent, "—"),
        _legacy_parameter(
            "cleaning_method",
            parameters.get("cleaning_method_other") or method,
            "—",
        ),
    ]
    if parameters.get("duration_min") is not None:
        items.append(_legacy_parameter("duration_min", parameters["duration_min"], "min"))
    return {
        "type": "other",
        "other_name": "溶剂清洗",
        "parameters": {"items": items},
    }


def _rewrite_editable_substrate_steps(*, upgrade: bool) -> None:
    bind = op.get_bind()
    table = sa.Table("experiment_module_payloads", sa.MetaData(), autoload_with=bind)
    rows = bind.execute(
        sa.select(table.c.id, table.c.payload_json).where(table.c.module_key == "substrates")
    ).mappings()
    rewrite = _upgrade_step if upgrade else _downgrade_step
    for row in rows:
        payload = row["payload_json"]
        if not isinstance(payload, dict):
            continue
        rewritten = dict(payload)
        items = []
        changed = False
        for item in payload.get("items") or []:
            if not isinstance(item, dict):
                items.append(item)
                continue
            next_item = dict(item)
            steps = item.get("pretreatment_steps")
            if isinstance(steps, list):
                next_steps = [rewrite(step) if isinstance(step, dict) else step for step in steps]
                next_item["pretreatment_steps"] = next_steps
                changed = changed or next_steps != steps
            items.append(next_item)
        if changed:
            rewritten["items"] = items
            bind.execute(
                table.update().where(table.c.id == row["id"]).values(payload_json=rewritten)
            )


def upgrade() -> None:
    with op.batch_alter_table("material_lot_versions") as batch:
        batch.alter_column(
            "batch_number",
            existing_type=sa.String(length=128),
            nullable=True,
        )
    _restore_sqlite_immutability_guards()
    _rewrite_editable_substrate_steps(upgrade=True)


def downgrade() -> None:
    bind = op.get_bind()
    missing_batch = bind.scalar(
        sa.text("SELECT COUNT(*) FROM material_lot_versions WHERE batch_number IS NULL")
    )
    if missing_batch:
        raise RuntimeError("cannot downgrade while material lots without batch numbers exist")
    _rewrite_editable_substrate_steps(upgrade=False)
    with op.batch_alter_table("material_lot_versions") as batch:
        batch.alter_column(
            "batch_number",
            existing_type=sa.String(length=128),
            nullable=False,
        )
    _restore_sqlite_immutability_guards()
